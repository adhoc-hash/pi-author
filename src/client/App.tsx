import { useState, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useCardState } from './hooks/useCardState';
import { ChatPanel } from './components/ChatPanel';
import { CardPreview } from './components/CardPreview';
import { SettingsDialog } from './components/SettingsDialog';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastId = 0;

export default function App() {
  const ws = useWebSocket();
  const [showSettings, setShowSettings] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const state = useCardState(ws, { onToast: showToast });

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.png';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (file.name.toLowerCase().endsWith('.png')) {
          const { extractDataFromPng } = await import('./utils/pngReader');
          const buffer = await file.arrayBuffer();
          const card = await extractDataFromPng(buffer);
          state.importCard(card);
          showToast(`已导入: ${file.name}`, 'success');
        } else {
          const text = await file.text();
          const card = JSON.parse(text);
          state.importCard(card);
          showToast(`已导入: ${file.name}`, 'success');
        }
      } catch (err: any) {
        showToast(err?.message || '无法解析文件', 'error');
      }
    };
    input.click();
  };

  const entryCount = state.card?.data.character_book?.entries.length ?? 0;

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <div className="app-header__left">
          <span className="app-header__title">
            <span className="app-header__title-icon">✦</span>
            pi-author
          </span>
          {state.card?.data.name && (
            <span className="app-header__card-name">
              {state.card.data.name}
            </span>
          )}
          {!ws.connected && (
            <span style={{ color: 'var(--accent-danger)', fontSize: 'var(--text-xs)' }}>
              ● 连接中...
            </span>
          )}
        </div>
        <div className="app-header__right">
          <button
            className={`btn btn--ghost btn--sm ${showCard ? 'btn--active' : ''}`}
            onClick={() => setShowCard(!showCard)}
            title="查看角色卡"
          >
            📖 卡片 {entryCount > 0 && <span className="badge">{entryCount}</span>}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={handleImport} title="导入JSON">
            📥 导入
          </button>
          <button className="btn btn--ghost btn--sm" onClick={state.exportCard} title="导出JSON">
            📤 导出
          </button>
          <button className="btn btn--ghost btn--sm" onClick={state.newCard} title="新建卡片">
            🔄 新建
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => setShowSettings(true)} title="设置">
            ⚙️ 设置
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        <ChatPanel
          messages={state.messages}
          streaming={state.streaming}
          streamContent={state.streamContent}
          onSendMessage={state.sendChat}
          disabled={!ws.connected}
        />

        {/* Card Preview Drawer */}
        {showCard && (
          <>
            <div className="drawer-backdrop" onClick={() => setShowCard(false)} />
            <div className="drawer">
              <div className="drawer__header">
                <span className="drawer__title">📖 角色卡内容</span>
                <button className="btn btn--ghost btn--sm" onClick={() => setShowCard(false)}>✕</button>
              </div>
              <CardPreview card={state.card} />
            </div>
          </>
        )}
      </main>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            {t.type === 'success' && '✅ '}
            {t.type === 'error' && '❌ '}
            {t.type === 'info' && 'ℹ️ '}
            {t.message}
          </div>
        ))}
      </div>

      {/* Settings Dialog */}
      {showSettings && (
        <SettingsDialog
          config={state.llmConfig}
          onSave={state.updateLLMConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
