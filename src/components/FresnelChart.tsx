import React, { useMemo, useRef, useState } from 'react';
import {
  clamp,
  formatWavelength,
  generateFresnelCurve,
  WavePhysicsResult,
} from '../physics/emPhysics';
import { PolarizationMode } from '../physics/materials';

interface FresnelChartProps {
  physics: WavePhysicsResult;
  polarization: PolarizationMode;
  wavelengthVacuumNm: number;
  material1Label: string;
  material2Label: string;
  onSelectAngle: (angleDeg: number) => void;
}

type ChartMode = 'POWER' | 'PHASE';

export const FresnelChart: React.FC<FresnelChartProps> = ({
  physics,
  polarization,
  wavelengthVacuumNm,
  material1Label,
  material2Label,
  onSelectAngle,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('POWER');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const curve = useMemo(
    () =>
      generateFresnelCurve(
        physics.n1,
        physics.n2,
        polarization,
        wavelengthVacuumNm,
        1
      ),
    [physics.n1, physics.n2, polarization, wavelengthVacuumNm]
  );

  // SVG layout coordinates
  const W = 560;
  const H = 230;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOfAngle = (deg: number) => padL + (clamp(deg, 0, 90) / 90) * plotW;
  const yOfRatio = (r: number) => padT + (1 - clamp(r, 0, 1)) * plotH;
  const yOfPhase = (deg: number) => padT + (1 - clamp(deg, 0, 180) / 180) * plotH;

  const buildPath = (accessor: (pt: (typeof curve)[number]) => number, isPhase = false) => {
    return curve
      .map((pt, i) => {
        const x = xOfAngle(pt.angleDeg);
        const y = isPhase ? yOfPhase(accessor(pt)) : yOfRatio(accessor(pt));
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const pathRs = useMemo(() => buildPath((pt) => pt.Rs, false), [curve]);
  const pathRp = useMemo(() => buildPath((pt) => pt.Rp, false), [curve]);
  const pathTeff = useMemo(() => buildPath((pt) => pt.Teff, false), [curve]);
  const pathPhaseS = useMemo(() => buildPath((pt) => pt.phaseS, true), [curve]);
  const pathPhaseP = useMemo(() => buildPath((pt) => pt.phaseP, true), [curve]);

  const updateAngleFromSvgPointer = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    const angle = ((relX - padL) / plotW) * 90;
    onSelectAngle(Math.round(clamp(angle, 0, 89.5) * 10) / 10);
  };

  const cursorX = xOfAngle(physics.incidentAngleDeg);
  const brewsterX = xOfAngle(physics.brewsterAngleDeg);
  const criticalX =
    physics.criticalAngleDeg !== null ? xOfAngle(physics.criticalAngleDeg) : null;

  return (
    <section
      aria-label="Đồ thị đặc trưng Fresnel và bảng thông số điện từ"
      className="grid grid-cols-1 xl:grid-cols-12 gap-5"
    >
      {/* Interactive Fresnel Chart */}
      <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Đường cong đặc tính Fresnel theo góc tới θi
            </h3>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Nhấp hoặc kéo trên đồ thị để quét nhanh góc tới θi
            </p>
          </div>

          <div
            role="group"
            aria-label="Chế độ đồ thị Fresnel"
            className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg"
          >
            <button
              type="button"
              aria-pressed={chartMode === 'POWER'}
              onClick={() => setChartMode('POWER')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                chartMode === 'POWER'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Công suất (R, T)
            </button>
            <button
              type="button"
              aria-pressed={chartMode === 'PHASE'}
              onClick={() => setChartMode('PHASE')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                chartMode === 'PHASE'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dịch pha (Δφ)
            </button>
          </div>
        </div>

        {/* SVG Plot */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto select-none cursor-crosshair"
          role="img"
          aria-label="Đồ thị phương trình Fresnel theo góc tới từ 0 đến 90 độ"
          onPointerDown={(e) => {
            setIsScrubbing(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            updateAngleFromSvgPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (isScrubbing) updateAngleFromSvgPointer(e.clientX);
          }}
          onPointerUp={(e) => {
            setIsScrubbing(false);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
        >
          {/* Grid lines Y */}
          {(chartMode === 'POWER' ? [0, 0.25, 0.5, 0.75, 1] : [0, 45, 90, 135, 180]).map(
            (tick) => {
              const y = chartMode === 'POWER' ? yOfRatio(tick) : yOfPhase(tick);
              return (
                <g key={tick}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={W - padR}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                  <text
                    x={padL - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono"
                  >
                    {chartMode === 'POWER' ? `${Math.round(tick * 100)}%` : `${tick}°`}
                  </text>
                </g>
              );
            }
          )}

          {/* Grid lines X */}
          {[0, 15, 30, 45, 60, 75, 90].map((deg) => {
            const x = xOfAngle(deg);
            return (
              <g key={deg}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={H - padB}
                  stroke="#f1f5f9"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={H - padB + 15}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px] font-mono"
                >
                  {deg}°
                </text>
              </g>
            );
          })}

          {/* Axes border */}
          <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#94a3b8" strokeWidth={1.2} />
          <line
            x1={padL}
            y1={H - padB}
            x2={W - padR}
            y2={H - padB}
            stroke="#94a3b8"
            strokeWidth={1.2}
          />

          {/* Brewster angle reference line */}
          {Math.abs(physics.n1 - physics.n2) > 0.005 && (
            <g>
              <line
                x1={brewsterX}
                y1={padT}
                x2={brewsterX}
                y2={H - padB}
                stroke="#d97706"
                strokeWidth={1.1}
                strokeDasharray="3 3"
              />
              <text
                x={Math.min(W - 42, brewsterX + 4)}
                y={padT + 11}
                className="fill-amber-700 text-[10px] font-mono font-medium"
              >
                θB
              </text>
            </g>
          )}

          {/* Critical angle reference line */}
          {criticalX !== null && (
            <g>
              <line
                x1={criticalX}
                y1={padT}
                x2={criticalX}
                y2={H - padB}
                stroke="#dc2626"
                strokeWidth={1.1}
                strokeDasharray="4 3"
              />
              <text
                x={Math.max(padL + 4, criticalX - 18)}
                y={padT + 11}
                className="fill-rose-700 text-[10px] font-mono font-medium"
              >
                θc
              </text>
            </g>
          )}

          {/* Curves */}
          {chartMode === 'POWER' ? (
            <>
              <path
                d={pathTeff}
                fill="none"
                stroke="#059669"
                strokeWidth={1.8}
                strokeDasharray="5 3"
              />
              <path d={pathRs} fill="none" stroke="#dc2626" strokeWidth={2} />
              <path d={pathRp} fill="none" stroke="#0284c7" strokeWidth={2} />
            </>
          ) : (
            <>
              <path d={pathPhaseS} fill="none" stroke="#dc2626" strokeWidth={2} />
              <path d={pathPhaseP} fill="none" stroke="#0284c7" strokeWidth={2} />
            </>
          )}

          {/* Current Angle Vertical Cursor & Highlight Dots */}
          <line
            x1={cursorX}
            y1={padT}
            x2={cursorX}
            y2={H - padB}
            stroke="#0f172a"
            strokeWidth={1.4}
          />

          {chartMode === 'POWER' ? (
            <>
              <circle
                cx={cursorX}
                cy={yOfRatio(physics.reflectanceS)}
                r={4}
                fill="#dc2626"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              <circle
                cx={cursorX}
                cy={yOfRatio(physics.reflectanceP)}
                r={4}
                fill="#0284c7"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              <circle
                cx={cursorX}
                cy={yOfRatio(physics.transmittanceEffective)}
                r={3.5}
                fill="#059669"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            </>
          ) : (
            <>
              <circle
                cx={cursorX}
                cy={yOfPhase(physics.phaseShiftSDeg)}
                r={4}
                fill="#dc2626"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              <circle
                cx={cursorX}
                cy={yOfPhase(physics.phaseShiftPDeg)}
                r={4}
                fill="#0284c7"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            </>
          )}

          {/* X-Axis Title */}
          <text
            x={padL + plotW / 2}
            y={H - 4}
            textAnchor="middle"
            className="fill-slate-500 text-[10.5px]"
          >
            Góc tới θi (độ)
          </text>
        </svg>

        {/* Clean Unboxed Legend */}
        <div className="mt-2 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          {chartMode === 'POWER' ? (
            <div className="flex flex-wrap items-center gap-4 font-mono">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-rose-600 inline-block" /> Rs (TE)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-sky-600 inline-block" /> Rp (TM)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-emerald-600 inline-block" />{' '}
                Truyền qua T
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 font-mono">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-rose-600 inline-block" /> Δφs (TE)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-sky-600 inline-block" /> Δφp (TM)
              </span>
            </div>
          )}
          <span className="font-mono text-slate-700 tabular-nums">
            Hiện tại: θi = {physics.incidentAngleDeg.toFixed(1)}°
          </span>
        </div>
      </div>

      {/* Electromagnetic Medium Parameter Comparison Table */}
      <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-slate-900 mb-1">
            Thông số truyền sóng điện từ hai môi trường
          </h3>
          <p className="text-[13px] text-slate-500 mb-4">
            So sánh trực tiếp đặc tính điện môi, vận tốc pha và trở kháng sóng
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-2 font-medium">Đại lượng</th>
                  <th className="py-2.5 px-2 font-medium text-right">Môi trường 1</th>
                  <th className="py-2.5 pl-2 font-medium text-right">Môi trường 2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums text-slate-800">
                <tr>
                  <td className="py-2.5 pr-2 font-sans text-slate-600">Chiết suất (n)</td>
                  <td className="py-2.5 px-2 text-right font-semibold">{physics.n1.toFixed(4)}</td>
                  <td className="py-2.5 pl-2 text-right font-semibold">{physics.n2.toFixed(4)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-2 font-sans text-slate-600">Hằng số điện môi (εr)</td>
                  <td className="py-2.5 px-2 text-right">{physics.permittivity1.toFixed(3)}</td>
                  <td className="py-2.5 pl-2 text-right">{physics.permittivity2.toFixed(3)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-2 font-sans text-slate-600">Trở kháng sóng (Z)</td>
                  <td className="py-2.5 px-2 text-right">{physics.impedance1Ohm.toFixed(1)} Ω</td>
                  <td className="py-2.5 pl-2 text-right">{physics.impedance2Ohm.toFixed(1)} Ω</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-2 font-sans text-slate-600">Vận tốc pha (v = c/n)</td>
                  <td className="py-2.5 px-2 text-right">
                    {(physics.phaseVelocity1 / 1e8).toFixed(3)}×10⁸
                  </td>
                  <td className="py-2.5 pl-2 text-right">
                    {(physics.phaseVelocity2 / 1e8).toFixed(3)}×10⁸
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-2 font-sans text-slate-600">Bước sóng nội môi (λ)</td>
                  <td className="py-2.5 px-2 text-right">{formatWavelength(physics.wavelength1Nm)}</td>
                  <td className="py-2.5 pl-2 text-right">{formatWavelength(physics.wavelength2Nm)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-2 font-sans text-slate-600">Hệ số biên độ |r|</td>
                  <td className="py-2.5 px-2 text-right text-slate-600">
                    |rs| = {physics.rsMag.toFixed(3)}
                  </td>
                  <td className="py-2.5 pl-2 text-right text-slate-600">
                    |rp| = {physics.rpMag.toFixed(3)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
          <span className="font-medium text-slate-700">Môi trường:</span> {material1Label} →{' '}
          {material2Label}. Định luật bảo toàn năng lượng:{' '}
          <span className="font-mono text-slate-800">
            R + T = {((physics.reflectanceEffective + physics.transmittanceEffective) * 100).toFixed(1)}%
          </span>
          .
        </div>
      </div>
    </section>
  );
};
