/**
 * Card State Manager
 *
 * Manages the in-memory state of the character card being edited.
 * All mutations go through this class, which emits events for the WS layer.
 */

import { createEmptyCard, CATEGORY_DEFAULTS } from './template.js';
import { CATEGORY_PREFIXES, detectEntryCategory, getEntryDisplayName } from './schema.js';
import type {
  CharacterCardV3,
  LorebookEntry,
  EntryCategory,
} from './schema.js';

export type CardChangeListener = (card: CharacterCardV3) => void;

export class CardState {
  private card: CharacterCardV3;
  private nextEntryId: number = 0;
  private listeners: CardChangeListener[] = [];

  constructor(initialCard?: CharacterCardV3) {
    this.card = initialCard ?? createEmptyCard();
    // compute next entry id from existing entries
    if (this.card.data.character_book?.entries.length) {
      this.nextEntryId = Math.max(
        ...this.card.data.character_book.entries.map((e) => e.id),
      ) + 1;
    }
  }

  /** Subscribe to card changes */
  onChange(listener: CardChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit() {
    const snapshot = this.getCard();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  /** Get a deep copy of the current card, auto-filling empty meta fields */
  getCard(): CharacterCardV3 {
    const card: CharacterCardV3 = JSON.parse(JSON.stringify(this.card));
    this.autoFillMeta(card);
    return card;
  }

  /**
   * Auto-fill empty meta fields from card content.
   * Called on getCard() so exports always have populated meta.
   */
  private autoFillMeta(card: CharacterCardV3) {
    const entries = card.data.character_book?.entries ?? [];
    const hasContent = entries.length > 0 || card.data.first_mes;

    if (!hasContent) return;

    // Auto-fill name from first world entry or first character entry
    if (!card.data.name) {
      const worldEntry = entries.find(e => e.comment.startsWith('[世界观]'));
      const charEntry = entries.find(e => e.comment.startsWith('[角色]'));
      const source = worldEntry || charEntry;
      if (source) {
        const label = source.comment.replace(/^\[.*?\]\s*/, '').trim();
        card.name = label;
        card.data.name = label;
        card.data.character_book.name = label;
      }
    }

    // Sync character_book.name with card name
    if (card.data.name && !card.data.character_book.name) {
      card.data.character_book.name = card.data.name;
    }

    // Auto-fill creator
    if (!card.data.creator) {
      card.data.creator = 'pi-author';
    }

    // Auto-fill creator_notes from description or entries
    if (!card.data.creator_notes && card.data.description) {
      card.data.creator_notes = card.data.description;
    } else if (!card.data.creator_notes) {
      const cats = entries.map(e => {
        const match = e.comment.match(/^\[(.*?)\]/);
        return match ? match[1] : null;
      }).filter(Boolean);
      const uniqueCats = [...new Set(cats)];
      card.data.creator_notes = `Story-telling 角色卡，包含 ${entries.length} 个entries (${uniqueCats.join('、')})。由 pi-author 生成。`;
    }

    // Auto-fill tags from entry categories and labels
    if (!card.data.tags || card.data.tags.length === 0) {
      const tags: string[] = [];
      for (const e of entries) {
        const cat = detectEntryCategory(e.comment);
        const label = getEntryDisplayName(e.comment);
        if (cat === 'character' && label) tags.push(label);
      }
      // Add 'story-telling' tag
      tags.unshift('story-telling');
      card.data.tags = tags.slice(0, 10);
    }

    // Auto-fill character_version
    if (!card.data.character_version) {
      card.data.character_version = '1.0';
    }
  }

  /** Replace the entire card (e.g. on import) */
  replaceCard(card: CharacterCardV3) {
    this.card = JSON.parse(JSON.stringify(card));
    if (this.card.data.character_book?.entries.length) {
      this.nextEntryId = Math.max(
        ...this.card.data.character_book.entries.map((e) => e.id),
      ) + 1;
    } else {
      this.nextEntryId = 0;
    }
    this.emit();
  }

  /** Reset to a fresh empty card */
  reset(name: string = '') {
    this.card = createEmptyCard(name);
    this.nextEntryId = 0;
    this.emit();
  }

  // ─── Meta Operations ───

  updateMeta(field: string, value: any) {
    if (field === 'name') {
      this.card.name = value;
      this.card.data.name = value;
      this.card.data.character_book.name = value;
    } else if (field in this.card.data) {
      (this.card.data as any)[field] = value;
    }
    this.emit();
  }

  // ─── Entry Operations ───

  addEntry(
    category: EntryCategory,
    label: string,
    content: string,
    overrides: Partial<LorebookEntry> = {},
  ): LorebookEntry {
    const defaults = CATEGORY_DEFAULTS[category];
    const prefix = CATEGORY_PREFIXES[category];
    const comment = `${prefix} ${label}`;

    // Sanitize content: strip metadata prefixes the LLM sometimes includes
    const cleanContent = this.sanitizeEntryContent(content);

    const entryId = this.nextEntryId++;
    const entry: LorebookEntry = {
      keys: [],
      secondary_keys: [],
      constant: true,
      selective: true,
      insertion_order: this.card.data.character_book.entries.length + 1,
      enabled: true,
      position: 'before_char',
      use_regex: true,
      ...defaults,
      ...overrides,
      extensions: { 
        ...(defaults.extensions || {}), 
        ...(overrides.extensions || {}) 
      },
      // ensure critical fields are not overridden by accident
      id: entryId,
      comment,
      content: cleanContent,
    } as LorebookEntry;

    // update display_index
    entry.extensions.display_index = this.card.data.character_book.entries.length;

    this.card.data.character_book.entries.push(entry);
    this.emit();
    return entry;
  }

  updateEntry(id: number, updates: Partial<LorebookEntry>): LorebookEntry | null {
    const entry = this.card.data.character_book.entries.find((e) => e.id === id);
    if (!entry) return null;

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'extensions' && typeof value === 'object') {
        Object.assign(entry.extensions, value);
      } else {
        (entry as any)[key] = value;
      }
    }
    this.emit();
    return { ...entry };
  }

