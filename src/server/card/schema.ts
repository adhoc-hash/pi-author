/**
 * CCv3 Character Card Schema
 * Derived from SPEC_V3.md and sample cards (clk-030, 年梦馨)
 */

// ─── Lorebook Entry ───

export interface LorebookEntry {
  id: number;
  keys: string[];
  secondary_keys: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  insertion_order: number;
  enabled: boolean;
  position: 'before_char' | 'after_char';
  use_regex: boolean;
  extensions: LorebookEntryExtensions;
}

export interface LorebookEntryExtensions {
  position: number; // 0=before_char, 1=after_char@depth, 4=after_char
  exclude_recursion: boolean;
  display_index: number;
  probability: number;
  useProbability: boolean;
  depth: number;
  selectiveLogic: number;
  outlet_name: string;
  group: string;
  group_override: boolean;
  group_weight: number;
  prevent_recursion: boolean;
  delay_until_recursion: boolean;
  scan_depth: number | null;
  match_whole_words: boolean | null;
  use_group_scoring: boolean;
  case_sensitive: boolean | null;
  automation_id: string;
  role: number;
  vectorized: boolean;
  sticky: number;
  cooldown: number;
  delay: number;
  match_persona_description: boolean;
  match_character_description: boolean;
  match_character_personality: boolean;
  match_character_depth_prompt: boolean;
  match_scenario: boolean;
  match_creator_notes: boolean;
  triggers: string[];
  ignore_budget: boolean;
}

export interface Lorebook {
  entries: LorebookEntry[];
  name: string;
}

// ─── Card Data ───

export interface CardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  alternate_greetings: string[];
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  tags: string[];
  creator: string;
  character_version: string;
  extensions: {
    talkativeness: string;
    fav: boolean;
    world: string;
    depth_prompt: {
      prompt: string;
      depth: number;
      role: string;
    };
    regex_scripts: any[];
    [key: string]: any;
  };
  character_book: Lorebook;
  group_only_greetings?: string[];
}

// ─── Top-level Card ───

export interface CharacterCardV3 {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creatorcomment: string;
  avatar: string;
  talkativeness: string;
  fav: boolean;
  tags: string[];
  spec: 'chara_card_v3';
  spec_version: '3.0';
  data: CardData;
  create_date: string;
}

// ─── Entry Categories ───

export type EntryCategory =
  | 'world'
  | 'character'
  | 'user'
  | 'rule'
  | 'style'
  | 'ui'
  | 'event';

/** Comment prefix → category mapping */
export const CATEGORY_PREFIXES: Record<EntryCategory, string> = {
  world: '[世界观]',
  character: '[角色]',
  user: '[{{user}}]',
  rule: '[规则]',
  style: '[文风]',
  ui: '[界面]',
  event: '[事件]',
};

/** Category → display info */
export const CATEGORY_INFO: Record<EntryCategory, { icon: string; label: string }> = {
  world: { icon: '🌍', label: '世界观' },
  character: { icon: '👤', label: '角色' },
  user: { icon: '🎮', label: '{{user}}' },
  rule: { icon: '📜', label: '规则' },
  style: { icon: '🎨', label: '文风' },
  ui: { icon: '📊', label: '界面' },
  event: { icon: '🎲', label: '事件' },
};

/**
 * Detect the category of an entry from its comment prefix.
 */
export function detectEntryCategory(comment: string): EntryCategory | null {
  for (const [cat, prefix] of Object.entries(CATEGORY_PREFIXES)) {
    if (comment.startsWith(prefix)) {
      return cat as EntryCategory;
    }
  }
  return null;
}

/**
 * Get display name by stripping the category prefix from comment.
 */
export function getEntryDisplayName(comment: string): string {
  for (const prefix of Object.values(CATEGORY_PREFIXES)) {
    if (comment.startsWith(prefix)) {
      return comment.slice(prefix.length).trim();
    }
  }
  return comment;
}
