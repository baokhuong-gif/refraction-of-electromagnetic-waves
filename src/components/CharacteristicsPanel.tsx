import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { formatWavelength, WavePhysicsResult } from '../physics/emPhysics';

interface CharacteristicsPanelProps {
  physics: WavePhysicsResult;
  onOpenAiPredictor?: () => void;
}

export const CharacteristicsPanel: React.FC<CharacteristicsPanelProps> = ({
  physics,
  onOpenAiPredictor,
}) => {
  const { classification } = physics;

  const severityStyles =
    classification.severity === 'critical'
      ? {
          container: 'bg-rose-50/70 border-rose-200',
          title: 'text-rose-950',
          text: 'text-rose-900/90',
          statusColor: 'text-rose-700',
          icon: <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />,
          glyph: '▲',
        }
      : classification.severity === 'transition'
      ? {
          container: 'bg-amber-50/70 border-amber-200',
          title: 'text-amber-950',
          text: 'text-amber-900/90',
          statusColor: 'text-amber-700',
          icon: <Info className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />,
          glyph: '◆',
        }
      : {
          container: 'bg-sky-50/60 border-sky-200',
          title: 'text-slate-900',
          text: 'text-slate-700',
          statusColor: 'text-sky-700',
          icon: <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" aria-hidden="true" />,
          glyph: '●',
        };

  return (
    <section
      aria-label="Nhận dạng đặc tính truyền sóng tự động"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Automatic Propagation Regime Header */}
      <div className={`px-5 py-4.5 border-b ${severityStyles.container}`}>
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2">
          <div className="flex items-center gap-2">
            {severityStyles.icon}
            <h2
              data-testid="regime-label"
              className={`font-display text-lg font-bold tracking-[-0.015em] ${severityStyles.title}`}
            >
              {classification.label}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-mono font-semibold ${severityStyles.statusColor}`}>
              {severityStyles.glyph} {classification.shortTag}
            </span>
            {onOpenAiPredictor && (
              <button
                type="button"
                onClick={onOpenAiPredictor}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-sky-800 hover:text-sky-950 transition-colors whitespace-nowrap cursor-pointer"
              >
                Dự đoán hướng sóng AI
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className={`text-sm leading-relaxed ${severityStyles.text}`}>{classification.summary}</p>

        <ul className="mt-3.5 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-[13px] leading-relaxed text-slate-700">
          {classification.keyCharacteristics.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="font-mono text-xs text-slate-400 mt-0.5 select-none">
                0{idx + 1}.
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Quantitative Wave Propagation Metrics Strip (6-column tabular telemetry grid) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-x divide-y md:divide-y-0 divide-slate-200">
        {/* Metric 1: Refracted Angle / TIR Depth */}
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">
            {physics.isTotalInternalReflection ? 'Sóng suy giảm (δe)' : 'Góc khúc xạ (θt)'}
          </div>
          <div
            data-testid="metric-refracted"
            className="font-mono text-[22px] sm:text-2xl font-semibold tracking-tight tabular-nums text-slate-900 leading-none"
          >
            {physics.isTotalInternalReflection
              ? physics.evanescentPenetrationDepthNm !== null
                ? formatWavelength(physics.evanescentPenetrationDepthNm)
                : 'TIR'
              : `${physics.refractedAngleDeg!.toFixed(2)}°`}
          </div>
          <div className="mt-2 text-xs font-mono text-slate-500 tabular-nums">
            {physics.isTotalInternalReflection
              ? 'Tia ló triệt tiêu (TIR)'
              : `Độ lệch Δθ = ${physics.deviationAngleDeg!.toFixed(2)}°`}
          </div>
        </div>

        {/* Metric 2: Power Reflectance */}
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Phản xạ công suất (R)</div>
          <div
            data-testid="metric-reflectance"
            className="font-mono text-[22px] sm:text-2xl font-semibold tracking-tight tabular-nums text-rose-700 leading-none"
          >
            {(physics.reflectanceEffective * 100).toFixed(2)}
            <span className="text-xs font-normal text-slate-400 ml-1">%</span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-500 tabular-nums">
            Rs {(physics.reflectanceS * 100).toFixed(1)}% · Rp {(physics.reflectanceP * 100).toFixed(1)}%
          </div>
        </div>

        {/* Metric 3: Power Transmittance */}
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Truyền qua công suất (T)</div>
          <div
            data-testid="metric-transmittance"
            className="font-mono text-[22px] sm:text-2xl font-semibold tracking-tight tabular-nums text-emerald-700 leading-none"
          >
            {(physics.transmittanceEffective * 100).toFixed(2)}
            <span className="text-xs font-normal text-slate-400 ml-1">%</span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-500 tabular-nums">
            Ts {(physics.transmittanceS * 100).toFixed(1)}% · Tp {(physics.transmittanceP * 100).toFixed(1)}%
          </div>
        </div>

        {/* Metric 4: Characteristic Angles */}
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Góc Brewster (θB)</div>
          <div className="font-mono text-[22px] sm:text-2xl font-semibold tracking-tight tabular-nums text-slate-900 leading-none">
            {physics.brewsterAngleDeg.toFixed(2)}°
          </div>
          <div className="mt-2 text-xs font-mono text-slate-500 tabular-nums whitespace-nowrap">
            {physics.criticalAngleDeg !== null
              ? `θc = ${physics.criticalAngleDeg.toFixed(2)}°`
              : 'Không có θc (n₂ ≥ n₁)'}
          </div>
        </div>

        {/* Metric 5: Reflection Phase Shift */}
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Dịch pha phản xạ (Δφ)</div>
          <div className="font-mono text-[22px] sm:text-2xl font-semibold tracking-tight tabular-nums text-slate-900 leading-none">
            {physics.phaseShiftSDeg.toFixed(0)}°
            <span className="text-xs font-normal text-slate-400 ml-1">TE</span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-500 tabular-nums whitespace-nowrap">
            TM (p): {physics.phaseShiftPDeg.toFixed(0)}°
          </div>
        </div>

        {/* Metric 6: Wavelength & Phase Velocity in Medium 2 */}
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Bước sóng MT 2</div>
          <div className="font-mono text-[22px] sm:text-2xl font-semibold tracking-tight tabular-nums text-slate-900 leading-none">
            {formatWavelength(physics.wavelength2Nm)}
          </div>
          <div className="mt-2 text-xs font-mono text-slate-500 tabular-nums whitespace-nowrap">
            v₂ = {(physics.phaseVelocity2 / 1e8).toFixed(2)}×10⁸ m/s
          </div>
        </div>
      </div>
    </section>
  );
};
