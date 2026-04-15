/**
 * LLM Provider Configuration
 *
 * Uses the OpenAI SDK's compatible client to support:
 * - OpenAI
 * - Anthropic (via OpenAI-compatible proxy or native)
 * - Google (via OpenAI-compatible endpoint)
 * - Any OpenAI-compatible endpoint (vLLM, LM Studio, etc.)
 */

import OpenAI from 'openai';
import type { LLMConfig, ProviderType } from '../../shared/protocol.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.pi-author');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/** Default model per provider */
const DEFAULT_MODELS: Record<ProviderType, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.5-flash',
  'openai-compatible': 'default',
};

/** Default base URLs per provider (when applicable) */
const DEFAULT_BASE_URLS: Record<ProviderType, string | undefined> = {
  anthropic: undefined, // uses anthropic SDK default
  openai: undefined,    // uses openai SDK default
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  'openai-compatible': 'http://localhost:11434/v1/', // common ollama default
};

let currentConfig: LLMConfig | null = null;
let client: OpenAI | null = null;

/**
 * Load config from disk if available.
 */
export function loadConfig(): LLMConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      currentConfig = JSON.parse(raw) as LLMConfig;
      return currentConfig;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Save config to disk.
 */
export function saveConfig(config: LLMConfig) {
  currentConfig = config;
  client = null; // force re-creation
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get or create the OpenAI-compatible client based on current config.
 */
export function getClient(): OpenAI | null {
  if (!currentConfig?.apiKey) return null;
  if (client) return client;

  const baseURL = currentConfig.baseUrl || DEFAULT_BASE_URLS[currentConfig.providerType];

  client = new OpenAI({
    apiKey: currentConfig.apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  return client;
}

/**
 * Get the model to use for the current provider.
 */
export function getModel(): string {
  return currentConfig?.model || DEFAULT_MODELS[currentConfig?.providerType ?? 'openai'];
}

/**
 * Get the current LLM config.
 */
export function getCurrentConfig(): LLMConfig | null {
  return currentConfig;
}
