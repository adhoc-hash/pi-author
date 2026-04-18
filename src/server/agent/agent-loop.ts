/**
 * Agent Loop
 *
 * 管理与 LLM 的对话，处理工具调用，
 * 通过回调将响应流式传回客户端。
 */

import { CardState } from '../card/state.js';
import { buildSystemPrompt } from './system-prompt.js';
import { AGENT_TOOLS } from './tools.js';
import { getCurrentConfig, getDefaultModel } from '../llm/provider.js';
import { streamChat } from '../llm/service.js';
import type { ChatMessage, LlmStreamEvent, ToolCall } from '../llm/types.js';
import type { LLMConfig } from '../../shared/protocol.js';
import type { EntryCategory } from '../card/schema.js';
import type { ChatCompletionPreset } from '../preset/schema.js';
import { getActivePrompts, sortPromptsByOrder } from '../preset/schema.js';

export interface AgentCallbacks {
  onStreamStart: () => void;
  onStreamChunk: (content: string) => void;
  onStreamEnd: () => void;
  onToolCall: (name: string, args: Record<string, any>) => void;
  onToolResult: (name: string, summary: string) => void;
  onCardUpdated: () => void;
  onError: (message: string) => void;
  /** 获取当前预设（可选） */
  getPreset?: () => ChatCompletionPreset | null;
}

export class AgentLoop {
  private history: ChatMessage[] = [];
  private cardState: CardState;
  private callbacks: AgentCallbacks;

  constructor(cardState: CardState, callbacks: AgentCallbacks) {
    this.cardState = cardState;
    this.callbacks = callbacks;
  }

  getHistoryLength(): number {
    return this.history.length;
  }

  resetHistory() {
    this.history = [];
  }

  async processMessage(userMessage: string): Promise<void> {
    console.log(`[AgentLoop] processMessage called with: "${userMessage.substring(0, 50)}..."`);
    const config = getCurrentConfig();
    if (!config?.apiKey) {
      this.callbacks.onError('LLM未配置。请在设置中配置API Key。');
      return;
    }

    this.history.push({ role: 'user', content: userMessage });
    const systemPrompt = buildSystemPrompt(this.cardState.getCardSummary());

    try {
      await this.runAgentLoop(config, systemPrompt);
    } catch (error: any) {
      const msg = error?.message || String(error);
      this.callbacks.onError(`LLM请求失败: ${msg}`);
    }
  }

  private buildPresetMessages(preset: ChatCompletionPreset): ChatMessage[] {
    const activePrompts = getActivePrompts(preset.prompts);
    const sortedPrompts = sortPromptsByOrder(activePrompts);

    const messages: ChatMessage[] = [];

    for (const prompt of sortedPrompts) {
      if (!prompt.content?.trim()) continue;
      messages.push({
        role: prompt.role as 'system' | 'user' | 'assistant',
        content: prompt.content,
      });
    }

    return messages;
  }

