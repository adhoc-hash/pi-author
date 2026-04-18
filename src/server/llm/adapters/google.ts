/**
 * Google Gemini Adapter
 *
 * 使用 @google/genai 原生 API。
 * system prompt 通过 config.systemInstruction 传递，
 * tool 定义转成 functionDeclarations，
 * functionCall/functionResponse 按 Google 格式处理。
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { LLMConfig } from '../../../shared/protocol.js';
import type { LlmAdapter, LlmChatRequest, LlmStreamEvent, ChatMessage, ToolDefinition } from '../types.js';

export class GoogleAdapter implements LlmAdapter {
  async *streamChat(config: LLMConfig, req: LlmChatRequest): AsyncIterable<LlmStreamEvent> {
    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const contents = this.convertMessages(req.messages);
    const genConfig: Record<string, any> = {};

    if (req.systemPrompt) {
      genConfig.systemInstruction = req.systemPrompt;
    }

    if (req.tools?.length) {
      genConfig.tools = [{
        functionDeclarations: req.tools.map(t => this.convertTool(t)),
      }];
    }

    const stream = await ai.models.generateContentStream({
      model: req.model,
      contents,
      config: genConfig,
    });

    let toolCallIndex = 0;

    for await (const chunk of stream) {
      const candidate = chunk.candidates?.[0];
      if (!candidate?.content?.parts) continue;

      for (const part of candidate.content.parts) {
        if (part.text) {
          yield { type: 'text', text: part.text };
        }

        if (part.functionCall) {
          yield {
            type: 'tool_call',
            id: `fc_${part.functionCall.name ?? 'unknown'}_${toolCallIndex++}`,
            name: part.functionCall.name ?? 'unknown',
            argumentsJson: JSON.stringify(part.functionCall.args || {}),
          };
        }
      }
    }

    yield { type: 'done' };
  }

  async listModels(config: LLMConfig): Promise<string[]> {
    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const response = await ai.models.list();
    const models: string[] = [];
    for await (const model of response) {
      const name = (model.name ?? '').replace('models/', '');
      if (name && !name.includes('embedding') && !name.includes('aqa')) {
        models.push(name);
      }
    }
    return models.sort();
  }

  private convertMessages(messages: ChatMessage[]): Array<{ role: string; parts: any[] }> {
    const contents: Array<{ role: string; parts: any[] }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // system 通过 systemInstruction 传递

      if (msg.role === 'tool') {
        // 找对应的 tool_call 来获取 function name
        const funcName = this.findToolCallName(messages, msg.toolCallId);
        const parts: any[] = [{
          functionResponse: {
            name: funcName || 'unknown',
            response: { result: msg.content || '' },
          },
        }];

        // functionResponse 需要跟在 model 的 functionCall 后面，角色为 'function'
        // Google SDK 要求 tool response 放在 user role 下
        const lastContent = contents.length > 0 ? contents[contents.length - 1] : null;
        if (lastContent && lastContent.role === 'user') {
          lastContent.parts.push(...parts);
        } else {
          contents.push({ role: 'user', parts });
        }
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: any[] = [];

      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          let args: any = {};
          try { args = JSON.parse(tc.argumentsJson); } catch {}
          parts.push({
            functionCall: { name: tc.name, args },
          });
        }
        if (msg.content) {
          parts.unshift({ text: msg.content });
        }
      } else {
        parts.push({ text: msg.content || '' });
      }

      contents.push({ role, parts });
    }

    // 确保第一条是 user
    if (contents.length > 0 && contents[0].role !== 'user') {
      contents.unshift({ role: 'user', parts: [{ text: '(对话开始)' }] });
    }

    return contents;
  }

  private findToolCallName(messages: ChatMessage[], toolCallId?: string): string | null {
    if (!toolCallId) return null;
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        const tc = msg.toolCalls.find(t => t.id === toolCallId);
        if (tc) return tc.name;
      }
    }
    return null;
  }

  private convertTool(tool: ToolDefinition): any {
    const properties: Record<string, any> = {};
    for (const [key, val] of Object.entries(tool.parameters.properties)) {
      const prop: any = {
        type: this.mapType(val.type),
      };
      if (val.description) prop.description = val.description;
      if (val.enum) prop.enum = val.enum;
      if (val.items) prop.items = { type: this.mapType(val.items.type) };
      properties[key] = prop;
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: Type.OBJECT,
        properties,
        required: tool.parameters.required,
      },
    };
  }

  private mapType(tsType: string): any {
    switch (tsType) {
      case 'string': return Type.STRING;
      case 'number': return Type.NUMBER;
      case 'integer': return Type.INTEGER;
      case 'boolean': return Type.BOOLEAN;
      case 'array': return Type.ARRAY;
      default: return Type.STRING;
    }
  }
}