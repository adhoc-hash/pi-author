/**
 * CCv3 empty card template.
 *
 * Follows the same structure as the sample cards:
 * - description is left empty (content goes into character_book)
 * - personality, scenario, mes_example are empty
 * - all story content is managed through character_book entries
 */

import type { CharacterCardV3, LorebookEntry, LorebookEntryExtensions, EntryCategory } from './schema.js';

/**
 * Default extensions for a lorebook entry.
 * Derived from the consistent pattern across clk-030 and 年梦馨 sample cards.
 */
function defaultEntryExtensions(overrides: Partial<LorebookEntryExtensions> = {}): LorebookEntryExtensions {
  return {
    position: 0,
    exclude_recursion: true,
    display_index: 0,
    probability: 100,
    useProbability: true,
    depth: 4,
    selectiveLogic: 0,
    outlet_name: '',
    group: '',
    group_override: false,
    group_weight: 100,
    prevent_recursion: true,
    delay_until_recursion: false,
    scan_depth: null,
    match_whole_words: null,
    use_group_scoring: false,
    case_sensitive: null,
    automation_id: '',
    role: 0,
    vectorized: false,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    match_persona_description: false,
    match_character_description: false,
    match_character_personality: false,
    match_character_depth_prompt: false,
    match_scenario: false,
    match_creator_notes: false,
    triggers: [],
    ignore_budget: false,
    ...overrides,
  };
}

/**
 * Category-specific entry defaults.
 * Derived from analysis of sample cards.
 *
 * - World/Character/User entries: position=before_char (ext.position=0), depth=4, constant=true
 * - Rule/Style entries: position=after_char (ext.position=4), depth=0 or 1, constant=true
 * - UI entries: position=after_char (ext.position=1), depth=4, constant=true
 * - Event entries: constant=false, triggered by keys
 */
export const CATEGORY_DEFAULTS: Record<EntryCategory, Partial<LorebookEntry>> = {
  world: {
    constant: true,
    selective: true,
    position: 'before_char',
    use_regex: true,
    keys: [],
    secondary_keys: [],
    extensions: defaultEntryExtensions({ position: 0, depth: 4 }),
  },
  character: {
    constant: true,
    selective: true,
    position: 'before_char',
    use_regex: true,
    keys: [],
    secondary_keys: [],
    extensions: defaultEntryExtensions({ position: 0, depth: 4 }),
  },
  user: {
    constant: true,
    selective: true,
    position: 'before_char',
    use_regex: true,
    keys: [],
    secondary_keys: [],
    extensions: defaultEntryExtensions({ position: 0, depth: 4 }),
  },
  rule: {
    constant: true,
    selective: true,
    position: 'after_char',
    use_regex: true,
    keys: [],
    secondary_keys: [],
    extensions: defaultEntryExtensions({ position: 4, depth: 0 }),
  },
  style: {
    constant: true,
    selective: true,
    position: 'after_char',
    use_regex: true,
    keys: [],
    secondary_keys: [],
    extensions: defaultEntryExtensions({ position: 4, depth: 0 }),
  },
  ui: {
    constant: true,
    selective: true,
    position: 'after_char',
    use_regex: true,
    keys: [],
    secondary_keys: [],
    extensions: defaultEntryExtensions({ position: 1, depth: 4 }),
  },
  event: {
    constant: false,
    selective: true,
    position: 'before_char',
    use_regex: true,
    keys: [],
    secondary_keys: [],
    extensions: defaultEntryExtensions({ position: 0, depth: 4 }),
  },
};

/**
 * Create a blank CCv3 character card.
 */
export function createEmptyCard(name: string = ''): CharacterCardV3 {
  return {
    name,
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    creatorcomment: '',
    avatar: 'none',
    talkativeness: '0.5',
    fav: false,
    tags: [],
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name,
      description: '',
      personality: '',
      scenario: '',
      first_mes: '',
      alternate_greetings: [],
      mes_example: '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      tags: [],
      creator: '',
      character_version: '',
      extensions: {
        talkativeness: '0.5',
        fav: false,
        world: '',
        depth_prompt: {
          prompt: '',
          depth: 4,
          role: 'system',
        },
        regex_scripts: [],
      },
      character_book: {
        entries: [],
        name: name,
      },
    },
    create_date: new Date().toISOString(),
  };
}
