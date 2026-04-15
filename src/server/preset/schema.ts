/**
 * SillyTavern Chat Completion Preset Schema
 * 对话补全预设类型定义
 */

// ─── Prompt Entry ───

export type MessageRole = 'system' | 'user' | 'assistant';

export interface PromptEntry {
  /** 唯一标识符 */
  identifier: string;
  /** 显示名称 */
  name: string;
  /** 消息角色 */
  role: MessageRole;
  /** 提示词内容 */
  content: string;
  /** 是否为系统提示 */
  system_prompt: boolean;
  /** 是否为标记位（用于定位） */
  marker?: boolean;
  /** 是否启用 */
  enabled?: boolean;
  /** 注入位置 (0=after model instructions, 1=after user instructions, 2=after chat history) */
  injection_position: number;
  /** 注入深度 (仅在 injection_position=2 时有效) */
  injection_depth?: number;
  /** 注入顺序 */
  injection_order?: number;
  /** 是否禁止覆盖 */
  forbid_overrides?: boolean;
  /** 注入触发条件 */
  injection_trigger?: string[];
}

// ─── Regex Script ───

export interface RegexScript {
  id: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  placement: number[];
  disabled: boolean;
  markdownOnly: boolean;
  promptOnly: boolean;
  runOnEdit: boolean;
  substituteRegex: number;
  minDepth: number | null;
  maxDepth: number | null;
}

// ─── Tavern Helper Script ───

export interface TavernHelperScript {
  type: 'script';
  enabled: boolean;
  name: string;
  id: string;
  content: string;
  info?: string;
  button?: {
    enabled: boolean;
    buttons: string[];
  };
  data?: Record<string, unknown>;
}

// ─── Model Parameters ───

export interface ModelParameters {
  temperature: number;
  frequency_penalty: number;
  presence_penalty: number;
  top_p: number;
  top_k: number;
  top_a: number;
  min_p: number;
  repetition_penalty: number;
  max_context_unlocked: boolean;
  openai_max_context: number;
  openai_max_tokens: number;
}

// ─── Utility Prompts ───

export interface UtilityPrompts {
  names_behavior: number;
  send_if_empty: string;
  impersonation_prompt: string;
  new_chat_prompt: string;
  new_group_chat_prompt: string;
  new_example_chat_prompt: string;
  continue_nudge_prompt: string;
  bias_preset_selected: string;
  wi_format: string;
  scenario_format: string;
  personality_format: string;
  group_nudge_prompt: string;
  stream_openai: boolean;
}

// ─── Preset Extensions ───

export interface PresetExtensions {
  regex_scripts?: RegexScript[];
  tavern_helper?: {
    scripts: TavernHelperScript[];
    variables: Record<string, unknown>;
  };
  MacroNest?: boolean;
}

// ─── Full Preset ───

export interface ChatCompletionPreset extends ModelParameters, UtilityPrompts {
  prompts: PromptEntry[];
  extensions?: PresetExtensions;
}

// ─── Standard Prompt Identifiers ───

/** 标准 prompt 标识符，用于识别特殊位置 */
export const STANDARD_IDENTIFIERS = {
  MAIN: 'main',
  NSFW: 'nsfw',
  JAILBREAK: 'jailbreak',
  DIALOGUE_EXAMPLES: 'dialogueExamples',
  CHAT_HISTORY: 'chatHistory',
  WORLD_INFO_BEFORE: 'worldInfoBefore',
  WORLD_INFO_AFTER: 'worldInfoAfter',
  CHARACTER_DESCRIPTION: 'charDescription',
  CHARACTER_PERSONALITY: 'charPersonality',
  SCENARIO: 'scenario',
  PERSONA_DESCRIPTION: 'personaDescription',
  ENHANCE_DEFINITIONS: 'enhanceDefinitions',
} as const;

// ─── Helper Functions ───

/**
 * 检查 prompt 条目是否为标记位
 */
export function isMarkerPrompt(entry: PromptEntry): boolean {
  return entry.marker === true || entry.content === '' && STANDARD_IDENTIFIERS[entry.identifier as keyof typeof STANDARD_IDENTIFIERS] !== undefined;
}

/**
 * 检查 prompt 条目是否启用
 */
export function isEnabledPrompt(entry: PromptEntry): boolean {
  return entry.enabled !== false;
}

/**
 * 获取非标记且启用的 prompt 条目
 */
export function getActivePrompts(prompts: PromptEntry[]): PromptEntry[] {
  return prompts.filter(p => !isMarkerPrompt(p) && isEnabledPrompt(p));
}

/**
 * 按 injection_order 排序 prompts
 */
export function sortPromptsByOrder(prompts: PromptEntry[]): PromptEntry[] {
  return [...prompts].sort((a, b) => (a.injection_order ?? 100) - (b.injection_order ?? 100));
}
