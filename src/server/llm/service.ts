/**
 * LLM Service
 *
 * 按 providerType 选 adapter，暴露 streamChat() 和 listModels()。
 */

import type { LLMConfig, ProviderType } from '../../shared/protocol.js';
import type { LlmAdapter, LlmChatRequest, LlmStreamEvent } from './types.js';
import { OpenAIAdapter } from './adapters/openai.js';
import { AnthropicAdapter } from './adapters/anthropic.js';
import { GoogleAdapter } from './adapters/google.js';
import { OpenAICompatibleAdapter } from './adapters/openai-compatible.js';

const adapters: Record<ProviderType, LlmAdapter> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  google: new GoogleAdapter(),
  'openai-compatible': new OpenAICompatibleAdapter(),
};

export function getAdapter(providerType: ProviderType): LlmAdapter {
  return adapters[providerType];
}

export async function streamChat(
  config: LLMConfig,
  req: LlmChatRequest,
): Promise<AsyncIterable<LlmStreamEvent>> {
  const adapter = getAdapter(config.providerType);
  return adapter.streamChat(config, req);
}

export async function listModels(config: LLMConfig): Promise<string[]> {
  const adapter = getAdapter(config.providerType);
  return adapter.listModels(config);
}
