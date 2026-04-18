/**
 * OpenAI-Compatible Adapter
 *
 * 用于 Ollama、LM Studio、vLLM 等 OpenAI 兼容端点。
 * 假设端点支持 OpenAI 风格的 /models 和 /chat/completions。
 */

import OpenAI from 'openai';
import type { LLMConfig } from '../../../shared/protocol.js';
import type { LlmAdapter, LlmChatRequest, LlmStreamEvent, ChatMessage, ToolDefinition } from '../types.js';

const DEFAULT_BASE_URL = 'http://localhost:11434/v1/';

export class OpenAICompatibleAdapter implements LlmAdapter {
  async *streamChat(config: LLMConfig, req: LlmChatRequest): AsyncIterable<LlmStreamEvent> {
    const baseURL = config.baseUrl || DEFAULT_BASE_URL;
    const client = new OpenAI({ apiKey: config.apiKey || 'ollama', baseURL });
    const openaiMessages = this.convertMessages(req.systemPrompt, req.messages);
    const tools = req.tools?.length ? this.convertTools(req.tools) : undefined;

    const stream = await client.chat.completions.create({
      model: req.model,
      messages: openaiMessages,
      ...(tools ? { tools } : {}),
      stream: true,
    });

    const toolCallFragments = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: 'text', text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallFragments.has(tc.index)) {
            toolCallFragments.set(tc.index, { id: tc.id || '', name: '', arguments: '' });
          }
          const existing = toolCallFragments.get(tc.index)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        }
      }
    }

    for (const tc of toolCallFragments.values()) {
      yield { type: 'tool_call', id: tc.id, name: tc.name, argumentsJson: tc.arguments };
    }

    yield { type: 'done' };
  }

  async listModels(config: LLMConfig): Promise<string[]> {
    const baseURL = config.baseUrl || DEFAULT_BASE_URL;
    const client = new OpenAI({ apiKey: config.apiKey || 'ollama', baseURL });

    try {
      const response = await client.models.list();
      const models: string[] = [];
      for await (const model of response) {
        models.push(model.id);
      }
      return models.sort();
    } catch (error: any) {
      throw new Error(`获取模型列表失败: ${error?.message || String(error)}`);
    }
  }

  private convertMessages(systemPrompt: string, messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          tool_call_id: msg.toolCallId!,
          content: msg.content || '',
        });
      } else if (msg.role === 'assistant' && msg.toolCalls?.length) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.argumentsJson },
          })),
        });
      } else {
        result.push({
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content || '',
        });
      }
    }

    return result;
  }

  private convertTools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}