/**
 * LLM 统一类型定义
 *
 * 内部使用的请求/响应/事件类型，不依赖任何 provider SDK。
 */

import type { LLMConfig } from '../../shared/protocol.js';

/** 内部工具定义（不再绑 OpenAI ChatCompletionTool） */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required?: string[];
  };
}

/** 工具调用结果 */
export interface ToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

/** 聊天消息（内部统一格式） */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

/** 统一聊天请求 */
export interface LlmChatRequest {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
}

/** 统一流式事件 */
export type LlmStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; argumentsJson: string }
  | { type: 'done' };

/** Provider adapter 接口 */
export interface LlmAdapter {
  /** 发起流式聊天，返回统一事件流 */
  streamChat(config: LLMConfig, req: LlmChatRequest): AsyncIterable<LlmStreamEvent>;
  /** 获取可用模型列表 */
  listModels(config: LLMConfig): Promise<string[]>;
}