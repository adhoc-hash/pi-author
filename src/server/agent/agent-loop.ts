/**
 * Agent Loop
 *
 * Manages the conversation with the LLM, handles tool calls,
 * and streams responses back to the client via callbacks.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
import { CardState } from '../card/state.js';
import { buildSystemPrompt } from './system-prompt.js';
import { AGENT_TOOLS } from './tools.js';
import { getClient, getModel } from '../llm/provider.js';
import type { EntryCategory } from '../card/schema.js';
import type { ChatCompletionPreset, PromptEntry } from '../preset/schema.js';
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
  private history: ChatCompletionMessageParam[] = [];
  private cardState: CardState;
  private callbacks: AgentCallbacks;

  constructor(cardState: CardState, callbacks: AgentCallbacks) {
    this.cardState = cardState;
    this.callbacks = callbacks;
  }

  /** Get current conversation history length for potential compaction */
  getHistoryLength(): number {
    return this.history.length;
  }

  /** Reset conversation history */
  resetHistory() {
    this.history = [];
  }

  /**
   * Process a user message: send to LLM, handle tool calls, stream response.
   */
  async processMessage(userMessage: string): Promise<void> {
    console.log(`[AgentLoop] processMessage called with: "${userMessage.substring(0, 50)}..."`);
    const client = getClient();
    if (!client) {
      this.callbacks.onError('LLM未配置。请在设置中配置API Key。');
      return;
    }

    // Add user message to history
    this.history.push({ role: 'user', content: userMessage });

    // Build system prompt with current card state
    const systemPrompt = buildSystemPrompt(this.cardState.getCardSummary());

    try {
      await this.runAgentLoop(client, systemPrompt);
    } catch (error: any) {
      const msg = error?.message || String(error);
      this.callbacks.onError(`LLM请求失败: ${msg}`);
    }
  }

  /**
   * 将预设中的 prompts 转换为消息格式
   */
  private buildPresetMessages(preset: ChatCompletionPreset): ChatCompletionMessageParam[] {
    const activePrompts = getActivePrompts(preset.prompts);
    const sortedPrompts = sortPromptsByOrder(activePrompts);

    const messages: ChatCompletionMessageParam[] = [];

    for (const prompt of sortedPrompts) {
      // 跳过空内容的 prompt
      if (!prompt.content?.trim()) continue;

      messages.push({
        role: prompt.role as 'system' | 'user' | 'assistant',
        content: prompt.content,
      });
    }

    return messages;
  }

  private async runAgentLoop(client: OpenAI, systemPrompt: string): Promise<void> {
    const model = getModel();
    let continueLoop = true;

    while (continueLoop) {
      continueLoop = false;

      // 构建消息：系统提示 + 预设prompts + 历史对话
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
      ];

      // 如果有预设，插入预设的 prompts
      const preset = this.callbacks.getPreset?.();
      if (preset) {
        const presetMessages = this.buildPresetMessages(preset);
        messages.push(...presetMessages);
      }

      messages.push(...this.history);

      let fullContent = '';
      let toolCalls: ChatCompletionMessageToolCall[] = [];
      // We don't know if this iteration has tool calls until streaming is done,
      // so we always stream, but will handle dedup on the client side if needed.
      // Better approach: do a non-streaming first pass check... but that's wasteful.
      // Instead: we collect everything, then decide what to send.

      try {
        const stream = await client.chat.completions.create({
          model,
          messages,
          tools: AGENT_TOOLS,
          stream: true,
        });

        // Accumulate tool call fragments
        const toolCallFragments: Map<number, {
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = new Map();

        // Buffer chunks instead of sending immediately
        const chunks: string[] = [];

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            fullContent += delta.content;
            chunks.push(delta.content);
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (!toolCallFragments.has(tc.index)) {
                toolCallFragments.set(tc.index, {
                  id: tc.id || '',
                  type: 'function' as const,
                  function: { name: '', arguments: '' },
                });
              }
              const existing = toolCallFragments.get(tc.index)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.function.name += tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            }
          }
        }

        toolCalls = Array.from(toolCallFragments.values());

        // Now decide: if this is a tool-call iteration, DON'T stream to client.
        // If this is the final response (no tool calls), send everything.
        console.log(`[AgentLoop] Finished OpenAI stream. Iteration toolCalls=${toolCalls.length}, chunks=${chunks.length}`);
        
        if (toolCalls.length === 0 && chunks.length > 0) {
          console.log(`[AgentLoop] Sending chunks to client... fullContent length: ${fullContent.length}`);
          // Final response — stream all buffered chunks to client
          this.callbacks.onStreamStart();
          for (const c of chunks) {
            this.callbacks.onStreamChunk(c);
          }
          this.callbacks.onStreamEnd();
          console.log(`[AgentLoop] Finished sending chunks to client.`);
        } else if (toolCalls.length === 0 && chunks.length === 0) {
          // Empty final response — still notify client
          this.callbacks.onStreamStart();
          this.callbacks.onStreamEnd();
        }
        // If toolCalls.length > 0, we intentionally skip streaming text to avoid duplicates
      } catch (error: any) {
        console.error(`[AgentLoop] Error:`, error);
        this.callbacks.onError(`LLM streaming error: ${error?.message || String(error)}`);
        return;
      }

      // Add assistant message to history
      const assistantMsg: any = { role: 'assistant' };
      if (fullContent) assistantMsg.content = fullContent;
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      this.history.push(assistantMsg);

      // Execute tool calls if any
      if (toolCalls.length > 0) {
        console.log(`[AgentLoop] Processing ${toolCalls.length} tool calls...`);
        for (const tc of toolCalls) {
          const name = tc.function.name;
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = {};
          }

          this.callbacks.onToolCall(name, args);
          const result = this.executeTool(name, args);
          this.callbacks.onToolResult(name, result);
          this.callbacks.onCardUpdated();

          this.history.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          });
        }

        // Continue the loop so the agent can respond after tool execution
        continueLoop = true;
      }
    }

    // Simple compaction: if history is very long, summarize older messages
    if (this.history.length > 40) {
      this.compactHistory();
    }
  }

  /**
   * Execute a single tool call and return the result string.
   */
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
          .map((e) => `[ID:${e.id}] [${e.category || '未分类'}] ${e.label} ${e.enabled ? '✅' : '❌'}\n  ${e.contentPreview}`)
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

  /**
   * Simple compaction: keep last 20 messages, summarize the rest.
   */
  private compactHistory() {
    if (this.history.length <= 20) return;

    const toSummarize = this.history.slice(0, this.history.length - 20);
    const kept = this.history.slice(this.history.length - 20);

    // Create a simple summary
    const userMessages = toSummarize
      .filter((m) => m.role === 'user')
      .map((m) => (typeof m.content === 'string' ? m.content : '').slice(0, 100))
      .join('; ');

    const summaryMsg: ChatCompletionMessageParam = {
      role: 'user',
      content: `[对话历史摘要: 之前的对话中，用户提到了: ${userMessages}. 这些讨论已经反映在当前的卡片状态中。]`,
    };

    this.history = [summaryMsg, ...kept];
  }
}
