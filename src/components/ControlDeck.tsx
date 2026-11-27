import React, { useEffect, useState } from 'react';
import { ArrowUpDown, BookOpen, FileDown } from 'lucide-react';
import { motion } from 'motion/react';
import {
  formatFrequency,
  formatWavelength,
  WavePhysicsResult,
  wavelengthToColor,
} from '../physics/emPhysics';
import {
  OPTICAL_MATERIALS,
  PolarizationMode,
  PRESET_SCENARIOS,
  PresetScenario,
  SpectrumBand,
} from '../physics/materials';
import { AnimatedLabSlider, SliderMarker } from './AnimatedLabSlider';
import { PhysicsFormulasModal } from './PhysicsFormulasModal';

interface ControlDeckProps {
  n1: number;
  n2: number;
  material1Id: string;
  material2Id: string;
  incidentAngleDeg: number;
  polarization: PolarizationMode;
  wavelengthVacuumNm: number;
  band: SpectrumBand;
  activeScenarioId: string | null;
  physics: WavePhysicsResult;
  onSelectScenario: (scenario: PresetScenario) => void;
  onChangeMaterial1: (id: string, n: number) => void;
  onChangeMaterial2: (id: string, n: number) => void;
  onSwapMedia: () => void;
  onChangeIncidentAngle: (deg: number) => void;
  onChangePolarization: (pol: PolarizationMode) => void;
  onChangeBand: (band: SpectrumBand) => void;
  onChangeWavelengthNm: (nm: number) => void;
  onExportPdf: () => void;
}

