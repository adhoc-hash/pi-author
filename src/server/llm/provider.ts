/**
 * LLM Provider Configuration
 *
 * 纯配置持久化。请求发送由 LlmService + adapters 负责。
 */

import type { LLMConfig, ProviderType } from '../../shared/protocol.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.pi-author');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_MODELS: Record<ProviderType, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.5-flash',
  'openai-compatible': 'default',
};

export function loadConfig(): LLMConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const config = JSON.parse(raw) as LLMConfig;
      return config;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export function saveConfig(config: LLMConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

let currentConfig: LLMConfig | null = null;

export function getCurrentConfig(): LLMConfig | null {
  return currentConfig;
}

export function setCurrentConfig(config: LLMConfig): void {
  currentConfig = config;
}

export function getDefaultModel(providerType: ProviderType): string {
  return DEFAULT_MODELS[providerType];
}
