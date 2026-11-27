import React, { useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { OpticalMaterial } from '../physics/materials';
import {
  buildMaterialIndexTooltipData,
  buildRefractiveComparisonModel,
  ComparisonCategoryFilter,
  MaterialBracketSummary,
} from '../utils/refractiveComparison';

interface RefractiveIndexComparisonChartProps {
  n1: number;
  n2: number;
  material1Id: string;
  material2Id: string;
  material1Label: string;
  material2Label: string;
  onSelectMaterialForN1: (material: OpticalMaterial) => void;
  onSelectMaterialForN2: (material: OpticalMaterial) => void;
}

const CATEGORY_TABS: Array<{ id: ComparisonCategoryFilter; label: string }> = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'GAS_LIQUID', label: 'Khí & Lỏng' },
  { id: 'OPTICAL', label: 'Quang học' },
  { id: 'RF_SEMI', label: 'Bán dẫn & RF' },
];

function formatBracketDescription(
  mediumLabel: string,
  n: number,
  bracket: MaterialBracketSummary
): string {
  const formattedLabel = mediumLabel.includes('(n =')
    ? mediumLabel
    : `${mediumLabel} (n = ${n.toFixed(3)})`;

  if (bracket.exactMatch) {
    if (bracket.exactMatch.name === mediumLabel) {
      return `Khớp chuẩn thư viện: ${bracket.exactMatch.name} (n = ${n.toFixed(3)}).`;
    }
    return `${formattedLabel} khớp chuẩn với ${bracket.exactMatch.name}.`;
  }
  if (bracket.lowerNeighbor && bracket.upperNeighbor) {
    return `${formattedLabel} nằm giữa ${bracket.lowerNeighbor.name} (${bracket.lowerNeighbor.refractiveIndex.toFixed(3)}) và ${bracket.upperNeighbor.name} (${bracket.upperNeighbor.refractiveIndex.toFixed(3)}).`;
  }
  if (bracket.lowerNeighbor) {
    return `${formattedLabel} cao hơn vật liệu cao nhất trong thư viện là ${bracket.lowerNeighbor.name} (${bracket.lowerNeighbor.refractiveIndex.toFixed(3)}).`;
  }
  return `${formattedLabel} gần nhất với ${bracket.nearest.name} (${bracket.nearest.refractiveIndex.toFixed(3)}).`;
}

function getMarkerHorizontalShift(pct: number): string {
  if (pct < 12) return 'translateX(0%)';
  if (pct > 88) return 'translateX(-100%)';
  return 'translateX(-50%)';
}

