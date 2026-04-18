/**
 * Anthropic Adapter
 *
 * 使用 @anthropic-ai/sdk 原生 API。
 * system 消息单独提取，tool_result 转 user block，tool_calls 转 tool_use block。
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMConfig } from '../../../shared/protocol.js';
import type { LlmAdapter, LlmChatRequest, LlmStreamEvent, ChatMessage, ToolDefinition } from '../types.js';

export class AnthropicAdapter implements LlmAdapter {
  async *streamChat(config: LLMConfig, req: LlmChatRequest): AsyncIterable<LlmStreamEvent> {
    const client = new Anthropic({ apiKey: config.apiKey });
    const anthropicMessages = this.convertMessages(req.messages);
    const tools = req.tools?.length ? this.convertTools(req.tools) : undefined;

    const stream = client.messages.stream({
      model: req.model,
      max_tokens: 4096,
      system: req.systemPrompt || undefined,
      messages: anthropicMessages,
      ...(tools ? { tools } : {}),
    });

    // 收集 tool_use blocks（流式中不完整，需要 finalMessage）
    const toolUseBlocks: Array<{ id: string; name: string; input: any }> = [];

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta' && event.delta.text) {
          yield { type: 'text', text: event.delta.text };
        }
      }
    }

    // 从 finalMessage 获取完整的 tool_use blocks
    const finalMessage = await stream.finalMessage();
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') {
        toolUseBlocks.push({ id: block.id, name: block.name, input: block.input });
      }
    }

    for (const tu of toolUseBlocks) {
      yield {
        type: 'tool_call',
        id: tu.id,
        name: tu.name,
        argumentsJson: JSON.stringify(tu.input),
      };
    }

    yield { type: 'done' };
  }

  async listModels(config: LLMConfig): Promise<string[]> {
    const client = new Anthropic({ apiKey: config.apiKey });
    const models: string[] = [];
    for await (const model of client.models.list()) {
      models.push(model.id);
    }
    return models.sort();
  }

  private convertMessages(messages: ChatMessage[]): Anthropic.Messages.MessageParam[] {
    const result: Anthropic.Messages.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // system 通过顶层参数传递

      if (msg.role === 'tool') {
        result.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.toolCallId || '',
            content: msg.content || '',
          }],
        });
        continue;
      }

      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        const content: Anthropic.Messages.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          let input: any = {};
          try { input = JSON.parse(tc.argumentsJson); } catch {}
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input,
          });
        }
        result.push({ role: 'assistant', content });
        continue;
      }

      // Anthropic 要求 user/assistant 严格交替，确保当前角色与上一条不同
      const targetRole = msg.role === 'assistant' ? 'assistant' as const : 'user' as const;
      const lastRole = result.length > 0 ? result[result.length - 1].role : null;

      if (lastRole === targetRole && targetRole === 'user') {
        // 合并到上一条 user 消息
        const last = result[result.length - 1];
        if (typeof last.content === 'string') {
          last.content = [{ type: 'text', text: last.content }, { type: 'text', text: msg.content || '' }];
        } else if (Array.isArray(last.content)) {
          last.content.push({ type: 'text', text: msg.content || '' });
        }
      } else {
        result.push({ role: targetRole, content: msg.content || '' });
      }
    }

    // 确保第一条消息是 user
    if (result.length > 0 && result[0].role !== 'user') {
      result.unshift({ role: 'user', content: '(对话开始)' });
    }

    return result;
  }

  private convertTools(tools: ToolDefinition[]): Anthropic.Messages.Tool[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
    }));
  }
}