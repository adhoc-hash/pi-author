/**
 * 预设面板组件
 *
 * 显示和管理导入的预设条目
 */

import { useState, useMemo } from 'react';
import type { ChatCompletionPreset, PromptEntry } from '../../server/preset/schema';

interface PresetPanelProps {
  preset: ChatCompletionPreset;
  presetName: string;
  onClose: () => void;
  onToggleEntry: (identifier: string, enabled: boolean) => void;
  onClearPreset: () => void;
}

type FilterType = 'all' | 'system' | 'custom' | 'enabled' | 'disabled';

export function PresetPanel({ preset, presetName, onClose, onToggleEntry, onClearPreset }: PresetPanelProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 分类条目
  const { markers, systemPrompts, customEntries } = useMemo(() => {
    const markers: PromptEntry[] = [];
    const systemPrompts: PromptEntry[] = [];
    const customEntries: PromptEntry[] = [];

    for (const entry of preset.prompts) {
      if (entry.marker) {
        markers.push(entry);
      } else if (entry.system_prompt) {
        systemPrompts.push(entry);
      } else {
        customEntries.push(entry);
      }
    }

    return { markers, systemPrompts, customEntries };
  }, [preset]);

  // 过滤显示的条目
  const filteredEntries = useMemo(() => {
    // 只显示非标记位的条目
    let entries = [...systemPrompts, ...customEntries];

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      entries = entries.filter(e =>
        e.name.toLowerCase().includes(query) ||
        e.identifier.toLowerCase().includes(query) ||
        (e.content && e.content.toLowerCase().includes(query))
      );
    }

    // 类型过滤
    switch (filter) {
      case 'system':
        entries = entries.filter(e => e.system_prompt);
        break;
      case 'custom':
        entries = entries.filter(e => !e.system_prompt);
        break;
      case 'enabled':
        entries = entries.filter(e => e.enabled !== false);
        break;
      case 'disabled':
        entries = entries.filter(e => e.enabled === false);
        break;
    }

    // 排序：启用的在前
    return entries.sort((a, b) => {
      const aEnabled = a.enabled !== false ? 1 : 0;
      const bEnabled = b.enabled !== false ? 1 : 0;
      return bEnabled - aEnabled;
    });
  }, [systemPrompts, customEntries, filter, searchQuery]);

  const enabledCount = systemPrompts.filter(e => e.enabled !== false).length +
                        customEntries.filter(e => e.enabled !== false).length;
  const totalCount = systemPrompts.length + customEntries.length;

  return (
    <div className="preset-panel">
      {/* 头部 */}
      <div className="preset-panel__header">
        <div className="preset-panel__title">
          <span className="preset-panel__icon">📋</span>
          <span>{presetName}</span>
          <span className="preset-panel__stats">
            {enabledCount}/{totalCount} 启用
          </span>
        </div>
        <div className="preset-panel__actions">
          <button className="btn btn--ghost btn--sm" onClick={onClearPreset} title="清除预设">
            🗑️ 清除
          </button>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="preset-panel__toolbar">
        {/* 搜索 */}
        <input
          type="text"
          className="input input--sm preset-panel__search"
          placeholder="搜索条目..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* 过滤 */}
        <div className="preset-panel__filters">
          <button
            className={`btn btn--sm ${filter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setFilter('all')}
          >
            全部
          </button>
          <button
            className={`btn btn--sm ${filter === 'enabled' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setFilter('enabled')}
          >
            已启用
          </button>
          <button
            className={`btn btn--sm ${filter === 'disabled' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setFilter('disabled')}
          >
            已禁用
          </button>
        </div>
      </div>

      {/* 条目列表 */}
      <div className="preset-panel__entries">
        {filteredEntries.map((entry) => (
          <PresetEntryItem
            key={entry.identifier}
            entry={entry}
            expanded={expandedId === entry.identifier}
            onToggleExpand={() => setExpandedId(
              expandedId === entry.identifier ? null : entry.identifier
            )}
            onToggleEnabled={(enabled) => onToggleEntry(entry.identifier, enabled)}
          />
        ))}
        {filteredEntries.length === 0 && (
          <div className="preset-panel__empty">
            {searchQuery ? '没有匹配的条目' : '暂无条目'}
          </div>
        )}
      </div>

      {/* 标记位信息 */}
      {markers.length > 0 && (
        <div className="preset-panel__markers">
          <details>
            <summary>标记位 ({markers.length})</summary>
            <div className="preset-panel__marker-list">
              {markers.map(m => (
                <span key={m.identifier} className="preset-panel__marker-tag">
                  {m.name}
                </span>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

interface PresetEntryItemProps {
  entry: PromptEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}

function PresetEntryItem({ entry, expanded, onToggleExpand, onToggleEnabled }: PresetEntryItemProps) {
  const isEnabled = entry.enabled !== false;
  const roleIcon = entry.role === 'system' ? '🤖' : entry.role === 'user' ? '👤' : '🤖';
  const systemBadge = entry.system_prompt ? (
    <span className="preset-entry__badge preset-entry__badge--system">系统</span>
  ) : null;

  return (
    <div className={`preset-entry ${isEnabled ? 'preset-entry--enabled' : 'preset-entry--disabled'}`}>
      <div className="preset-entry__header">
        {/* 启用开关 */}
        <label className="preset-entry__toggle">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
          <span className="preset-entry__toggle-slider"></span>
        </label>

        {/* 角色图标 */}
        <span className="preset-entry__role">{roleIcon}</span>

        {/* 名称 */}
        <span className="preset-entry__name" onClick={onToggleExpand}>
          {entry.name}
        </span>

        {/* 标签 */}
        {systemBadge}

        {/* 展开按钮 */}
        <button
          className="btn btn--ghost btn--sm preset-entry__expand"
          onClick={onToggleExpand}
        >
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {/* 内容预览 */}
      {!expanded && entry.content && (
        <div className="preset-entry__preview" onClick={onToggleExpand}>
          {entry.content.slice(0, 100)}
          {entry.content.length > 100 && '...'}
        </div>
      )}

      {/* 详细内容 */}
      {expanded && (
        <div className="preset-entry__content">
          <div className="preset-entry__meta">
            <span>标识: {entry.identifier}</span>
            <span>角色: {entry.role}</span>
            {entry.system_prompt && <span>系统提示: 是</span>}
          </div>
          {entry.content && (
            <pre className="preset-entry__text">{entry.content}</pre>
          )}
          {!entry.content && (
            <div className="preset-entry__empty-content">无内容</div>
          )}
        </div>
      )}
    </div>
  );
}