function formatSignedDelta(delta: number): string {
  if (Math.abs(delta) < 0.0005) return '0.000';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(3)}`;
}

function formatVelocityShort(vMs: number): string {
  return `${(vMs / 1e8).toFixed(2)}×10⁸ m/s`;
}

interface ActiveTooltipState {
  material: OpticalMaterial;
  isCurrentN1: boolean;
  isCurrentN2: boolean;
  placement: 'top' | 'bottom';
  topPx: number;
  bottomOffsetPx: number;
  leftPx: number | null;
}

export const RefractiveIndexComparisonChart: React.FC<RefractiveIndexComparisonChartProps> = ({
  n1,
  n2,
  material1Id,
  material2Id,
  material1Label,
  material2Label,
  onSelectMaterialForN1,
  onSelectMaterialForN2,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<ComparisonCategoryFilter>('ALL');
  const [assignTarget, setAssignTarget] = useState<'N1' | 'N2'>('N2');
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltipState | null>(null);
  const plotAreaRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const model = useMemo(
    () =>
      buildRefractiveComparisonModel({
        n1,
        n2,
        material1Id,
        material2Id,
        categoryFilter,
      }),
    [n1, n2, material1Id, material2Id, categoryFilter]
  );

  const tooltipData = useMemo(() => {
    if (!activeTooltip) return null;
    return buildMaterialIndexTooltipData(activeTooltip.material, n1, n2);
  }, [activeTooltip, n1, n2]);

  const handleActivateTooltip = (
    material: OpticalMaterial,
    widthPct: number,
    isCurrentN1: boolean,
    isCurrentN2: boolean,
    rowEl: HTMLButtonElement
  ) => {
    const plotEl = plotAreaRef.current;
    if (!plotEl) return;

    const plotWidth = plotEl.offsetWidth;
    const plotHeight = plotEl.offsetHeight;
    const rowRect = rowEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rowRect.bottom;
    const spaceAbove = rowRect.top;
    const placement: 'top' | 'bottom' =
      spaceBelow < 255 && spaceAbove > spaceBelow ? 'top' : 'bottom';

    const tooltipWidth = 420;
    let leftPx: number | null = null;
    if (plotWidth >= 540) {
      const trackStart = 210;
      const trackWidth = Math.max(120, plotWidth - trackStart - 104);
      const desiredLeft = trackStart + (widthPct / 100) * trackWidth * 0.45 - 60;
      leftPx = Math.max(0, Math.min(desiredLeft, plotWidth - tooltipWidth));
    }

    setActiveTooltip({
      material,
      isCurrentN1,
      isCurrentN2,
      placement,
      topPx: rowEl.offsetTop + rowEl.offsetHeight + 8,
      bottomOffsetPx: plotHeight - rowEl.offsetTop + 8,
      leftPx,
    });
  };

  const handleRowClick = (mat: OpticalMaterial) => {
    if (assignTarget === 'N1') {
      onSelectMaterialForN1(mat);
    } else {
      onSelectMaterialForN2(mat);
    }
  };

  const transition = prefersReducedMotion
    ? { duration: 0.01 }
    : { type: 'spring' as const, stiffness: 320, damping: 32 };

  const deltaSign = model.deltaN > 0.0005 ? '+' : '';

  return (
    <section
      aria-label="Biểu đồ so sánh chiết suất với thư viện vật liệu"
      data-testid="refractive-comparison-chart"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5"
    >
      {/* Header & Interactive Controls */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-base sm:text-lg font-semibold text-slate-900">
            Biểu đồ so sánh chiết suất (n₁, n₂) với thư viện vật liệu
          </h3>
          <p className="text-[13px] text-slate-600 leading-relaxed">
            Đối chiếu nhanh hai môi trường đang mô phỏng trên phổ chiết suất điện môi ·{' '}
            <span className="font-mono text-xs text-slate-700 tabular-nums">
              n₂/n₁ = {model.ratioN2ToN1.toFixed(2)}× · Δn = {deltaSign}
              {model.deltaN.toFixed(3)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Category Filter */}
          <div
            role="group"
            aria-label="Lọc nhóm vật liệu trong biểu đồ"
            className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={categoryFilter === tab.id}
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === tab.id
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Click-to-assign Target Selector */}
          <div
            role="group"
            aria-label="Chọn môi trường áp dụng khi nhấp thanh vật liệu"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            <span className="pl-2 pr-1 text-xs text-slate-500 whitespace-nowrap">
              <span className="sm:hidden">Gán:</span>
              <span className="hidden sm:inline">Nhấp để gán:</span>
            </span>
            <button
              type="button"
              aria-pressed={assignTarget === 'N1'}
              onClick={() => setAssignTarget('N1')}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                assignTarget === 'N1'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              n₁
            </button>
            <button
              type="button"
              aria-pressed={assignTarget === 'N2'}
              onClick={() => setAssignTarget('N2')}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                assignTarget === 'N2'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              n₂
            </button>
          </div>
        </div>
      </div>

      {/* Calibrated Horizontal Bar Chart with Full-Height n1 & n2 Reference Overlay */}
      <div className="space-y-2">
        {/* Top Reference Callout & Scale Axis Header */}
        <div className="grid grid-cols-[118px_minmax(0,1fr)_52px] sm:grid-cols-[210px_minmax(0,1fr)_104px] gap-2 sm:gap-3 items-end">
          <div className="text-xs font-medium text-slate-500 pb-1">Vật liệu chuẩn</div>

          {/* Scale Track Header + Floating n1/n2 Pin Labels */}
          <div className="relative h-14 sm:h-11">
            {/* n1 marker label */}
            <motion.div
              data-testid="chart-marker-n1"
              animate={{ left: `${model.n1Pct}%` }}
              transition={transition}
              style={{ transform: getMarkerHorizontalShift(model.n1Pct) }}
              className={`absolute ${
                model.markersAreClose ? 'top-0' : 'top-0 sm:top-0.5'
              } font-mono text-[11px] font-semibold text-sky-800 whitespace-nowrap tabular-nums select-none`}
            >
              n₁ {n1.toFixed(3)}
            </motion.div>

            {/* n2 marker label (staggered vertically on narrow screens or when close to n1) */}
            <motion.div
              data-testid="chart-marker-n2"
              animate={{ left: `${model.n2Pct}%` }}
              transition={transition}
              style={{ transform: getMarkerHorizontalShift(model.n2Pct) }}
              className={`absolute ${
                model.markersAreClose ? 'top-4' : 'top-4 sm:top-0.5'
              } font-mono text-[11px] font-semibold text-indigo-700 whitespace-nowrap tabular-nums select-none`}
            >
              n₂ {n2.toFixed(3)}
            </motion.div>

            {/* Calibrated numeric axis ticks positioned strictly at true mathematical percentages */}
            <div className="absolute inset-x-0 bottom-0 h-4 border-b border-slate-200 text-[11px] font-mono text-slate-400 tabular-nums">
              {model.ticks.map((tick, idx) => {
                const pct =
                  ((tick - model.minScale) / (model.maxScale - model.minScale)) * 100;
                const isFirst = idx === 0;
                const isLast = idx === model.ticks.length - 1;
                const showOnMobile = isFirst || isLast || (idx % 2 === 0 && pct <= 72);
                const shift = isFirst
                  ? 'translateX(0%)'
                  : isLast
                  ? 'translateX(-100%)'
                  : 'translateX(-50%)';
                return (
                  <span
                    key={tick}
                    style={{ left: `${pct}%`, transform: shift }}
                    className={`absolute bottom-0.5 leading-none ${
                      showOnMobile ? 'inline' : 'hidden sm:inline'
                    }`}
                  >
                    {tick.toFixed(1)}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="text-xs font-medium text-slate-500 text-right pb-1">
            <span className="sm:hidden">n</span>
            <span className="hidden sm:inline">n / εr</span>
          </div>
        </div>

        {/* Plot Area: Rows + Vertical Gridlines + n1/n2 Span & Reference Lines */}
        <div ref={plotAreaRef} className="relative">
          {/* Background vertical gridlines & n1/n2 overlay aligned strictly to the middle column */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid grid-cols-[118px_minmax(0,1fr)_52px] sm:grid-cols-[210px_minmax(0,1fr)_104px] gap-2 sm:gap-3"
          >
            <div />
            <div className="relative h-full">
              {/* Vertical scale grid ticks */}
              {model.ticks.map((tick) => {
                const pct =
                  ((tick - model.minScale) / (model.maxScale - model.minScale)) * 100;
                return (
                  <div
                    key={tick}
                    style={{ left: `${pct}%` }}
                    className="absolute inset-y-0 border-l border-slate-100"
                  />
                );
              })}

              {/* Shaded Optical Contrast Span between n1 and n2 */}
              {model.spanWidthPct > 0.4 && (
                <motion.div
                  initial={false}
                  animate={{
                    left: `${model.spanLeftPct}%`,
                    width: `${model.spanWidthPct}%`,
                  }}
                  transition={transition}
                  className={`absolute inset-y-0 ${
                    model.deltaN >= 0 ? 'bg-sky-100/45' : 'bg-amber-100/45'
                  }`}
                />
              )}

              {/* Full-height vertical reference line for n1 */}
              <motion.div
                initial={false}
                animate={{ left: `${model.n1Pct}%` }}
                transition={transition}
                className="absolute inset-y-0 w-0.5 bg-sky-600/85 z-10"
              />

              {/* Full-height vertical reference line for n2 */}
              <motion.div
                initial={false}
                animate={{ left: `${model.n2Pct}%` }}
                transition={transition}
                className="absolute inset-y-0 w-0.5 bg-indigo-600/85 z-10"
              />
            </div>
            <div />
          </div>

          {/* Interactive Material Bar Rows */}
          <div
            onMouseLeave={() => setActiveTooltip(null)}
            className="relative z-20 divide-y divide-slate-100/80"
          >
            {model.items.map(({ material, widthPct, isCurrentN1, isCurrentN2 }) => {
              const isMatched = isCurrentN1 || isCurrentN2;
              const isRowHovered = activeTooltip?.material.id === material.id;
              const barColorClass =
                isCurrentN1 && isCurrentN2
                  ? 'bg-teal-600'
                  : isCurrentN1
                  ? 'bg-sky-600'
                  : isCurrentN2
                  ? 'bg-indigo-600'
                  : 'bg-slate-300 group-hover:bg-slate-400';

              return (
                <button
                  key={material.id}
                  type="button"
                  data-testid={`comparison-bar-${material.id}`}
                  aria-describedby={isRowHovered ? 'material-index-tooltip' : undefined}
                  onClick={() => handleRowClick(material)}
                  onMouseEnter={(e) =>
                    handleActivateTooltip(
                      material,
                      widthPct,
                      isCurrentN1,
                      isCurrentN2,
                      e.currentTarget
                    )
                  }
                  onFocus={(e) =>
                    handleActivateTooltip(
                      material,
                      widthPct,
                      isCurrentN1,
                      isCurrentN2,
                      e.currentTarget
                    )
                  }
                  onBlur={() => setActiveTooltip(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setActiveTooltip(null);
                  }}
                  aria-label={`Chọn ${material.name}, chiết suất ${material.refractiveIndex.toFixed(3)}, gán cho ${
                    assignTarget === 'N1' ? 'môi trường 1' : 'môi trường 2'
                  }`}
                  className={`group w-full text-left grid grid-cols-[118px_minmax(0,1fr)_52px] sm:grid-cols-[210px_minmax(0,1fr)_104px] gap-2 sm:gap-3 items-center py-2 rounded-md transition-colors cursor-pointer ${
                    isRowHovered
                      ? 'bg-sky-50/60'
                      : isMatched
                      ? 'bg-slate-50/80'
                      : 'hover:bg-slate-50/70'
                  }`}
                >
                  {/* Material Name, Info Affordance & Active Match Indicator (Zero-Pill unboxed text) */}
                  <div className="min-w-0 pr-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-[13px] truncate ${
                          isMatched || isRowHovered
                            ? 'font-semibold text-slate-950'
                            : 'font-medium text-slate-700 group-hover:text-slate-950'
                        }`}
                      >
                        {material.name}
                      </span>
                      {isCurrentN1 && (
                        <span className="font-mono text-[11px] font-semibold text-sky-700 shrink-0">
                          n₁
                        </span>
                      )}
                      {isCurrentN2 && (
                        <span className="font-mono text-[11px] font-semibold text-indigo-700 shrink-0">
                          n₂
                        </span>
                      )}
                      <Info
                        aria-hidden="true"
                        className="hidden sm:inline-block w-3.5 h-3.5 text-slate-300 group-hover:text-sky-600 group-focus-visible:text-sky-600 transition-colors shrink-0 ml-auto"
                      />
                    </div>
                  </div>

                  {/* Calibrated Bar Track */}
                  <div className="relative h-4 flex items-center">
                    <div className="w-full h-2.5 bg-slate-100/90 rounded-r-sm overflow-hidden">
                      <motion.div
                        initial={false}
                        animate={{ width: `${Math.max(1.2, widthPct)}%` }}
                        transition={transition}
                        className={`h-full rounded-r-sm transition-colors ${barColorClass}`}
                      />
                    </div>
                  </div>

                  {/* Tabular Numeric Readout: n and εr */}
                  <div className="text-right font-mono tabular-nums leading-tight shrink-0">
                    <span
                      className={`text-[13px] ${
                        isMatched || isRowHovered
                          ? 'font-semibold text-slate-950'
                          : 'font-medium text-slate-800'
                      }`}
                    >
                      {material.refractiveIndex.toFixed(3)}
                    </span>
                    <span className="text-[11px] text-slate-400 ml-1.5 hidden sm:inline">
                      ({material.relativePermittivity.toFixed(1)})
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Floating Detailed Refractive Index Tooltip (Hover / Keyboard Focus) */}
          <AnimatePresence>
            {activeTooltip && tooltipData && (
              <motion.div
                key={activeTooltip.material.id}
                id="material-index-tooltip"
                role="tooltip"
                data-testid="material-index-tooltip"
                initial={
                  prefersReducedMotion
                    ? { opacity: 1 }
                    : {
                        opacity: 0,
                        y: activeTooltip.placement === 'top' ? 5 : -5,
                      }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                style={
                  activeTooltip.placement === 'top'
                    ? {
                        bottom: `${activeTooltip.bottomOffsetPx}px`,
                        ...(activeTooltip.leftPx !== null
                          ? { left: `${activeTooltip.leftPx}px`, width: '420px' }
                          : { left: 0, right: 0 }),
                      }
                    : {
                        top: `${activeTooltip.topPx}px`,
                        ...(activeTooltip.leftPx !== null
                          ? { left: `${activeTooltip.leftPx}px`, width: '420px' }
                          : { left: 0, right: 0 }),
                      }
                }
                className="pointer-events-none absolute z-40 max-w-full bg-white/98 backdrop-blur-xs border border-slate-300/90 rounded-xl shadow-lg shadow-slate-900/12 p-3.5 sm:p-4 text-left"
              >
                {/* Header: Material Name, Category, Exact Index n */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-display text-sm font-semibold text-slate-950 leading-snug">
                        {tooltipData.material.name}
                      </span>
                      {activeTooltip.isCurrentN1 && (
                        <span className="font-mono text-[11px] font-semibold text-sky-700">
                          · Đang là n₁
                        </span>
                      )}
                      {activeTooltip.isCurrentN2 && (
                        <span className="font-mono text-[11px] font-semibold text-indigo-700">
                          · Đang là n₂
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {tooltipData.material.category}
                      {tooltipData.dispersionNote ? ` · ${tooltipData.dispersionNote}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-bold text-slate-950 tabular-nums">
                      n = {tooltipData.material.refractiveIndex.toFixed(3)}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                      εr = {tooltipData.material.relativePermittivity.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Detailed Physical Explanation of Refractive Index n */}
                <p
                  data-testid="tooltip-n-explanation"
                  className="mt-2.5 text-xs text-slate-700 leading-relaxed"
                >
                  {tooltipData.material.indexExplanation}
                </p>

                {/* Derived Electromagnetic & Optical Metrics Grid */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                  <div>
                    <div className="text-slate-500">Vận tốc pha (v = c/n)</div>
                    <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                      {formatVelocityShort(tooltipData.phaseVelocityMs)}{' '}
                      <span className="font-normal text-slate-500">
                        ({tooltipData.speedPercentOfC.toFixed(1)}% c)
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">Nén bước sóng & Trở kháng</div>
                    <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                      λ = {tooltipData.wavelengthScalePct.toFixed(1)}% λ₀ ·{' '}
                      <span className="font-normal text-slate-600">
                        {tooltipData.impedanceOhm.toFixed(0)} Ω
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">Góc tới hạn & Brewster (vs KK)</div>
                    <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                      {tooltipData.criticalAngleToAirDeg !== null ? (
                        <>
                          θc = {tooltipData.criticalAngleToAirDeg.toFixed(1)}° · θB ={' '}
                          {tooltipData.brewsterAngleFromAirDeg.toFixed(1)}°
                        </>
                      ) : (
                        'Chuẩn tham chiếu (không có θc)'
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">Phản xạ trực giao từ không khí</div>
                    <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                      R₀ = {tooltipData.normalReflectanceFromAirPct.toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Live Comparison Delta vs Active n1, n2 */}
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="font-mono text-slate-600 tabular-nums">
                    So với hiện tại:{' '}
                    <span className="text-sky-700 font-semibold">
                      Δn₁ {formatSignedDelta(tooltipData.deltaVsN1)}
                    </span>{' '}
                    ·{' '}
                    <span className="text-indigo-700 font-semibold">
                      Δn₂ {formatSignedDelta(tooltipData.deltaVsN2)}
                    </span>
                  </div>
                  <span className="text-slate-400">
                    Nhấp để gán {assignTarget === 'N1' ? 'n₁' : 'n₂'}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom Positioning Summary & Legend (Persistent Unboxed Editorial Telemetry) */}
      <div className="pt-3.5 border-t border-slate-200 flex flex-col gap-2.5 text-[13px] text-slate-600">
        <div
          data-testid="comparison-bracket-summary"
          className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 leading-relaxed"
        >
          <div>
            <span className="font-mono text-xs font-semibold text-sky-700 mr-1.5">n₁</span>
            {formatBracketDescription(material1Label, n1, model.n1Bracket)}
          </div>
          <div>
            <span className="font-mono text-xs font-semibold text-indigo-700 mr-1.5">n₂</span>
            {formatBracketDescription(material2Label, n2, model.n2Bracket)}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-4 font-mono">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-sky-600 inline-block" />
              Môi trường 1 (n₁)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-600 inline-block" />
              Môi trường 2 (n₂)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-3 h-2.5 rounded-xs inline-block border ${
                  model.deltaN >= 0
                    ? 'bg-sky-100 border-sky-300'
                    : 'bg-amber-100 border-amber-300'
                }`}
              />
              {model.deltaN >= 0 ? 'Vùng chênh lệch chiết quang tăng' : 'Vùng chiết quang giảm (có θc)'}
            </span>
          </div>
          <span className="text-slate-400">
            Di chuột vào từng dòng xem giải thích chỉ số n · Nhấp để gán vào{' '}
            {assignTarget === 'N1' ? 'n₁' : 'n₂'}
          </span>
        </div>
      </div>
    </section>
  );
};
