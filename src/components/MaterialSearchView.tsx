import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Globe,
  History,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatWavelength } from '../physics/emPhysics';

interface GroundedSource {
  title: string;
  uri: string;
}

interface SearchResultPayload {
  answer: string;
  suggestedN: number | null;
  sources: GroundedSource[];
  searchQueries: string[];
}

interface SavedSearchLogItem {
  id: number;
  query: string;
  summary: string;
  suggestedN: number | null;
  wavelengthNm: number | null;
  sources: GroundedSource[];
  createdAt: string;
}

interface MaterialSearchViewProps {
  currentN1: number;
  currentN2: number;
  wavelengthVacuumNm: number;
  onApplyRefractiveIndex: (n2: number, labelHint?: string) => void;
}

const EXAMPLE_QUERIES = [
  'Chiết suất kính quang học N-BK7 và độ tán sắc ở bước sóng 532 nm',
  'Hằng số điện môi và chiết suất Silicon đơn tinh thể ở băng vi sóng 10 GHz',
  'Chiết suất nước biển theo độ mặn và nhiệt độ trong vùng ánh sáng khả kiến',
  'Chiết suất tinh thể Sapphire (Al2O3) và ứng dụng cửa sổ quang học',
];

export const MaterialSearchView: React.FC<MaterialSearchViewProps> = ({
  currentN1,
  currentN2,
  wavelengthVacuumNm,
  onApplyRefractiveIndex,
}) => {
  const { user, getIdToken } = useAuth();
  const [query, setQuery] = useState(EXAMPLE_QUERIES[0]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResultPayload | null>(null);
  const [history, setHistory] = useState<SavedSearchLogItem[]>([]);

  const loadHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      return;
    }
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch('/api/search/history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { history?: SavedSearchLogItem[] };
      if (Array.isArray(data.history)) {
        setHistory(data.history);
      }
    } catch {
      // Non-fatal history refresh failure
    }
  }, [user, getIdToken]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const executeSearch = async (targetQuery: string) => {
    const trimmed = targetQuery.trim();
    if (trimmed.length < 2) {
      setErrorMsg('Vui lòng nhập từ khóa vật liệu hoặc hiện tượng quang học cần tra cứu.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const token = await getIdToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch('/api/search/material', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: trimmed,
          wavelengthNm: wavelengthVacuumNm,
          currentN1,
          currentN2,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Không thể hoàn tất tra cứu dữ liệu lúc này.');
      }

      setResult(data as SearchResultPayload);
      if (user) {
        void loadHistory();
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tra cứu dữ liệu trực tuyến.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSearch(query);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Search Form & Preset Research Queries */}
      <section
        aria-label="Tra cứu dữ liệu vật liệu điện môi qua Google Search"
        className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-sky-700 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
              Tra cứu vật liệu & dữ liệu quang học
            </h1>
          </div>
          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
            Tìm kiếm thông số chiết suất theo bước sóng, hằng số điện môi và tài liệu thực nghiệm
            mới nhất từ Google Search để nạp trực tiếp vào bộ mô phỏng.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="material-search-input"
              className="block text-[13px] font-semibold text-slate-800 mb-1.5"
            >
              Câu hỏi hoặc tên vật liệu cần tra cứu
            </label>
            <textarea
              id="material-search-input"
              rows={3}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ví dụ: Chiết suất thạch anh nóng chảy SiO2 ở 1550 nm..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 focus:border-sky-600 focus:outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span>Bối cảnh hiện tại:</span>
            <span className="tabular-nums text-slate-700">
              λ₀={formatWavelength(wavelengthVacuumNm)} · n₁={currentN1.toFixed(3)} · n₂=
              {currentN2.toFixed(3)}
            </span>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
            >
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang tìm kiếm nguồn xác thực...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Tra cứu Google Search
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-200 space-y-2.5">
          <div className="text-[13px] font-semibold text-slate-800">Gợi ý tra cứu nhanh</div>
          <div className="space-y-2">
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                disabled={loading}
                onClick={() => {
                  setQuery(example);
                  void executeSearch(example);
                }}
                className="w-full text-left px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-sky-50/70 hover:border-sky-300 text-[13px] text-slate-700 leading-relaxed transition-colors cursor-pointer"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Right: Grounded Answer, Extracted Refractive Index CTA, Sources & History */}
      <section
        aria-label="Kết quả tra cứu và nguồn tham khảo"
        className="lg:col-span-7 space-y-5"
      >
        {!result ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <Sparkles className="w-7 h-7 text-sky-600 mx-auto mb-3" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Sẵn sàng tra cứu dữ liệu quang học & điện môi trực tuyến
            </h2>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
              Nhập tên vật liệu, thủy tinh quang học, tinh thể hoặc bước sóng cụ thể để nhận thông số
              chiết suất mới nhất kèm danh sách nguồn web đối chứng.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Kết quả tổng hợp từ Google Search
                </h2>
                {result.searchQueries.length > 0 && (
                  <p className="text-xs font-mono text-slate-500 mt-0.5 truncate max-w-md">
                    Truy vấn: {result.searchQueries.join(' · ')}
                  </p>
                )}
              </div>

              {result.suggestedN !== null && (
                <button
                  type="button"
                  onClick={() => onApplyRefractiveIndex(result.suggestedN!, query)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Áp dụng n₂ = {result.suggestedN.toFixed(4)}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="p-6 space-y-5">
              <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                {result.answer}
              </div>

              {result.sources.length > 0 && (
                <div className="pt-4 border-t border-slate-200">
                  <h3 className="text-xs font-semibold text-slate-800 mb-2.5">
                    Nguồn tham khảo xác thực ({result.sources.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {result.sources.map((src) => (
                      <li key={src.uri}>
                        <a
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-sky-700 hover:text-sky-900 hover:underline break-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{src.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Saved Search History for Authenticated Users */}
        {history.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-slate-500" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">
                Lịch sử tra cứu đã lưu ({history.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {history.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(item.query);
                        setResult({
                          answer: item.summary,
                          suggestedN: item.suggestedN,
                          sources: item.sources,
                          searchQueries: [],
                        });
                      }}
                      className="text-left text-xs font-medium text-slate-900 hover:text-sky-700 truncate block w-full cursor-pointer"
                    >
                      {item.query}
                    </button>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.summary}</p>
                  </div>
                  {item.suggestedN !== null && (
                    <button
                      type="button"
                      onClick={() => onApplyRefractiveIndex(item.suggestedN!, item.query)}
                      className="px-2.5 py-1 text-[11px] font-mono font-medium rounded border border-slate-200 bg-slate-50 text-sky-800 hover:bg-sky-50 whitespace-nowrap cursor-pointer"
                    >
                      Nạp n₂ = {item.suggestedN.toFixed(3)}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
