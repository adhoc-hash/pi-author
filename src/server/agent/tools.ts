/**
 * Agent Tool Definitions
 *
 * These are registered as OpenAI-compatible function tools for the LLM.
 * Each tool maps to a CardState operation.
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * All tools available to the agent.
 */
export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'update_card_meta',
      description: '更新角色卡的基本信息，如名称、tags、creator等。在确定故事概念后使用。',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['name', 'description', 'tags', 'creator', 'creator_notes', 'character_version'],
            description: '要更新的字段',
          },
          value: {
            description: '新值。tags为string数组，其他为string。',
          },
        },
        required: ['field', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_entry',
      description: '添加一个character_book entry。用于创建角色设定、世界观、规则、文风等。',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['world', 'character', 'user', 'rule', 'style', 'ui', 'event'],
            description: 'entry的语义类别',
          },
          label: {
            type: 'string',
            description: 'entry的标题/名称，如"蔚蓝都市"或"明月清"',
          },
          content: {
            type: 'string',
            description: 'entry的完整内容。只写纯设定/描述文本，不要包含comment、constant等元数据行。角色设定建议用YAML格式。',
          },
        },
        required: ['category', 'label', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_entry',
      description: '修改已有entry的内容或属性。用于润色内容、修改角色设定等。',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'entry的ID',
          },
          content: {
            type: 'string',
            description: '新的内容（如果要更新内容）',
          },
          comment: {
            type: 'string',
            description: '新的标题/注释（如果要更新）',
          },
          enabled: {
            type: 'boolean',
            description: '是否启用',
          },
          keys: {
            type: 'array',
            items: { type: 'string' },
            description: '触发关键词（仅用于非常驻的事件entry）',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_entry',
      description: '删除一个entry。',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'entry的ID',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_entries',
      description: '列出当前所有entries的摘要。用于了解卡片当前状态。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_first_mes',
      description: '设置卡片的第一条消息（开场白）。这是打开卡后展示的故事开端。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '开场白内容。应是高质量的叙事文本。',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_alternate_greeting',
      description: '添加一个备选开场白。可以提供不同的故事开端。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '备选开场白内容',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_card_summary',
      description: '获取卡片的结构化摘要，了解当前整体状态。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];
