/**
 * 预设解析与验证模块
 */

import type { ChatCompletionPreset, PromptEntry } from './schema.js';

/**
 * 验证预设文件结构
 */
export function validatePreset(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['预设必须是对象'] };
  }

  const preset = data as Record<string, unknown>;

  // 检查必需字段
  if (!Array.isArray(preset.prompts)) {
    errors.push('缺少 prompts 数组');
  } else {
    // 验证每个 prompt 条目
    preset.prompts.forEach((p, i) => {
      const promptErrors = validatePromptEntry(p, i);
      errors.push(...promptErrors);
    });
  }

  // 检查数值参数
  if (typeof preset.temperature !== 'number') {
    errors.push('temperature 必须是数字');
  }
  if (typeof preset.top_p !== 'number') {
    errors.push('top_p 必须是数字');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证单个 prompt 条目
 */
function validatePromptEntry(entry: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `prompts[${index}]`;

  if (typeof entry !== 'object' || entry === null) {
    return [`${prefix} 必须是对象`];
  }

  const p = entry as Record<string, unknown>;

  if (typeof p.identifier !== 'string' || p.identifier === '') {
    errors.push(`${prefix}.identifier 必须是非空字符串`);
  }
  if (typeof p.name !== 'string') {
    errors.push(`${prefix}.name 必须是字符串`);
  }
  if (!['system', 'user', 'assistant'].includes(p.role as string)) {
    errors.push(`${prefix}.role 必须是 system/user/assistant`);
  }
  if (typeof p.injection_position !== 'number') {
    errors.push(`${prefix}.injection_position 必须是数字`);
  }

  return errors;
}

/**
 * 解析预设 JSON 文件
 */
export function parsePresetJson(json: string): ChatCompletionPreset {
  const data = JSON.parse(json);
  const { valid, errors } = validatePreset(data);

  if (!valid) {
    throw new Error(`预设验证失败:\n${errors.join('\n')}`);
  }

  return data as ChatCompletionPreset;
}

/**
 * 提取预设中的自定义 prompt（非标准标记位）
 */
export function extractCustomPrompts(preset: ChatCompletionPreset): PromptEntry[] {
  const standardIds = new Set(Object.values({
    main: true,
    nsfw: true,
    jailbreak: true,
    dialogueExamples: true,
    chatHistory: true,
    worldInfoBefore: true,
    worldInfoAfter: true,
    charDescription: true,
    charPersonality: true,
    scenario: true,
    personaDescription: true,
    enhanceDefinitions: true,
  }));

  return preset.prompts.filter(p => {
    // 排除标记位
    if (p.marker === true || p.content === '') return false;
    // 排除禁用的
    if (p.enabled === false) return false;
    // 包含自定义和标准 prompts
    return true;
  });
}

/**
 * 将预设转换为简化格式（用于显示）
 */
export function presetToDisplayInfo(preset: ChatCompletionPreset): {
  name: string;
  promptCount: number;
  enabledPromptCount: number;
  hasRegexScripts: boolean;
  temperature: number;
} {
  const prompts = preset.prompts || [];
  const enabledPrompts = prompts.filter(p => p.enabled !== false);

  return {
    name: '未命名预设', // 预设文件本身不包含名称，通常从文件名获取
    promptCount: prompts.length,
    enabledPromptCount: enabledPrompts.length,
    hasRegexScripts: !!(preset.extensions?.regex_scripts?.length),
    temperature: preset.temperature,
  };
}
