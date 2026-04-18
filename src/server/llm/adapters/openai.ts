/**
 * OpenAI Adapter
 */

import OpenAI from 'openai';
import type { LLMConfig } from '../../../shared/protocol.js';
import type { LlmAdapter, LlmChatRequest, LlmStreamEvent, ChatMessage, ToolDefinition } from '../types.js';

export class OpenAIAdapter implements LlmAdapter {
  async *streamChat(config: LLMConfig, req: LlmChatRequest): AsyncIterable<LlmStreamEvent> {
    const client = new OpenAI({ apiKey: config.apiKey });
    const openaiMessages = this.convertMessages(req.systemPrompt, req.messages);
    const tools = req.tools?.length ? this.convertTools(req.tools) : undefined;

    const stream = await client.chat.completions.create({
      model: req.model,
      messages: openaiMessages,
      ...(tools ? { tools } : {}),
      stream: true,
    });

    // tool_calls 碎片拼装
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
    const client = new OpenAI({ apiKey: config.apiKey });
    const models: string[] = [];
    for await (const model of client.models.list()) {
      if (!model.id.includes('embedding') &&
          !model.id.includes('whisper') &&
          !model.id.includes('tts') &&
          !model.id.includes('davinci') &&
          !model.id.includes('babbage')) {
        models.push(model.id);
      }
    }
    return models.sort();
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