import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  Compass,
  KeyRound,
  Loader2,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { formatWavelength, WavePhysicsResult } from '../physics/emPhysics';
import { PolarizationMode } from '../physics/materials';
import {
  AiWavePrediction,
  computeTrajectorySvgGeometry,
  PhysicsCrossCheck,
} from '../utils/aiWavePrediction';
import {
  getStoredGeminiApiKey,
  isStaticHostResponse,
  MissingClientApiKeyError,
  predictWaveClientSide,
} from '../utils/clientStandaloneApi';
import { ClientGeminiKeyPanel } from './ClientGeminiKeyPanel';

interface AiWavePredictorViewProps {
  currentPhysics: WavePhysicsResult;
  currentPolarization: PolarizationMode;
  currentWavelengthNm: number;
  material1Label: string;
  material2Label: string;
  onApplyPrediction: (
    params: {
      n1: number;
      n2: number;
      incidentAngleDeg: number;
      wavelengthVacuumNm: number;
      polarization: PolarizationMode;
    },
    targetTab: 'SIMULATOR' | 'LAB_3D'
  ) => void;
}

interface PredictionApiPayload {
  prediction: AiWavePrediction;
  crossCheck: PhysicsCrossCheck;
}

const PRESET_SCENARIO_PROMPTS = [
  {
    title: 'Lõi sợi quang thạch anh → Không khí (48°)',
    prompt:
      'Tia laser hồng ngoại 1550 nm truyền từ lõi sợi quang thạch anh (n=1.458) ra không khí với góc tới 48°. Dự đoán hướng truyền sóng và kiểm tra xem có xảy ra phản xạ toàn phần hay không.',
    attachLab: false,
  },
  {
    title: 'Tia laser xanh 532 nm → Mặt nước (60°)',
    prompt:
      'Chùm tia laser xanh lá 532 nm phân cực TM chiếu từ không khí xuống mặt nước tinh khiết ở góc tới 60°. Tia khúc xạ lệch về hướng nào và năng lượng truyền qua ra sao?',
    attachLab: false,
  },
  {
    title: 'Sóng radar 10 GHz → Tấm Silicon (35°)',
    prompt:
      'Sóng điện từ vi sóng 10 GHz (bước sóng 30 mm) đi từ không khí vào tấm bán dẫn Silicon (n=3.42) ở góc tới 35°. Dự đoán góc khúc xạ, độ lệch tia và mức suy hao phản xạ.',
    attachLab: false,
  },
  {
    title: 'Dự đoán từ cấu hình đang mô phỏng (+15°)',
    prompt:
      'Dựa trên cấu hình hai môi trường hiện tại trong phòng thí nghiệm, nếu tăng góc tới thêm 15° thì hướng truyền tia khúc xạ và tỷ lệ phản xạ sẽ biến đổi như thế nào?',
    attachLab: true,
  },
];

