import { useState, useMemo } from 'react';
import type { CharacterCardV3 } from '../../server/card/schema';
import {
  CATEGORY_INFO,
  detectEntryCategory,
  getEntryDisplayName,
} from '../../server/card/schema';
import type { EntryCategory } from '../../server/card/schema';

interface CardPreviewProps {
  card: CharacterCardV3 | null;
}

type Tab = 'entries' | 'meta' | 'json';

export function CardPreview({ card }: CardPreviewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('entries');

  if (!card) {
    return (
      <div className="card-panel__content">
        <div className="card-empty">
          <div className="card-empty__icon">📋</div>
          <div className="card-empty__text">等待连接...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Tabs */}
      <div className="card-panel__tabs">
        {(['entries', 'meta', 'json'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`card-panel__tab ${activeTab === tab ? 'card-panel__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'entries' ? '📖 内容' : tab === 'meta' ? '📋 信息' : '{ } JSON'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card-panel__content">
        {activeTab === 'entries' && <EntriesView card={card} />}
        {activeTab === 'meta' && <MetaView card={card} />}
        {activeTab === 'json' && <JsonView card={card} />}
      </div>
    </>
  );
}

/* ─── Entries View ─── */

function EntriesView({ card }: { card: CharacterCardV3 }) {
  const entries = card.data.character_book?.entries ?? [];

  // Group entries by category
  const grouped = useMemo(() => {
    const groups: Record<string, typeof entries> = {};
    for (const entry of entries) {
      const cat = detectEntryCategory(entry.comment) ?? 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry);
    }
    return groups;
  }, [entries]);

  // Category display order
  const categoryOrder: (EntryCategory | 'other')[] = [
    'world', 'character', 'user', 'rule', 'style', 'ui', 'event', 'other',
  ];

  const hasGreeting = !!card.data.first_mes;
  const altGreetings = card.data.alternate_greetings ?? [];

  return (
    <>
      {/* Greetings */}
      {(hasGreeting || altGreetings.length > 0) && (
        <div className="greeting-section">
          <div className="greeting-section__header">
            🎬 开场白
          </div>
          {hasGreeting && (
            <div className="greeting-card">
              <div className="greeting-card__label">First Message</div>
              <div className="greeting-card__preview">
                {card.data.first_mes.replace(/\\r\\n|\\n/g, '\n').slice(0, 300)}
              </div>
            </div>
          )}
          {altGreetings.map((g, i) => (
            <div key={i} className="greeting-card">
              <div className="greeting-card__label">备选 #{i + 1}</div>
              <div className="greeting-card__preview">
                {g.replace(/\\r\\n|\\n/g, '\n').slice(0, 200)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Entry Groups */}
      {categoryOrder.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        const info = cat !== 'other'
          ? CATEGORY_INFO[cat as EntryCategory]
          : { icon: '📦', label: '未分类' };

        return (
          <EntryGroup
            key={cat}
            icon={info.icon}
            label={info.label}
            entries={items}
          />
        );
      })}

      {entries.length === 0 && !hasGreeting && (
        <div className="card-empty">
          <div className="card-empty__icon">📝</div>
          <div className="card-empty__text">
            尚未添加任何内容<br />
            在左侧与AI对话开始创作
          </div>
        </div>
      )}
    </>
  );
}

function EntryGroup({
  icon,
  label,
  entries,
}: {
  icon: string;
  label: string;
  entries: CharacterCardV3['data']['character_book']['entries'];
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="entry-group">
      <div className="entry-group__header" onClick={() => setCollapsed(!collapsed)}>
        <span className="entry-group__icon">{icon}</span>
        <span>{label}</span>
        <span className="entry-group__count">({entries.length})</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {collapsed ? '▶' : '▼'}
        </span>
      </div>
      {!collapsed && entries.map((entry) => (
        <EntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function EntryCard({ entry }: { entry: CharacterCardV3['data']['character_book']['entries'][0] }) {
  const [expanded, setExpanded] = useState(false);
  const displayName = getEntryDisplayName(entry.comment) || entry.comment;

  return (
    <div className="entry-card" onClick={() => setExpanded(!expanded)}>
      <div className="entry-card__header">
        <span className="entry-card__name">{displayName}</span>
        <span className={`entry-card__status ${!entry.enabled ? 'entry-card__status--disabled' : ''}`}>
          {entry.enabled ? '✅' : '❌'}
        </span>
      </div>
      <div
        className="entry-card__preview"
        style={expanded ? {
          WebkitLineClamp: 'unset',
          display: 'block',
          whiteSpace: 'pre-wrap',
          maxHeight: '400px',
          overflowY: 'auto',
        } : undefined}
      >
        {entry.content.slice(0, expanded ? 2000 : 150)}
        {!expanded && entry.content.length > 150 ? '...' : ''}
      </div>
    </div>
  );
}

/* ─── Meta View ─── */

function MetaView({ card }: { card: CharacterCardV3 }) {
  return (
    <div className="meta-section">
      <MetaField label="名称" value={card.data.name} />
      <MetaField label="描述" value={card.data.description} />
      <MetaField label="Tags" value={(Array.isArray(card.data.tags) ? card.data.tags : []).join(', ')} />
      <MetaField label="Creator" value={card.data.creator} />
      <MetaField label="Creator Notes" value={card.data.creator_notes} />
      <MetaField label="版本" value={card.data.character_version} />
      <MetaField label="Spec" value={`${card.spec} v${card.spec_version}`} />
      <MetaField label="创建日期" value={card.create_date} />
      <MetaField
        label="Entries数量"
        value={String(card.data.character_book?.entries.length ?? 0)}
      />
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-field">
      <div className="meta-field__label">{label}</div>
      <div className="meta-field__value">{value || '—'}</div>
    </div>
  );
}

/* ─── JSON View ─── */

function JsonView({ card }: { card: CharacterCardV3 }) {
  return (
    <pre className="json-view">
      {JSON.stringify(card, null, 2)}
    </pre>
  );
}