  private async runAgentLoop(config: LLMConfig, systemPrompt: string): Promise<void> {
    let continueLoop = true;
    // 最终轮的文本缓冲：有 tool call 时先缓冲，等最终轮一次性流式推送
    let pendingChunks: string[] = [];

    while (continueLoop) {
      continueLoop = false;

      // 构建消息：系统提示 + 预设prompts + 历史对话
      const messages: ChatMessage[] = [];

      const preset = this.callbacks.getPreset?.();
      if (preset) {
        const presetMessages = this.buildPresetMessages(preset);
        messages.push(...presetMessages);
      }

      messages.push(...this.history);

      let fullContent = '';
      const toolCalls: ToolCall[] = [];
      const chunks: string[] = [];

      try {
        const eventStream = await streamChat(config, {
          model: config.model || getDefaultModel(config.providerType),
          systemPrompt,
          messages,
          tools: AGENT_TOOLS,
        });

        for await (const event of eventStream) {
          switch (event.type) {
            case 'text':
              fullContent += event.text;
              chunks.push(event.text);
              break;
            case 'tool_call':
              toolCalls.push({
                id: event.id,
                name: event.name,
                argumentsJson: event.argumentsJson,
              });
              break;
            case 'done':
              break;
          }
        }

        console.log(`[AgentLoop] Stream finished. toolCalls=${toolCalls.length}, chunks=${chunks.length}`);
      } catch (error: any) {
        console.error(`[AgentLoop] Error:`, error);
        this.callbacks.onError(`LLM streaming error: ${error?.message || String(error)}`);
        return;
      }

      // 有 tool call 时，本轮 text 缓冲到 pendingChunks（不发给客户端）
      // 无 tool call 时，本轮 text 连同之前缓冲的 pendingChunks 一起流式推送
      if (toolCalls.length > 0) {
        pendingChunks.push(...chunks);
      } else {
        const allChunks = [...pendingChunks, ...chunks];
        pendingChunks = [];

        if (allChunks.length > 0) {
          this.callbacks.onStreamStart();
          for (const c of allChunks) {
            this.callbacks.onStreamChunk(c);
          }
          this.callbacks.onStreamEnd();
        }
      }

      // 写入 assistant 消息到历史
      const assistantMsg: ChatMessage = { role: 'assistant' };
      if (fullContent) assistantMsg.content = fullContent;
      if (toolCalls.length > 0) assistantMsg.toolCalls = toolCalls;
      this.history.push(assistantMsg);

      // 执行工具调用
      if (toolCalls.length > 0) {
        console.log(`[AgentLoop] Processing ${toolCalls.length} tool calls...`);
        for (const tc of toolCalls) {
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(tc.argumentsJson);
          } catch {
            args = {};
          }

          this.callbacks.onToolCall(tc.name, args);
          const result = this.executeTool(tc.name, args);
          this.callbacks.onToolResult(tc.name, result);
          this.callbacks.onCardUpdated();

          this.history.push({
            role: 'tool',
            toolCallId: tc.id,
            content: result,
          });
        }

        continueLoop = true;
      }
    }

    if (this.history.length > 40) {
      this.compactHistory();
    }
  }

  private executeTool(name: string, args: Record<string, any>): string {
    switch (name) {
      case 'update_card_meta': {
        this.cardState.updateMeta(args.field, args.value);
        return `已更新 ${args.field}: ${JSON.stringify(args.value)}`;
      }

      case 'add_entry': {
        const entry = this.cardState.addEntry(
          args.category as EntryCategory,
          args.label,
          args.content,
        );
        return `已添加entry [${args.category}] "${args.label}" (ID: ${entry.id})`;
      }

      case 'update_entry': {
        const { id, ...updates } = args;
        const entry = this.cardState.updateEntry(id, updates);
        if (!entry) return `未找到ID为 ${id} 的entry`;
        return `已更新entry ID ${id}: ${Object.keys(updates).join(', ')}`;
      }

      case 'delete_entry': {
        const ok = this.cardState.deleteEntry(args.id);
        return ok ? `已删除entry ID ${args.id}` : `未找到ID为 ${args.id} 的entry`;
      }

      case 'list_entries': {
        const entries = this.cardState.listEntries();
        if (entries.length === 0) return '当前没有任何entries。';
        return entries
          .map((e) => `[ID:${e.id}] [${e.category || '未分类'}] ${e.label} ${e.enabled ? '✅' : '❌'}\n ${e.contentPreview}`)
          .join('\n\n');
      }

      case 'set_first_mes': {
        this.cardState.setFirstMes(args.content);
        return '已设置开场白。';
      }

      case 'add_alternate_greeting': {
        const idx = this.cardState.addAlternateGreeting(args.content);
        return `已添加备选开场白 #${idx + 1}。`;
      }

      case 'get_card_summary': {
        return this.cardState.getCardSummary();
      }

      default:
        return `未知tool: ${name}`;
    }
  }

  private compactHistory() {
    if (this.history.length <= 20) return;

    const toSummarize = this.history.slice(0, this.history.length - 20);
    const kept = this.history.slice(this.history.length - 20);

    const userMessages = toSummarize
      .filter((m) => m.role === 'user')
      .map((m) => (m.content || '').slice(0, 100))
      .join('; ');

    const summaryMsg: ChatMessage = {
      role: 'user',
      content: `[对话历史摘要: 之前的对话中，用户提到了: ${userMessages}. 这些讨论已经反映在当前的卡片状态中。]`,
    };

    this.history = [summaryMsg, ...kept];
  }
}