  deleteEntry(id: number): boolean {
    const idx = this.card.data.character_book.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.card.data.character_book.entries.splice(idx, 1);
    // re-index display_index
    this.card.data.character_book.entries.forEach((e, i) => {
      e.extensions.display_index = i;
    });
    this.emit();
    return true;
  }

  getEntry(id: number): LorebookEntry | null {
    return this.card.data.character_book.entries.find((e) => e.id === id) ?? null;
  }

  listEntries(): Array<{ id: number; category: string | null; label: string; enabled: boolean; contentPreview: string }> {
    return this.card.data.character_book.entries.map((e) => ({
      id: e.id,
      category: detectEntryCategory(e.comment),
      label: getEntryDisplayName(e.comment) || e.comment,
      enabled: e.enabled,
      contentPreview: e.content.slice(0, 200) + (e.content.length > 200 ? '...' : ''),
    }));
  }

  // ─── Greeting Operations ───

  setFirstMes(content: string) {
    this.card.first_mes = content;
    this.card.data.first_mes = content;
    this.emit();
  }

  addAlternateGreeting(content: string): number {
    this.card.data.alternate_greetings.push(content);
    this.emit();
    return this.card.data.alternate_greetings.length - 1;
  }

  updateAlternateGreeting(index: number, content: string): boolean {
    if (index < 0 || index >= this.card.data.alternate_greetings.length) return false;
    this.card.data.alternate_greetings[index] = content;
    this.emit();
    return true;
  }

  // ─── Summary ───

  getCardSummary(): string {
    const entries = this.card.data.character_book.entries;
    const byCategory: Record<string, string[]> = {};

    for (const e of entries) {
      const cat = detectEntryCategory(e.comment) ?? 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(`${getEntryDisplayName(e.comment) || e.comment} (${e.enabled ? '✅' : '❌'})`);
    }

    const lines: string[] = [];
    lines.push(`📋 卡片名称: ${this.card.data.name || '(未命名)'}`);
    const tags = Array.isArray(this.card.data.tags) ? this.card.data.tags : [];
  lines.push(`🏷️ Tags: ${tags.join(', ') || '(无)'}`);
    lines.push(`✍️ Creator: ${this.card.data.creator || '(未设置)'}`);
    lines.push('');

    for (const [cat, names] of Object.entries(byCategory)) {
      lines.push(`[${cat}]`);
      for (const n of names) {
        lines.push(`  - ${n}`);
      }
    }

    lines.push('');
    lines.push(`🎬 开场白: ${this.card.data.first_mes ? '已设置' : '未设置'}`);
    lines.push(`🎬 备选开场: ${this.card.data.alternate_greetings.length} 个`);

    return lines.join('\n');
  }

  // ─── Content Sanitization ───

  /**
   * Strip metadata prefixes that the LLM sometimes includes at the start of content.
   * e.g. "comment: [世界观]\nconstant: true\n\n实际内容..." → "实际内容..."
   */
  private sanitizeEntryContent(content: string): string {
    // Pattern: lines at the start matching known metadata keys
    const metaKeys = /^(comment|constant|selective|insertion_order|enabled|position|use_regex|keys|secondary_keys)\s*:/i;
    const lines = content.split('\n');
    let firstContentLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '' || metaKeys.test(trimmed)) {
        firstContentLine = i + 1;
      } else {
        break;
      }
    }

    if (firstContentLine > 0) {
      return lines.slice(firstContentLine).join('\n').trim();
    }
    return content;
  }
}
