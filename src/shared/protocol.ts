/**
 * WebSocket Protocol – shared types between client and server
 */

import type { CharacterCardV3, LorebookEntry, EntryCategory } from '../server/card/schema.js';

// ─── LLM Configuration ───

export type ProviderType = 'anthropic' | 'openai' | 'google' | 'openai-compatible';

export interface LLMConfig {
  providerType: ProviderType;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

// ─── Client → Server Messages ───

export type ClientMessage =
  | { type: 'chat'; content: string }
  | { type: 'edit_entry'; entryId: number; updates: Partial<LorebookEntry> }
  | { type: 'add_entry'; category: EntryCategory; label: string; content: string }
  | { type: 'delete_entry'; entryId: number }
  | { type: 'edit_meta'; field: string; value: any }
  | { type: 'set_first_mes'; content: string }
  | { type: 'add_alternate_greeting'; content: string }
  | { type: 'import_card'; card: CharacterCardV3 }
  | { type: 'export_card' }
  | { type: 'new_card' }
  | { type: 'update_llm_config'; config: LLMConfig };

// ─── Server → Client Messages ───

export type ServerMessage =
  | { type: 'stream_start' }
  | { type: 'stream_chunk'; content: string }
  | { type: 'stream_end' }
  | { type: 'tool_call'; name: string; args: Record<string, any> }
  | { type: 'tool_result'; name: string; summary: string }
  | { type: 'card_updated'; card: CharacterCardV3 }
  | { type: 'error'; message: string }
  | { type: 'connected'; card: CharacterCardV3; config: LLMConfig | null }
  | { type: 'export_ready'; card: CharacterCardV3 };

// ─── Chat Message (for history display) ───

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: Array<{ name: string; summary: string }>;
}
