import { useState, useEffect } from 'react';
import type { LLMConfig, ProviderType, ServerMessage } from '@shared/protocol';

interface SettingsDialogProps {
  config: LLMConfig | null;
  onSave: (config: LLMConfig) => void;
  onClose: () => void;
  connected: boolean;
  send: (msg: { type: 'list_models'; config: LLMConfig }) => void;
  addHandler: (handler: (msg: ServerMessage) => void) => () => void;
}

const PROVIDER_OPTIONS: Array<{ value: ProviderType; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
];

export function SettingsDialog({ config, onSave, onClose, connected, send, addHandler }: SettingsDialogProps) {
  const [formData, setFormData] = useState<LLMConfig>({
    providerType: config?.providerType ?? 'openai',
    apiKey: config?.apiKey ?? '',
    baseUrl: config?.baseUrl ?? '',
    model: config?.model ?? '',
  });
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // 监听 models_list 消息
  useEffect(() => {
    const unsubscribe = addHandler((msg: ServerMessage) => {
      if (msg.type === 'models_list') {
        setModels(msg.models);
        setLoadingModels(false);
      }
    });
    return unsubscribe;
  }, [addHandler]);

  const fetchModels = () => {
    if (!connected) {
      alert('WebSocket 未连接');
      return;
    }
    if (!formData.apiKey.trim()) {
      alert('请先输入 API Key');
      return;
    }
    setLoadingModels(true);
    send({ type: 'list_models', config: formData });
  };

  const handleSave = () => {
    if (!formData.apiKey.trim()) {
      alert('请输入API Key');
      return;
    }
    onSave({
      ...formData,
      baseUrl: formData.baseUrl?.trim() || undefined,
      model: formData.model?.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <h2 className="dialog__title">⚙️ LLM 设置</h2>

        <div className="dialog__field">
          <label className="dialog__label">Provider类型</label>
          <select
            className="dialog__select"
            value={formData.providerType}
            onChange={(e) => setFormData({
              ...formData,
              providerType: e.target.value as ProviderType,
            })}
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="dialog__field">
          <label className="dialog__label">API Key</label>
          <input
            className="dialog__input"
            type="password"
            placeholder="sk-... 或 你的API密钥"
            value={formData.apiKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
          />
        </div>

        <div className="dialog__field">
          <label className="dialog__label">Base URL（可选）</label>
          <input
            className="dialog__input"
            type="url"
            placeholder={
              formData.providerType === 'openai-compatible'
                ? 'http://localhost:11434/v1/'
                : '留空使用默认'
            }
            value={formData.baseUrl ?? ''}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          />
        </div>

        <div className="dialog__field">
          <label className="dialog__label">Model</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              className="dialog__select"
              value={formData.model ?? ''}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              style={{ flex: 1 }}
            >
              <option value="">使用默认模型</option>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button
              className="btn"
              onClick={fetchModels}
              disabled={loadingModels || !formData.apiKey.trim()}
              title="获取可用模型列表"
            >
              {loadingModels ? '加载中...' : '刷新'}
            </button>
          </div>
          {!formData.apiKey.trim() && (
            <small style={{ color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              请先输入 API Key 后点击刷新按钮获取模型列表
            </small>
          )}
        </div>

        <div className="dialog__actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn--primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}