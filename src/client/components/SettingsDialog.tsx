import { useState } from 'react';
import type { LLMConfig, ProviderType } from '@shared/protocol';

interface SettingsDialogProps {
  config: LLMConfig | null;
  onSave: (config: LLMConfig) => void;
  onClose: () => void;
}

const PROVIDER_OPTIONS: Array<{ value: ProviderType; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
];

const MODEL_SUGGESTIONS: Record<ProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  'openai-compatible': [],
};

export function SettingsDialog({ config, onSave, onClose }: SettingsDialogProps) {
  const [formData, setFormData] = useState<LLMConfig>({
    providerType: config?.providerType ?? 'openai',
    apiKey: config?.apiKey ?? '',
    baseUrl: config?.baseUrl ?? '',
    model: config?.model ?? '',
  });

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

  const suggestions = MODEL_SUGGESTIONS[formData.providerType];

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
          <label className="dialog__label">Model（可选）</label>
          <input
            className="dialog__input"
            type="text"
            placeholder="留空使用默认模型"
            value={formData.model ?? ''}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            list="model-suggestions"
          />
          {suggestions.length > 0 && (
            <datalist id="model-suggestions">
              {suggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
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