export const AiWavePredictorView: React.FC<AiWavePredictorViewProps> = ({
  currentPhysics,
  currentPolarization,
  currentWavelengthNm,
  material1Label,
  material2Label,
  onApplyPrediction,
}) => {
  const [scenarioPrompt, setScenarioPrompt] = useState(PRESET_SCENARIO_PROMPTS[0].prompt);
  const [useCurrentLabContext, setUseCurrentLabContext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionApiPayload | null>(null);
  const [showKeyPanel, setShowKeyPanel] = useState(() => Boolean(getStoredGeminiApiKey()));

  const previewGeometry = useMemo(() => {
    if (result) {
      return computeTrajectorySvgGeometry(
        result.prediction.inferredIncidentAngleDeg,
        result.prediction.predictedRefractedAngleDeg,
        420,
        240
      );
    }
    return computeTrajectorySvgGeometry(
      currentPhysics.incidentAngleDeg,
      currentPhysics.refractedAngleDeg,
      420,
      240
    );
  }, [result, currentPhysics.incidentAngleDeg, currentPhysics.refractedAngleDeg]);

  const runPrediction = async (promptText: string, includeLabContext: boolean) => {
    const trimmed = promptText.trim();
    if (trimmed.length < 4) {
      setErrorMsg('Vui lòng nhập mô tả kịch bản hoặc câu hỏi truyền sóng ít nhất 4 ký tự.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      let useClientFallback = false;
      try {
        const response = await fetch('/api/ai/predict-wave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenarioPrompt: trimmed,
            useCurrentLabContext: includeLabContext,
            currentN1: currentPhysics.n1,
            currentN2: currentPhysics.n2,
            currentIncidentAngleDeg: currentPhysics.incidentAngleDeg,
            currentWavelengthNm,
            currentPolarization,
            material1Label,
            material2Label,
          }),
        });

        if (isStaticHostResponse(response)) {
          useClientFallback = true;
        } else {
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data?.error || 'Không thể hoàn tất dự đoán hướng truyền sóng lúc này.');
          }
          setResult(data as PredictionApiPayload);
          return;
        }
      } catch (networkErr: unknown) {
        if (networkErr instanceof TypeError) {
          useClientFallback = true;
        } else {
          throw networkErr;
        }
      }

      if (useClientFallback) {
        const clientResult = await predictWaveClientSide({
          apiKey: getStoredGeminiApiKey(),
          scenarioPrompt: trimmed,
          useCurrentLabContext: includeLabContext,
          currentN1: currentPhysics.n1,
          currentN2: currentPhysics.n2,
          currentIncidentAngleDeg: currentPhysics.incidentAngleDeg,
          currentWavelengthNm,
          currentPolarization,
          material1Label,
          material2Label,
        });
        setResult(clientResult);
      }
    } catch (err: unknown) {
      if (err instanceof MissingClientApiKeyError) {
        setShowKeyPanel(true);
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'Đã xảy ra lỗi khi kết nối công cụ dự đoán AI.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runPrediction(scenarioPrompt, useCurrentLabContext);
  };

  const activeN1 = result ? result.prediction.inferredN1 : currentPhysics.n1;
  const activeN2 = result ? result.prediction.inferredN2 : currentPhysics.n2;
  const activeThetaI = result
    ? result.prediction.inferredIncidentAngleDeg
    : currentPhysics.incidentAngleDeg;
  const activeThetaT = result
    ? result.prediction.predictedRefractedAngleDeg
    : currentPhysics.refractedAngleDeg;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Scenario Input & Lab Context */}
      <section
        aria-label="Nhập kịch bản dự đoán hướng truyền sóng bằng AI"
        className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
            AI dự đoán hướng truyền sóng
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
            Mô tả môi trường, góc chiếu hoặc hiện tượng thực tế để AI suy luận quỹ đạo tia khúc xạ,
            kiểm tra phản xạ toàn phần và đối chứng theo định luật Snell.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="ai-wave-scenario-input"
              className="block text-[13px] font-semibold text-slate-800 mb-1.5"
            >
              Mô tả kịch bản hoặc câu hỏi truyền sóng
            </label>
            <textarea
              id="ai-wave-scenario-input"
              rows={4}
              value={scenarioPrompt}
              onChange={(e) => setScenarioPrompt(e.target.value)}
              placeholder="Ví dụ: Tia laser đỏ 633 nm đi từ kính thủy tinh BK7 ra không khí ở góc tới 45° sẽ truyền theo hướng nào?"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 focus:border-sky-600 focus:outline-none resize-none"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={useCurrentLabContext}
              onChange={(e) => setUseCurrentLabContext(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-sky-700 cursor-pointer"
            />
            <span className="text-[13px] text-slate-700 leading-snug">
              <span className="font-medium text-slate-900 block">
                Đính kèm cấu hình phòng lab hiện tại
              </span>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                n₁={currentPhysics.n1.toFixed(3)} · n₂={currentPhysics.n2.toFixed(3)} · θi=
                {currentPhysics.incidentAngleDeg.toFixed(1)}° · λ₀=
                {formatWavelength(currentWavelengthNm)}
              </span>
            </span>
          </label>

          {errorMsg && (
            <div
              role="alert"
              data-testid="ai-predict-error"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800 leading-relaxed"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
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
                Đang phân tích hướng truyền sóng...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Dự đoán hướng truyền sóng
              </>
            )}
          </button>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowKeyPanel((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-sky-700 transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
              {showKeyPanel ? 'Ẩn cấu hình API Key cá nhân' : 'Dùng Gemini API Key cá nhân (GitHub Pages)'}
            </button>
          </div>

          <ClientGeminiKeyPanel
            isOpen={showKeyPanel}
            onKeySaved={(hasKey) => {
              if (hasKey) setErrorMsg(null);
            }}
          />
        </form>

        <div className="pt-4 border-t border-slate-200 space-y-2.5">
          <div className="text-[13px] font-semibold text-slate-800">Kịch bản gợi ý nhanh</div>
          <div className="space-y-2">
            {PRESET_SCENARIO_PROMPTS.map((item) => (
              <button
                key={item.title}
                type="button"
                disabled={loading}
                onClick={() => {
                  setScenarioPrompt(item.prompt);
                  setUseCurrentLabContext(item.attachLab);
                  setErrorMsg(null);
                }}
                className="w-full text-left px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-sky-50/70 hover:border-sky-300 transition-colors cursor-pointer"
              >
                <div className="text-[13px] font-semibold text-slate-900">{item.title}</div>
                <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                  {item.prompt}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Right Column: Vector Trajectory Diagram, Quantitative Readout & Reasoning */}
      <section
        aria-label="Kết quả dự đoán hướng truyền sóng và kiểm chứng vật lý"
        className="lg:col-span-7 space-y-5"
      >
        {/* Vector Trajectory Diagram Card (Live Preview before run, AI Result after run) */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {result
                  ? result.prediction.directionLabel
                  : 'Sơ đồ vectơ hướng truyền sóng hiện tại'}
              </h2>
              <p className="text-[13px] text-slate-600 mt-0.5">
                {result
                  ? result.prediction.scenarioSummary
                  : 'Nhấn "Dự đoán hướng truyền sóng" để AI suy luận hướng tia và kiểm chứng Snell.'}
              </p>
            </div>
            {result && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onApplyPrediction(
                      {
                        n1: result.prediction.inferredN1,
                        n2: result.prediction.inferredN2,
                        incidentAngleDeg: result.prediction.inferredIncidentAngleDeg,
                        wavelengthVacuumNm: result.prediction.inferredWavelengthNm,
                        polarization: result.prediction.inferredPolarization,
                      },
                      'SIMULATOR'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Nạp vào 2D
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onApplyPrediction(
                      {
                        n1: result.prediction.inferredN1,
                        n2: result.prediction.inferredN2,
                        incidentAngleDeg: result.prediction.inferredIncidentAngleDeg,
                        wavelengthVacuumNm: result.prediction.inferredWavelengthNm,
                        polarization: result.prediction.inferredPolarization,
                      },
                      'LAB_3D'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-sky-900 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Box className="w-3.5 h-3.5" />
                  Xem 3D
                </button>
              </div>
            )}
          </div>

          {/* Crisp SVG Vector Trajectory Visualization */}
          <div className="px-6 py-5 bg-white">
            <svg
              viewBox="0 0 420 240"
              role="img"
              aria-label="Sơ đồ dự đoán hướng truyền tia tới, tia phản xạ và tia khúc xạ"
              className="w-full max-w-[520px] mx-auto h-auto rounded-lg border border-slate-200"
            >
              <defs>
                <marker
                  id="arrow-inc"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0284c7" />
                </marker>
                <marker
                  id="arrow-ref"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#e11d48" />
                </marker>
                <marker
                  id="arrow-trans"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#059669" />
                </marker>
              </defs>

              {/* Medium 1 & Medium 2 zones */}
              <rect x="0" y="0" width="420" height="120" fill="#f8fafc" />
              <rect x="0" y="120" width="420" height="120" fill="#eff6ff" />

              {/* Boundary Interface */}
              <line x1="0" y1="120" x2="420" y2="120" stroke="#334155" strokeWidth="1.6" />
              {/* Normal Line */}
              <line
                x1={previewGeometry.cx}
                y1="14"
                x2={previewGeometry.cx}
                y2="226"
                stroke="#94a3b8"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />

              {/* Incident Ray */}
              <line
                x1={previewGeometry.incStart.x}
                y1={previewGeometry.incStart.y}
                x2={previewGeometry.cx}
                y2={previewGeometry.cy}
                stroke="#0284c7"
                strokeWidth="2.6"
                markerEnd="url(#arrow-inc)"
              />

              {/* Reflected Ray */}
              <line
                x1={previewGeometry.cx}
                y1={previewGeometry.cy}
                x2={previewGeometry.refEnd.x}
                y2={previewGeometry.refEnd.y}
                stroke="#e11d48"
                strokeWidth={previewGeometry.isTir ? '3.0' : '2.0'}
                strokeOpacity={previewGeometry.isTir ? '1' : '0.78'}
                markerEnd="url(#arrow-ref)"
              />

              {/* Refracted Ray or Evanescent Boundary Wave */}
              {previewGeometry.transEnd ? (
                <line
                  x1={previewGeometry.cx}
                  y1={previewGeometry.cy}
                  x2={previewGeometry.transEnd.x}
                  y2={previewGeometry.transEnd.y}
                  stroke="#059669"
                  strokeWidth="2.6"
                  markerEnd="url(#arrow-trans)"
                />
              ) : (
                <path
                  d={`M ${previewGeometry.cx} 124 Q ${previewGeometry.cx + 22} 135 ${previewGeometry.cx + 44} 124 T ${previewGeometry.cx + 88} 124 T ${previewGeometry.cx + 126} 124`}
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="2.2"
                  strokeDasharray="4 3"
                />
              )}

              {/* Incidence Point */}
              <circle cx={previewGeometry.cx} cy={previewGeometry.cy} r="4" fill="#0f172a" />

              {/* Labels */}
              <text x="14" y="22" className="fill-slate-700 text-[11px] font-mono font-semibold">
                MT1 · n₁ = {activeN1.toFixed(3)}
              </text>
              <text x="14" y="226" className="fill-slate-700 text-[11px] font-mono font-semibold">
                MT2 · n₂ = {activeN2.toFixed(3)}
              </text>
              <text
                x={previewGeometry.cx + 6}
                y="24"
                className="fill-slate-500 text-[10px] font-mono"
              >
                Pháp tuyến
              </text>
              <text x="296" y="22" className="fill-sky-800 text-[11px] font-mono font-semibold">
                θi = {activeThetaI.toFixed(1)}°
              </text>
              <text
                x="296"
                y="226"
                className={`text-[11px] font-mono font-semibold ${
                  activeThetaT === null ? 'fill-amber-700' : 'fill-emerald-700'
                }`}
              >
                {activeThetaT === null ? 'TIR (Không khúc xạ)' : `θt = ${activeThetaT.toFixed(1)}°`}
              </text>
            </svg>
          </div>

          {/* Quantitative Readout Grid (only when AI result is present) */}
          {result && (
            <div
              data-testid="ai-prediction-metrics"
              className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200 border-t border-slate-200"
            >
              <div className="p-4">
                <div className="text-xs font-medium text-slate-500 mb-1.5">Góc khúc xạ AI (θt)</div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-emerald-700">
                  {result.prediction.predictedRefractedAngleDeg !== null
                    ? `${result.prediction.predictedRefractedAngleDeg.toFixed(2)}°`
                    : 'TIR'}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs font-medium text-slate-500 mb-1.5">Góc phản xạ (θr)</div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-rose-700">
                  {result.prediction.predictedReflectedAngleDeg.toFixed(2)}°
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs font-medium text-slate-500 mb-1.5">Độ lệch tia (Δθ)</div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-slate-900">
                  {result.prediction.predictedDeviationDeg.toFixed(2)}°
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs font-medium text-slate-500 mb-1.5">Đối chứng Snell</div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-sky-700">
                  {result.crossCheck.exactPhysics.refractedAngleDeg !== null
                    ? `${result.crossCheck.exactPhysics.refractedAngleDeg.toFixed(2)}°`
                    : 'TIR'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Physical Reasoning, Snell Alignment & Engineering Recommendations */}
        {result ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                {result.crossCheck.isDirectionAligned ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                )}
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Giải thích vật lý & Kiểm chứng định luật Snell
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-600 tabular-nums">
                Độ tin cậy: {result.prediction.confidenceLevel}
                {result.crossCheck.angleDiscrepancyDeg !== null
                  ? ` · Sai lệch |Δθt| = ${result.crossCheck.angleDiscrepancyDeg.toFixed(2)}°`
                  : ''}
              </span>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              {result.prediction.physicalReasoning}
            </p>

            {result.prediction.engineeringRecommendations.length > 0 && (
              <div className="pt-4 border-t border-slate-200">
                <h4 className="text-[13px] font-semibold text-slate-900 mb-2.5">
                  Gợi ý kỹ thuật & thí nghiệm tiếp theo
                </h4>
                <ul className="space-y-2 text-sm text-slate-700 leading-relaxed">
                  {result.prediction.engineeringRecommendations.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="font-mono text-xs font-semibold text-sky-700 mt-0.5 select-none">
                        0{idx + 1}.
                      </span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-start gap-3.5">
            <Compass className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1.5">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Cơ chế dự đoán kết hợp AI & Kiểm chứng vật lý
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Mô hình AI suy luận chiết suất hai môi trường, góc tới và nhận định chiều bẻ cong
                tia sóng từ mô tả tự nhiên của bạn; sau đó hệ thống tự động đối chiếu lại bằng định
                luật Snell và phương trình Fresnel để bạn có thể nạp thẳng sang mô phỏng 2D hoặc bàn
                quang học 3D.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