export const ControlDeck: React.FC<ControlDeckProps> = ({
  n1,
  n2,
  material1Id,
  material2Id,
  incidentAngleDeg,
  polarization,
  wavelengthVacuumNm,
  band,
  activeScenarioId,
  physics,
  onSelectScenario,
  onChangeMaterial1,
  onChangeMaterial2,
  onSwapMedia,
  onChangeIncidentAngle,
  onChangePolarization,
  onChangeBand,
  onChangeWavelengthNm,
  onExportPdf,
}) => {
  const waveColor = wavelengthToColor(wavelengthVacuumNm);

  // Direct numeric input strings with strict inline validation
  const [angleInput, setAngleInput] = useState(incidentAngleDeg.toFixed(1));
  const [n1Input, setN1Input] = useState(n1.toFixed(3));
  const [n2Input, setN2Input] = useState(n2.toFixed(3));

  const [angleError, setAngleError] = useState<string | null>(null);
  const [n1Error, setN1Error] = useState<string | null>(null);
  const [n2Error, setN2Error] = useState<string | null>(null);
  const [isFormulasOpen, setIsFormulasOpen] = useState(false);

  // Sync external slider/canvas changes into text boxes
  useEffect(() => {
    setAngleInput(incidentAngleDeg.toFixed(1));
    setAngleError(null);
  }, [incidentAngleDeg]);

  useEffect(() => {
    setN1Input(n1.toFixed(3));
    setN1Error(null);
  }, [n1]);

  useEffect(() => {
    setN2Input(n2.toFixed(3));
    setN2Error(null);
  }, [n2]);

  const handleAngleNumberChange = (raw: string) => {
    setAngleInput(raw);
    if (raw.trim() === '') {
      setAngleError('Nhập góc tới từ 0° đến 89.5°.');
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 89.5) {
      setAngleError('Góc tới hợp lệ trong khoảng 0° – 89.5°.');
      return;
    }
    setAngleError(null);
    onChangeIncidentAngle(parsed);
  };

  const handleN1NumberChange = (raw: string) => {
    setN1Input(raw);
    if (raw.trim() === '') {
      setN1Error('Nhập chiết suất n₁ từ 1.000 đến 3.800.');
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1.0 || parsed > 3.8) {
      setN1Error('Chiết suất n₁ hợp lệ từ 1.000 đến 3.800.');
      return;
    }
    setN1Error(null);
    onChangeMaterial1('custom', parsed);
  };

  const handleN2NumberChange = (raw: string) => {
    setN2Input(raw);
    if (raw.trim() === '') {
      setN2Error('Nhập chiết suất n₂ từ 1.000 đến 3.800.');
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1.0 || parsed > 3.8) {
      setN2Error('Chiết suất n₂ hợp lệ từ 1.000 đến 3.800.');
      return;
    }
    setN2Error(null);
    onChangeMaterial2('custom', parsed);
  };

  const bandSliderConfig =
    band === 'VISIBLE'
      ? { min: 380, max: 750, step: 1 }
      : band === 'INFRARED'
      ? { min: 800, max: 5000, step: 10 }
      : { min: 5_000_000, max: 125_000_000, step: 1_000_000 };

  const angleMarkers: SliderMarker[] = [];
  if (Math.abs(n1 - n2) > 0.005) {
    angleMarkers.push({
      value: physics.brewsterAngleDeg,
      label: 'Góc Brewster θB',
      colorClass: 'bg-amber-500/85',
    });
  }
  if (physics.criticalAngleDeg !== null) {
    angleMarkers.push({
      value: physics.criticalAngleDeg,
      label: 'Góc tới hạn θc',
      colorClass: 'bg-rose-500/85',
    });
  }

  return (
    <aside
      aria-label="Bảng điều khiển tham số sóng điện từ"
      className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-5"
    >
      {/* 1. Guided Scenarios */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="scenario-select"
            className="font-display text-[15px] font-semibold text-slate-900"
          >
            Kịch bản thí nghiệm mẫu
          </label>
        </div>
        <select
          id="scenario-select"
          value={activeScenarioId ?? ''}
          onChange={(e) => {
            const found = PRESET_SCENARIOS.find((s) => s.id === e.target.value);
            if (found) onSelectScenario(found);
          }}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13.5px] text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
        >
          <option value="" disabled>
            Chọn nhanh chế độ truyền sóng...
          </option>
          {PRESET_SCENARIOS.map((sc) => (
            <option key={sc.id} value={sc.id}>
              {sc.title}
            </option>
          ))}
        </select>

        {/* Quick 1-click regime buttons */}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSelectScenario(PRESET_SCENARIOS[1])}
            className="px-2.5 py-1.5 text-[13px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            Góc Brewster
          </button>
          <button
            type="button"
            onClick={() => onSelectScenario(PRESET_SCENARIOS[2])}
            className="px-2.5 py-1.5 text-[13px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            Phản xạ toàn phần
          </button>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* 2. Incident Angle Control (Direct Numeric Input + Slider) */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <label
            htmlFor="incident-angle-input"
            className="font-display text-[15px] font-semibold text-slate-900"
          >
            Góc tới (θi)
          </label>
          <div className="flex items-center gap-1">
            <input
              id="incident-angle-input"
              aria-label="Nhập trực tiếp góc tới theo độ"
              type="number"
              min={0}
              max={89.5}
              step={0.1}
              value={angleInput}
              onChange={(e) => handleAngleNumberChange(e.target.value)}
              className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-sm font-semibold tabular-nums text-sky-700 focus:border-sky-600 focus:outline-none"
            />
            <span className="font-mono text-xs text-slate-500">°</span>
          </div>
        </div>

        {angleError && (
          <p role="alert" className="mb-1.5 text-xs text-rose-600">
            {angleError}
          </p>
        )}

        <AnimatedLabSlider
          id="incident-angle-slider"
          ariaLabel="Thanh trượt góc tới θi"
          min={0}
          max={89.5}
          step={0.1}
          value={incidentAngleDeg}
          onChange={onChangeIncidentAngle}
          formatTooltip={(v) => `θi = ${v.toFixed(1)}°`}
          accentColor="#0284c7"
          markers={angleMarkers}
        />

        <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
          <span>0°</span>
          <span>30°</span>
          <span>60°</span>
          <span>89.5°</span>
        </div>

        {/* Quick Jump to Key Physical Angles */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onChangeIncidentAngle(0)}
            className="px-2.5 py-1 text-xs font-mono font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            0° (Pháp tuyến)
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeIncidentAngle(Math.round(physics.brewsterAngleDeg * 100) / 100)
            }
            className="px-2.5 py-1 text-xs font-mono font-medium rounded-md border border-amber-200 bg-amber-50/70 text-amber-900 hover:bg-amber-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            θB = {physics.brewsterAngleDeg.toFixed(1)}°
          </button>
          {physics.criticalAngleDeg !== null && (
            <button
              type="button"
              onClick={() =>
                onChangeIncidentAngle(
                  Math.round(Math.min(89, physics.criticalAngleDeg! + 3) * 10) / 10
                )
              }
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-md border border-rose-200 bg-rose-50/70 text-rose-900 hover:bg-rose-100 transition-colors whitespace-nowrap cursor-pointer"
            >
              Vượt θc ({physics.criticalAngleDeg.toFixed(1)}°)
            </button>
          )}
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* 3. Dielectric Media n1 & n2 (Direct Numeric Inputs + Material Presets + Sliders) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[15px] font-semibold text-slate-900">
            Chiết suất hai môi trường
          </h3>
          <button
            type="button"
            onClick={onSwapMedia}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Đảo n₁ ↔ n₂
          </button>
        </div>

        {/* Medium 1 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="m1-number-input" className="text-[13px] font-medium text-slate-700">
              Môi trường 1 (n₁)
            </label>
            <input
              id="m1-number-input"
              aria-label="Nhập trực tiếp chiết suất môi trường 1"
              type="number"
              min={1.0}
              max={3.8}
              step={0.001}
              value={n1Input}
              onChange={(e) => handleN1NumberChange(e.target.value)}
              className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-[13px] font-semibold tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>
          {n1Error && (
            <p role="alert" className="text-xs text-rose-600">
              {n1Error}
            </p>
          )}
          <select
            id="m1-select"
            aria-label="Chọn vật liệu môi trường 1"
            value={material1Id}
            onChange={(e) => {
              const id = e.target.value;
              const mat = OPTICAL_MATERIALS.find((m) => m.id === id);
              onChangeMaterial1(id, mat ? mat.refractiveIndex : n1);
            }}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[13px] text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
          >
            {OPTICAL_MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} (n = {m.refractiveIndex.toFixed(3)})
              </option>
            ))}
            <option value="custom">Tùy chỉnh chiết suất</option>
          </select>
          <AnimatedLabSlider
            ariaLabel="Thanh trượt chiết suất môi trường 1"
            min={1.0}
            max={3.8}
            step={0.005}
            value={n1}
            onChange={(val) => onChangeMaterial1('custom', val)}
            formatTooltip={(v) => `n₁ = ${v.toFixed(3)}`}
            accentColor="#0284c7"
          />
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 tabular-nums">
            <span>εr₁ = {(n1 * n1).toFixed(2)}</span>
            <span>Z₁ = {physics.impedance1Ohm.toFixed(1)} Ω</span>
          </div>
        </div>

        {/* Medium 2 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="m2-number-input" className="text-[13px] font-medium text-slate-700">
              Môi trường 2 (n₂)
            </label>
            <input
              id="m2-number-input"
              aria-label="Nhập trực tiếp chiết suất môi trường 2"
              type="number"
              min={1.0}
              max={3.8}
              step={0.001}
              value={n2Input}
              onChange={(e) => handleN2NumberChange(e.target.value)}
              className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-[13px] font-semibold tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>
          {n2Error && (
            <p role="alert" className="text-xs text-rose-600">
              {n2Error}
            </p>
          )}
          <select
            id="m2-select"
            aria-label="Chọn vật liệu môi trường 2"
            value={material2Id}
            onChange={(e) => {
              const id = e.target.value;
              const mat = OPTICAL_MATERIALS.find((m) => m.id === id);
              onChangeMaterial2(id, mat ? mat.refractiveIndex : n2);
            }}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[13px] text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
          >
            {OPTICAL_MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} (n = {m.refractiveIndex.toFixed(3)})
              </option>
            ))}
            <option value="custom">Tùy chỉnh chiết suất</option>
          </select>
          <AnimatedLabSlider
            ariaLabel="Thanh trượt chiết suất môi trường 2"
            min={1.0}
            max={3.8}
            step={0.005}
            value={n2}
            onChange={(val) => onChangeMaterial2('custom', val)}
            formatTooltip={(v) => `n₂ = ${v.toFixed(3)}`}
            accentColor="#2563eb"
          />
          <div className="flex items-center justify-between text-xs font-mono text-slate-500 tabular-nums">
            <span>εr₂ = {(n2 * n2).toFixed(2)}</span>
            <span>Z₂ = {physics.impedance2Ohm.toFixed(1)} Ω</span>
          </div>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* 4. Instant Refraction & Ray Deviation Readout + PDF Report Export */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-0.5">Góc khúc xạ (θt)</div>
            <motion.div
              key={
                physics.isTotalInternalReflection
                  ? 'tir'
                  : physics.refractedAngleDeg!.toFixed(2)
              }
              initial={{ opacity: 0.7, y: -1 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              data-testid="sidebar-theta-t"
              className="font-mono text-lg font-semibold tabular-nums text-emerald-700"
            >
              {physics.isTotalInternalReflection
                ? 'TIR'
                : `${physics.refractedAngleDeg!.toFixed(2)}°`}
            </motion.div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-0.5">Độ lệch tia (Δθ)</div>
            <motion.div
              key={
                physics.isTotalInternalReflection
                  ? 'dev-tir'
                  : physics.deviationAngleDeg!.toFixed(2)
              }
              initial={{ opacity: 0.7, y: -1 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              data-testid="sidebar-deviation"
              className="font-mono text-lg font-semibold tabular-nums text-sky-700"
            >
              {physics.isTotalInternalReflection
                ? '—'
                : `${physics.deviationAngleDeg!.toFixed(2)}°`}
            </motion.div>
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onExportPdf}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            Xuất báo cáo PDF
          </button>

          <button
            type="button"
            data-testid="open-formulas-modal-btn"
            onClick={() => setIsFormulasOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-sky-700" />
            Hiển thị công thức
          </button>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* 5. Polarization State */}
      <div>
        <span className="block font-display text-[15px] font-semibold text-slate-900 mb-2">
          Phân cực sóng điện từ
        </span>
        <div
          role="group"
          aria-label="Chọn trạng thái phân cực"
          className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {(
            [
              ['TE', 'TE (s)'],
              ['TM', 'TM (p)'],
              ['UNPOLARIZED', 'Tự nhiên'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={polarization === mode}
              onClick={() => onChangePolarization(mode)}
              className={`py-1.5 px-2 text-[13px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                polarization === mode
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-slate-500 leading-relaxed">
          {polarization === 'TE' && 'Vectơ trường E vuông góc với mặt phẳng tới (s-polarized).'}
          {polarization === 'TM' &&
            'Vectơ trường E nằm trong mặt phẳng tới (p-polarized), triệt tiêu phản xạ tại θB.'}
          {polarization === 'UNPOLARIZED' &&
            'Sóng không phân cực — công suất phản xạ bằng trung bình cộng (Rs + Rp) / 2.'}
        </p>
      </div>

      <hr className="border-slate-200" />

      {/* 6. Electromagnetic Spectrum Band & Wavelength */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-display text-[15px] font-semibold text-slate-900">
            Dải phổ & Bước sóng (λ₀)
          </span>
          <span
            className="inline-block w-3.5 h-3.5 rounded-sm border border-slate-300"
            style={{ backgroundColor: waveColor }}
            aria-hidden="true"
          />
        </div>

        <div
          role="group"
          aria-label="Chọn dải phổ điện từ"
          className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg mb-3"
        >
          {(
            [
              ['VISIBLE', 'Khả kiến'],
              ['INFRARED', 'Hồng ngoại'],
              ['MICROWAVE', 'Vi sóng RF'],
            ] as const
          ).map(([b, label]) => (
            <button
              key={b}
              type="button"
              aria-pressed={band === b}
              onClick={() => onChangeBand(b)}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                band === b
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-baseline justify-between mb-1">
          <label htmlFor="wavelength-slider" className="text-xs text-slate-600">
            λ₀ ={' '}
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {formatWavelength(wavelengthVacuumNm)}
            </span>
          </label>
          <span className="text-xs font-mono text-slate-600 tabular-nums">
            f = {formatFrequency(physics.frequencyHz)}
          </span>
        </div>

        <AnimatedLabSlider
          id="wavelength-slider"
          ariaLabel={`λ₀ = ${formatWavelength(wavelengthVacuumNm)}`}
          min={bandSliderConfig.min}
          max={bandSliderConfig.max}
          step={bandSliderConfig.step}
          value={wavelengthVacuumNm}
          onChange={onChangeWavelengthNm}
          formatTooltip={(v) => formatWavelength(v)}
          accentColor={waveColor}
        />
      </div>

      <PhysicsFormulasModal
        isOpen={isFormulasOpen}
        onClose={() => setIsFormulasOpen(false)}
        n1={n1}
        n2={n2}
        incidentAngleDeg={incidentAngleDeg}
        wavelengthVacuumNm={wavelengthVacuumNm}
        physics={physics}
      />
    </aside>
  );
};
