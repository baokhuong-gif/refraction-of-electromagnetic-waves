import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Compass, FlaskConical } from 'lucide-react';
import {
  identifyWaveMedium,
  InverseIdentificationOutput,
  InverseMeasurementInput,
  MeasurementMode,
  MYSTERY_SAMPLES,
  MysterySamplePreset,
} from '../physics/identifier';
import { PolarizationMode } from '../physics/materials';
import { WavePhysicsResult } from '../physics/emPhysics';

interface InverseIdentifierViewProps {
  currentPhysics: WavePhysicsResult;
  currentPolarization: PolarizationMode;
  currentWavelengthNm: number;
  onApplyToSimulator: (params: {
    n1: number;
    n2: number;
    incidentAngleDeg: number;
    polarization: PolarizationMode;
    wavelengthVacuumNm: number;
    matchedMaterial2Id: string;
  }) => void;
}

export const InverseIdentifierView: React.FC<InverseIdentifierViewProps> = ({
  currentPhysics,
  currentPolarization,
  currentWavelengthNm,
  onApplyToSimulator,
}) => {
  const [mode, setMode] = useState<MeasurementMode>('SNELL_ANGLES');
  const [knownN1Str, setKnownN1Str] = useState('1.0003');
  const [incidentDegStr, setIncidentDegStr] = useState('45.0');
  const [refractedDegStr, setRefractedDegStr] = useState('27.78');
  const [criticalDegStr, setCriticalDegStr] = useState('41.2');
  const [brewsterDegStr, setBrewsterDegStr] = useState('56.6');
  const [reflectancePctStr, setReflectancePctStr] = useState('4.9');
  const [polarization, setPolarization] = useState<PolarizationMode>('UNPOLARIZED');
  const [wavelengthNm, setWavelengthNm] = useState(532);

  const [result, setResult] = useState<InverseIdentificationOutput>(() =>
    identifyWaveMedium(MYSTERY_SAMPLES[0].input)
  );

  const runIdentification = (overrides?: Partial<InverseMeasurementInput>) => {
    const parseNum = (s: string) => (s.trim() === '' ? NaN : Number(s));
    const parsedRef = reflectancePctStr.trim() === '' ? null : Number(reflectancePctStr);

    const payload: InverseMeasurementInput = {
      mode: overrides?.mode ?? mode,
      knownN1: overrides?.knownN1 ?? parseNum(knownN1Str),
      incidentAngleDeg: overrides?.incidentAngleDeg ?? parseNum(incidentDegStr),
      refractedAngleDeg: overrides?.refractedAngleDeg ?? parseNum(refractedDegStr),
      measuredCriticalAngleDeg: overrides?.measuredCriticalAngleDeg ?? parseNum(criticalDegStr),
      measuredBrewsterAngleDeg: overrides?.measuredBrewsterAngleDeg ?? parseNum(brewsterDegStr),
      measuredReflectancePct:
        overrides?.measuredReflectancePct !== undefined
          ? overrides.measuredReflectancePct
          : parsedRef,
      polarization: overrides?.polarization ?? polarization,
      wavelengthVacuumNm: overrides?.wavelengthVacuumNm ?? wavelengthNm,
    };

    const output = identifyWaveMedium(payload);
    setResult(output);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runIdentification();
  };

  const handleSelectMystery = (sample: MysterySamplePreset) => {
    const inp = sample.input;
    setMode(inp.mode);
    setKnownN1Str(String(inp.knownN1));
    setIncidentDegStr(String(inp.incidentAngleDeg));
    setRefractedDegStr(String(inp.refractedAngleDeg));
    setCriticalDegStr(String(inp.measuredCriticalAngleDeg));
    setBrewsterDegStr(String(inp.measuredBrewsterAngleDeg));
    setReflectancePctStr(
      inp.measuredReflectancePct !== null ? String(inp.measuredReflectancePct) : ''
    );
    setPolarization(inp.polarization);
    setWavelengthNm(inp.wavelengthVacuumNm);
    setResult(identifyWaveMedium(inp));
  };

  const handleImportFromSimulator = () => {
    const useCritical =
      currentPhysics.isTotalInternalReflection && currentPhysics.criticalAngleDeg !== null;
    const nextMode: MeasurementMode = useCritical ? 'CRITICAL_ANGLE' : 'SNELL_ANGLES';
    const nextThetaI = Math.max(5, Math.min(85, currentPhysics.incidentAngleDeg));
    const nextThetaT = currentPhysics.refractedAngleDeg ?? 30;
    const nextCritical = currentPhysics.criticalAngleDeg ?? 41.2;
    const nextRefPct = Math.round(currentPhysics.reflectanceEffective * 10000) / 100;

    setMode(nextMode);
    setKnownN1Str(currentPhysics.n1.toFixed(4));
    setIncidentDegStr(nextThetaI.toFixed(2));
    setRefractedDegStr(nextThetaT.toFixed(2));
    setCriticalDegStr(nextCritical.toFixed(2));
    setBrewsterDegStr(currentPhysics.brewsterAngleDeg.toFixed(2));
    setReflectancePctStr(nextRefPct.toFixed(2));
    setPolarization(currentPolarization);
    setWavelengthNm(currentWavelengthNm);

    setResult(
      identifyWaveMedium({
        mode: nextMode,
        knownN1: currentPhysics.n1,
        incidentAngleDeg: nextThetaI,
        refractedAngleDeg: nextThetaT,
        measuredCriticalAngleDeg: nextCritical,
        measuredBrewsterAngleDeg: currentPhysics.brewsterAngleDeg,
        measuredReflectancePct: nextRefPct,
        polarization: currentPolarization,
        wavelengthVacuumNm: currentWavelengthNm,
      })
    );
  };

  const fieldErrors = !result.ok ? result.fieldErrors : {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Experimental Measurement Input Form */}
      <section
        aria-label="Nhập thông số đo thực nghiệm để nhận dạng môi trường"
        className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
              Nhận dạng ngược đặc tính truyền sóng
            </h1>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Nhập góc đo thực nghiệm và độ phản xạ để suy luận chiết suất, hằng số điện môi, vật
              liệu khả dĩ và kiểm tra bất thường tổn hao.
            </p>
          </div>
        </div>

        {/* Quick Sample Presets & Sync from Simulator */}
        <div className="mb-5 pb-5 border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-800">Bộ dữ liệu đo mẫu</span>
            <button
              type="button"
              onClick={handleImportFromSimulator}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 transition-colors cursor-pointer"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Lấy từ mô phỏng hiện tại
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MYSTERY_SAMPLES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => handleSelectMystery(sample)}
                className="text-left p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-sky-50/60 hover:border-sky-300 transition-colors cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-900 truncate">{sample.title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                  {sample.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Measurement Method Segmented Selector */}
          <div>
            <span className="block text-xs font-semibold text-slate-800 mb-1.5">
              Phương pháp đo góc
            </span>
            <div
              role="group"
              aria-label="Chọn phương pháp nhận dạng"
              className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg"
            >
              {(
                [
                  ['SNELL_ANGLES', 'Góc Snell'],
                  ['CRITICAL_ANGLE', 'Góc tới hạn θc'],
                  ['BREWSTER_ANGLE', 'Góc Brewster'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    mode === m
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Known n1 */}
          <div>
            <label htmlFor="inv-n1" className="block text-xs font-medium text-slate-700 mb-1">
              Chiết suất môi trường tới biết trước (n₁)
            </label>
            <input
              id="inv-n1"
              type="number"
              step="0.001"
              value={knownN1Str}
              onChange={(e) => setKnownN1Str(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
            />
            {fieldErrors.knownN1 && (
              <p role="alert" className="mt-1 text-xs text-rose-600">
                {fieldErrors.knownN1}
              </p>
            )}
          </div>

          {/* Conditional Angle Inputs */}
          {mode === 'SNELL_ANGLES' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="inv-theta-i"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Góc tới đo được θi (°)
                </label>
                <input
                  id="inv-theta-i"
                  type="number"
                  step="0.01"
                  value={incidentDegStr}
                  onChange={(e) => setIncidentDegStr(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
                />
                {fieldErrors.incidentAngleDeg && (
                  <p role="alert" className="mt-1 text-xs text-rose-600">
                    {fieldErrors.incidentAngleDeg}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="inv-theta-t"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Góc khúc xạ đo được θt (°)
                </label>
                <input
                  id="inv-theta-t"
                  type="number"
                  step="0.01"
                  value={refractedDegStr}
                  onChange={(e) => setRefractedDegStr(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
                />
                {fieldErrors.refractedAngleDeg && (
                  <p role="alert" className="mt-1 text-xs text-rose-600">
                    {fieldErrors.refractedAngleDeg}
                  </p>
                )}
              </div>
            </div>
          )}

          {mode === 'CRITICAL_ANGLE' && (
            <div>
              <label
                htmlFor="inv-theta-c"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Góc tới hạn phản xạ toàn phần θc (°)
              </label>
              <input
                id="inv-theta-c"
                type="number"
                step="0.01"
                value={criticalDegStr}
                onChange={(e) => setCriticalDegStr(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
              />
              {fieldErrors.measuredCriticalAngleDeg && (
                <p role="alert" className="mt-1 text-xs text-rose-600">
                  {fieldErrors.measuredCriticalAngleDeg}
                </p>
              )}
            </div>
          )}

          {mode === 'BREWSTER_ANGLE' && (
            <div>
              <label
                htmlFor="inv-theta-b"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Góc Brewster đo được θB (°)
              </label>
              <input
                id="inv-theta-b"
                type="number"
                step="0.01"
                value={brewsterDegStr}
                onChange={(e) => setBrewsterDegStr(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
              />
              {fieldErrors.measuredBrewsterAngleDeg && (
                <p role="alert" className="mt-1 text-xs text-rose-600">
                  {fieldErrors.measuredBrewsterAngleDeg}
                </p>
              )}
            </div>
          )}

          {/* Optional Reflectance Cross-check & Polarization */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-ref" className="block text-xs font-medium text-slate-700 mb-1">
                Phản xạ đo được R (%) — tùy chọn
              </label>
              <input
                id="inv-ref"
                type="number"
                step="0.05"
                placeholder="Bỏ trống nếu không đo"
                value={reflectancePctStr}
                onChange={(e) => setReflectancePctStr(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
              />
              {fieldErrors.measuredReflectancePct && (
                <p role="alert" className="mt-1 text-xs text-rose-600">
                  {fieldErrors.measuredReflectancePct}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="inv-pol" className="block text-xs font-medium text-slate-700 mb-1">
                Phân cực chùm đo
              </label>
              <select
                id="inv-pol"
                value={polarization}
                onChange={(e) => setPolarization(e.target.value as PolarizationMode)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              >
                <option value="UNPOLARIZED">Không phân cực</option>
                <option value="TE">TE (phân cực s)</option>
                <option value="TM">TM (phân cực p)</option>
              </select>
            </div>
          </div>

          {fieldErrors.general && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
            >
              {fieldErrors.general}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors cursor-pointer"
          >
            Phân tích & Nhận dạng đặc tính
          </button>
        </form>
      </section>

      {/* Right Column: Identification Diagnostic Output */}
      <section
        aria-label="Kết quả nhận dạng môi trường và đặc tính sóng"
        className="lg:col-span-7 space-y-5"
      >
        {!result.ok ? (
          <div className="bg-white border border-rose-200 rounded-xl p-6">
            <div className="flex items-center gap-2 text-rose-700 font-semibold text-sm mb-2">
              <AlertTriangle className="w-4 h-4" />
              Chưa thể nhận dạng môi trường
            </div>
            <p className="text-sm text-slate-600">{result.message}</p>
          </div>
        ) : (
          <>
            {/* Primary Estimated Electromagnetic Properties */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">{result.methodUsed}</div>
                  <div className="font-mono text-xs text-slate-700 mt-1">{result.formulaTrace}</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onApplyToSimulator({
                      n1: result.physicsPreview.n1,
                      n2: result.estimatedN2,
                      incidentAngleDeg: result.physicsPreview.incidentAngleDeg,
                      polarization,
                      wavelengthVacuumNm: wavelengthNm,
                      matchedMaterial2Id:
                        result.topCandidates[0] && result.topCandidates[0].deltaN < 0.015
                          ? result.topCandidates[0].material.id
                          : 'custom',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Nạp kết quả vào mô phỏng
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200">
                <div className="p-4">
                  <div className="text-xs text-slate-500 mb-1">Chiết suất suy luận (n₂)</div>
                  <div
                    data-testid="identified-n2"
                    className="font-mono text-2xl font-semibold tabular-nums text-sky-700"
                  >
                    {result.estimatedN2.toFixed(4)}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs text-slate-500 mb-1">Hằng số điện môi (εr₂)</div>
                  <div className="font-mono text-2xl font-semibold tabular-nums text-slate-900">
                    {result.estimatedPermittivity2.toFixed(3)}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs text-slate-500 mb-1">Trở kháng sóng (Z₂)</div>
                  <div className="font-mono text-2xl font-semibold tabular-nums text-slate-900">
                    {result.estimatedImpedance2Ohm.toFixed(1)}
                    <span className="text-xs font-normal text-slate-400 ml-1">Ω</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs text-slate-500 mb-1">Vận tốc pha (v₂)</div>
                  <div className="font-mono text-2xl font-semibold tabular-nums text-slate-900">
                    {(result.estimatedVelocity2 / 1e8).toFixed(2)}
                    <span className="text-xs font-normal text-slate-400 ml-1">×10⁸</span>
                  </div>
                </div>
              </div>

              {/* Active Propagation Regime Preview */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600">
                  Chế độ truyền nhận dạng:{' '}
                  <strong className="text-slate-900">
                    {result.physicsPreview.classification.label}
                  </strong>
                </span>
                <span className="font-mono text-slate-600 tabular-nums">
                  θB = {result.physicsPreview.brewsterAngleDeg.toFixed(2)}°
                  {result.physicsPreview.criticalAngleDeg !== null
                    ? ` · θc = ${result.physicsPreview.criticalAngleDeg.toFixed(2)}°`
                    : ''}
                </span>
              </div>
            </div>

            {/* Reflectance Consistency / Anomaly Diagnostic */}
            {result.consistencyCheck && (
              <div
                data-testid="consistency-check"
                className={`rounded-xl border p-5 ${
                  result.consistencyCheck.status === 'ANOMALY'
                    ? 'bg-rose-50/70 border-rose-200'
                    : result.consistencyCheck.status === 'MODERATE_DRIFT'
                    ? 'bg-amber-50/70 border-amber-200'
                    : 'bg-emerald-50/60 border-emerald-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {result.consistencyCheck.status === 'MATCH' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle
                        className={`w-4 h-4 ${
                          result.consistencyCheck.status === 'ANOMALY'
                            ? 'text-rose-600'
                            : 'text-amber-600'
                        }`}
                      />
                    )}
                    Kiểm chứng tính nhất quán Fresnel (R đo vs. R lý thuyết)
                  </div>
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${
                      result.consistencyCheck.status === 'ANOMALY'
                        ? 'text-rose-700'
                        : result.consistencyCheck.status === 'MODERATE_DRIFT'
                        ? 'text-amber-800'
                        : 'text-emerald-700'
                    }`}
                  >
                    {result.consistencyCheck.status === 'MATCH' && '● Khớp chuẩn'}
                    {result.consistencyCheck.status === 'MODERATE_DRIFT' && '◆ Sai lệch nhẹ'}
                    {result.consistencyCheck.status === 'ANOMALY' && '▲ Bất thường tổn hao'}
                  </span>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed mb-2.5">
                  {result.consistencyCheck.diagnosis}
                </p>

                <div className="flex flex-wrap items-center gap-5 font-mono text-xs text-slate-700 tabular-nums">
                  <span>R đo thực tế: {result.consistencyCheck.measuredPct.toFixed(2)}%</span>
                  <span>R dự báo Fresnel: {result.consistencyCheck.predictedPct.toFixed(2)}%</span>
                  <span>Độ lệch |ΔR|: {result.consistencyCheck.residualPct.toFixed(2)}%</span>
                </div>
              </div>
            )}

            {/* Closest Physical Material Fingerprint Table */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-1">
                <Compass className="w-4 h-4 text-slate-500" aria-hidden="true" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Xếp hạng đối sánh vật liệu điện môi khả dĩ
                </h2>
              </div>
              <p className="text-[13px] text-slate-500 mb-4">
                So khớp chiết suất suy luận n₂ = {result.estimatedN2.toFixed(4)} với thư viện vật
                liệu quang học & vi sóng chuẩn
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 pr-3 font-medium">Vật liệu ứng viên</th>
                      <th className="py-2.5 px-3 font-medium">Phân loại</th>
                      <th className="py-2.5 px-3 font-medium text-right">n chuẩn</th>
                      <th className="py-2.5 px-3 font-medium text-right">Sai số |Δn|</th>
                      <th className="py-2.5 pl-3 font-medium text-right">Độ khớp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.topCandidates.map((cand, index) => (
                      <tr
                        key={cand.material.id}
                        className={index === 0 ? 'bg-sky-50/40 font-medium' : ''}
                      >
                        <td className="py-2.5 pr-3 text-slate-900">
                          <div>{cand.material.name}</div>
                          <div className="text-[11px] font-normal text-slate-500">
                            {cand.material.notes}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {cand.material.category}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                          {cand.material.refractiveIndex.toFixed(3)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                          {cand.deltaN.toFixed(4)}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono tabular-nums">
                          <div className="inline-flex items-center gap-2 justify-end">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  cand.confidencePct >= 80
                                    ? 'bg-emerald-600'
                                    : cand.confidencePct >= 45
                                    ? 'bg-amber-500'
                                    : 'bg-slate-400'
                                }`}
                                style={{ width: `${Math.max(4, cand.confidencePct)}%` }}
                              />
                            </div>
                            <span className="w-11 text-slate-900">
                              {cand.confidencePct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
