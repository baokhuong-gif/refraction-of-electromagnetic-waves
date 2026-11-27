import React, { useState } from 'react';
import { Check, ExternalLink, KeyRound, Trash2 } from 'lucide-react';
import {
  clearStoredGeminiApiKey,
  getStoredGeminiApiKey,
  setStoredGeminiApiKey,
} from '../utils/clientStandaloneApi';

interface ClientGeminiKeyPanelProps {
  isOpen: boolean;
  onKeySaved?: (hasKey: boolean) => void;
}

export const ClientGeminiKeyPanel: React.FC<ClientGeminiKeyPanelProps> = ({
  isOpen,
  onKeySaved,
}) => {
  const [savedKey, setSavedKey] = useState<string>(() => getStoredGeminiApiKey());
  const [draftKey, setDraftKey] = useState<string>(() => getStoredGeminiApiKey());
  const [justSaved, setJustSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = draftKey.trim();
    setStoredGeminiApiKey(trimmed);
    setSavedKey(trimmed);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2200);
    onKeySaved?.(Boolean(trimmed));
  };

  const handleClear = () => {
    clearStoredGeminiApiKey();
    setSavedKey('');
    setDraftKey('');
    onKeySaved?.(false);
  };

  return (
    <div
      data-testid="client-gemini-key-panel"
      className="rounded-lg border border-sky-200 bg-sky-50/60 p-3.5 space-y-2.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
          <KeyRound className="w-3.5 h-3.5 text-sky-700 shrink-0" aria-hidden="true" />
          <span>Gemini API Key cá nhân (chế độ GitHub Pages)</span>
        </div>
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-medium hover:underline whitespace-nowrap"
        >
          Lấy khóa miễn phí
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </div>

      <p className="text-slate-600 leading-relaxed">
        Khóa được lưu cục bộ trong trình duyệt (<code className="font-mono">localStorage</code>) của
        riêng bạn, không gửi lên bất kỳ máy chủ trung gian nào.
      </p>

      <div className="flex items-center gap-2">
        <input
          type="password"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          placeholder="Dán AIza... vào đây"
          aria-label="Nhập Gemini API Key cá nhân"
          className="flex-1 min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-sky-700 hover:bg-sky-800 text-white font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          {justSaved ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Đã lưu
            </>
          ) : (
            'Lưu khóa'
          )}
        </button>
        {savedKey && (
          <button
            type="button"
            onClick={handleClear}
            title="Xóa khóa đã lưu"
            aria-label="Xóa Gemini API Key đã lưu"
            className="p-1.5 rounded-md border border-slate-300 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-700 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
