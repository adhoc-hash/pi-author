import { useState, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useCardState } from './hooks/useCardState';
import { ChatPanel } from './components/ChatPanel';
import { CardPreview } from './components/CardPreview';
import { SettingsDialog } from './components/SettingsDialog';
import { PresetPanel } from './components/PresetPanel';
import type { ChatCompletionPreset } from '../server/preset/schema';

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
  const [showPreset, setShowPreset] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [preset, setPreset] = useState<ChatCompletionPreset | null>(null);
  const [presetFileName, setPresetFileName] = useState<string | null>(null);

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
          state.importCard(card, buffer);
          showToast(`已导入: ${file.name}`, 'success');
        } else {
          const text = await file.text();
          const card = JSON.parse(text);
          state.importCard(card, null);
          showToast(`已导入: ${file.name}`, 'success');
        }
      } catch (err: any) {
        showToast(err?.message || '无法解析文件', 'error');
      }
    };
    input.click();
  };

  const handleExport = async (format: 'json' | 'png') => {
    if (format === 'png' && !state.originalPng) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const buffer = await file.arrayBuffer();
          let pngBuffer: ArrayBuffer;
          if (file.type === 'image/png') {
            pngBuffer = buffer;
          } else {
            pngBuffer = await convertToPng(buffer, file.type);
          }
          state.exportCardWithPng(pngBuffer);
          showToast(`已导出 PNG`, 'success');
        } catch (err: any) {
          showToast(err?.message || '无法处理图片', 'error');
        }
      };
      input.click();
    } else {
      state.exportCard(format);
    }
    setShowExportMenu(false);
  };

  const convertToPng = async (buffer: ArrayBuffer, mimeType: string): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('无法转换为 PNG'));
            return;
          }
          blob.arrayBuffer().then(resolve).catch(reject);
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('无法加载图片'));
      img.src = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
    });
  };

  // 导入预设
  const handleImportPreset = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const presetData = JSON.parse(text) as ChatCompletionPreset;
        if (!Array.isArray(presetData.prompts)) {
          throw new Error('无效的预设文件：缺少 prompts 数组');
        }
        setPreset(presetData);
        setPresetFileName(file.name);
        state.importPreset(presetData);
        showToast(`已导入预设: ${file.name}`, 'success');
        setShowPreset(true);
      } catch (err: any) {
        showToast(err?.message || '无法解析预设文件', 'error');
      }
    };
    input.click();
  };

  // 切换预设条目启用状态
  const handleTogglePresetEntry = useCallback((identifier: string, enabled: boolean) => {
    if (!preset) return;
    setPreset(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        prompts: prev.prompts.map(p =>
          p.identifier === identifier ? { ...p, enabled } : p
        ),
      };
    });
  }, [preset]);

  // 清除预设
  const handleClearPreset = useCallback(() => {
    setPreset(null);
    setPresetFileName(null);
    state.clearPreset();
    setShowPreset(false);
  }, [state]);

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
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setShowExportMenu(!showExportMenu)}
            title="导出"
          >
            📤 导出
          </button>
          {showExportMenu && (
            <div className="export-menu">
              <button className="export-menu__item" onClick={() => handleExport('json')}>
                📄 导出 JSON
              </button>
              <button className="export-menu__item" onClick={() => handleExport('png')}>
                🖼️ 导出 PNG {state.originalPng ? '(保留原图)' : '(选择图片)'}
              </button>
            </div>
          )}
          <button className="btn btn--ghost btn--sm" onClick={state.newCard} title="新建卡片">
            🔄 新建
          </button>
          <button
            className={`btn btn--ghost btn--sm ${showPreset ? 'btn--active' : ''}`}
            onClick={() => {
              if (preset) {
                setShowPreset(!showPreset);
              } else {
                handleImportPreset();
              }
            }}
            title={preset ? '管理预设' : '导入预设'}
          >
            📋 预设 {preset && <span className="badge" style={{ marginLeft: 4 }}>✓</span>}
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

        {/* Preset Panel Drawer */}
        {showPreset && preset && (
          <>
            <div className="drawer-backdrop" onClick={() => setShowPreset(false)} />
            <div className="drawer">
              <PresetPanel
                preset={preset}
                presetName={presetFileName || '未命名预设'}
                onClose={() => setShowPreset(false)}
                onToggleEntry={handleTogglePresetEntry}
                onClearPreset={handleClearPreset}
              />
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
          connected={ws.connected}
          send={ws.send}
          addHandler={ws.addHandler}
        />
      )}
    </div>
  );
}
