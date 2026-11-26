import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { AiWavePredictorView } from './components/AiWavePredictorView';
import { CharacteristicsPanel } from './components/CharacteristicsPanel';
import { ControlDeck } from './components/ControlDeck';
import { FresnelChart } from './components/FresnelChart';
import { InverseIdentifierView } from './components/InverseIdentifierView';
import { MaterialSearchView } from './components/MaterialSearchView';
import { MeasurementLogView, MeasurementRecord } from './components/MeasurementLogView';
import { WaveCanvas } from './components/WaveCanvas';
import { WaveScene3D } from './components/WaveScene3D';
import { useAuth } from './contexts/AuthContext';
import { computeEMRefraction } from './physics/emPhysics';
import {
  findMaterialLabel,
  PolarizationMode,
  PRESET_SCENARIOS,
  PresetScenario,
  SpectrumBand,
} from './physics/materials';
import { exportRefractionPdfReport } from './utils/pdfReport';

type ActiveTab = 'SIMULATOR' | 'LAB_3D' | 'AI_PREDICT' | 'IDENTIFIER' | 'SEARCH' | 'LOG';

interface ApiMeasurementRow {
  id: number;
  label: string;
  regimeShort: string;
  n1: number;
  n2: number;
  material1Id: string;
  material2Id: string;
  incidentAngleDeg: number;
  refractedAngleDeg: number | null;
  reflectancePct: number;
  transmittancePct: number;
  wavelength2Nm: number;
  wavelengthVacuumNm: number;
  polarization: PolarizationMode;
  band: SpectrumBand;
  createdAt: string;
}

function createInitialSeedRecords(): MeasurementRecord[] {
  const seeds = [PRESET_SCENARIOS[0], PRESET_SCENARIOS[1], PRESET_SCENARIOS[2]];
  return seeds.map((sc, idx) => {
    const res = computeEMRefraction({
      n1: sc.n1,
      n2: sc.n2,
      incidentAngleDeg: sc.incidentAngleDeg,
      wavelengthVacuumNm: sc.wavelengthNm,
      polarization: sc.polarization,
    });
    return {
      id: `seed-${idx + 1}`,
      timestamp: `Mẫu chuẩn #0${idx + 1}`,
      label: sc.title,
      regimeShort: res.classification.shortTag,
      n1: sc.n1,
      n2: sc.n2,
      material1Id: sc.material1Id,
      material2Id: sc.material2Id,
      incidentAngleDeg: sc.incidentAngleDeg,
      refractedAngleDeg: res.refractedAngleDeg,
      reflectancePct: res.reflectanceEffective * 100,
      transmittancePct: res.transmittanceEffective * 100,
      wavelength2Nm: res.wavelength2Nm,
      wavelengthVacuumNm: sc.wavelengthNm,
      polarization: sc.polarization,
      band: sc.band,
    };
  });
}

function mapApiRowToRecord(row: ApiMeasurementRow): MeasurementRecord {
  const dt = new Date(row.createdAt);
  const timeLabel = Number.isNaN(dt.getTime())
    ? 'Đã lưu'
    : dt.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      });

  return {
    id: `db-${row.id}`,
    dbId: row.id,
    timestamp: timeLabel,
    label: row.label,
    regimeShort: row.regimeShort,
    n1: row.n1,
    n2: row.n2,
    material1Id: row.material1Id,
    material2Id: row.material2Id,
    incidentAngleDeg: row.incidentAngleDeg,
    refractedAngleDeg: row.refractedAngleDeg,
    reflectancePct: row.reflectancePct,
    transmittancePct: row.transmittancePct,
    wavelength2Nm: row.wavelength2Nm,
    wavelengthVacuumNm: row.wavelengthVacuumNm,
    polarization: row.polarization,
    band: row.band,
  };
}

export default function App() {
  const initialScenario = PRESET_SCENARIOS[0];
  const { user, signInWithGoogle, signOutUser, getIdToken } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('SIMULATOR');
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(initialScenario.id);
  const [n1, setN1] = useState<number>(initialScenario.n1);
  const [n2, setN2] = useState<number>(initialScenario.n2);
  const [material1Id, setMaterial1Id] = useState<string>(initialScenario.material1Id);
  const [material2Id, setMaterial2Id] = useState<string>(initialScenario.material2Id);
  const [incidentAngleDeg, setIncidentAngleDeg] = useState<number>(
    initialScenario.incidentAngleDeg
  );
  const [polarization, setPolarization] = useState<PolarizationMode>(initialScenario.polarization);
  const [wavelengthVacuumNm, setWavelengthVacuumNm] = useState<number>(initialScenario.wavelengthNm);
  const [band, setBand] = useState<SpectrumBand>(initialScenario.band);

  const [records, setRecords] = useState<MeasurementRecord[]>(() => createInitialSeedRecords());
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ text: string; showLogLink?: boolean } | null>(
    null
  );
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const showBanner = useCallback((text: string, showLogLink = false) => {
    setStatusBanner({ text, showLogLink });
    window.setTimeout(() => {
      setStatusBanner(null);
    }, 3600);
  }, []);

  // Sync persisted measurement records when user signs in
  useEffect(() => {
    let active = true;
    if (!user) {
      setSyncError(null);
      setRecords(createInitialSeedRecords());
      return;
    }

    const fetchSavedRecords = async () => {
      setSyncLoading(true);
      setSyncError(null);
      try {
        const token = await getIdToken();
        if (!token || !active) return;
        const response = await fetch('/api/measurements', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('Không thể tải phép đo đã lưu của tài khoản.');
        }
        const data = (await response.json()) as { measurements?: ApiMeasurementRow[] };
        if (!active) return;
        const saved = Array.isArray(data.measurements)
          ? data.measurements.map(mapApiRowToRecord)
          : [];
        setRecords(saved.length > 0 ? saved : createInitialSeedRecords());
      } catch (err: unknown) {
        if (!active) return;
        setSyncError(
          err instanceof Error ? err.message : 'Không thể đồng bộ bảng phép đo lúc này.'
        );
      } finally {
        if (active) setSyncLoading(false);
      }
    };

    void fetchSavedRecords();
    return () => {
      active = false;
    };
  }, [user, getIdToken]);

  const physics = useMemo(
    () =>
      computeEMRefraction({
        n1,
        n2,
        incidentAngleDeg,
        wavelengthVacuumNm,
        polarization,
      }),
    [n1, n2, incidentAngleDeg, wavelengthVacuumNm, polarization]
  );

  const material1Label = useMemo(() => findMaterialLabel(n1, material1Id), [n1, material1Id]);
  const material2Label = useMemo(() => findMaterialLabel(n2, material2Id), [n2, material2Id]);

  const handleSelectScenario = (scenario: PresetScenario) => {
    setActiveScenarioId(scenario.id);
    setN1(scenario.n1);
    setN2(scenario.n2);
    setMaterial1Id(scenario.material1Id);
    setMaterial2Id(scenario.material2Id);
    setIncidentAngleDeg(scenario.incidentAngleDeg);
    setPolarization(scenario.polarization);
    setWavelengthVacuumNm(scenario.wavelengthNm);
    setBand(scenario.band);
  };

  const handleResetSimulation = () => {
    handleSelectScenario(PRESET_SCENARIOS[0]);
  };

  const handleSwapMedia = () => {
    setActiveScenarioId(null);
    setN1(n2);
    setN2(n1);
    setMaterial1Id(material2Id);
    setMaterial2Id(material1Id);
  };

  const handleChangeBand = (nextBand: SpectrumBand) => {
    setActiveScenarioId(null);
    setBand(nextBand);
    if (nextBand === 'VISIBLE') setWavelengthVacuumNm(532);
    else if (nextBand === 'INFRARED') setWavelengthVacuumNm(1550);
    else setWavelengthVacuumNm(30_000_000);
  };

  const handleRecordMeasurement = async () => {
    const payload = {
      label: `${material1Label} → ${material2Label}`,
      regimeShort: physics.classification.shortTag,
      n1,
      n2,
      material1Id,
      material2Id,
      incidentAngleDeg,
      refractedAngleDeg: physics.refractedAngleDeg,
      reflectancePct: physics.reflectanceEffective * 100,
      transmittancePct: physics.transmittanceEffective * 100,
      wavelength2Nm: physics.wavelength2Nm,
      wavelengthVacuumNm,
      polarization,
      band,
    };

    if (user) {
      try {
        const token = await getIdToken();
        if (token) {
          const response = await fetch('/api/measurements', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            const data = (await response.json()) as { measurement: ApiMeasurementRow };
            const savedRec = mapApiRowToRecord(data.measurement);
            setRecords((prev) => [savedRec, ...prev.filter((r) => r.dbId !== undefined)]);
            showBanner(`Đã lưu phép đo (${physics.classification.shortTag})`, true);
            return;
          }
        }
      } catch {
        setSyncError('Không thể lưu phép đo lên tài khoản lúc này; đã giữ bản tạm thời.');
      }
    }

    const now = new Date();
    const timeLabel = now.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const localRec: MeasurementRecord = {
      id: `rec-${Date.now()}`,
      timestamp: timeLabel,
      ...payload,
    };

    setRecords((prev) => [localRec, ...prev]);
    showBanner(`Đã lưu phép đo (${physics.classification.shortTag})`, true);
  };

  const handleDeleteRecord = async (rec: MeasurementRecord) => {
    setRecords((prev) => prev.filter((r) => r.id !== rec.id));
    if (user && rec.dbId) {
      try {
        const token = await getIdToken();
        if (token) {
          await fetch(`/api/measurements/${rec.dbId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch {
        setSyncError('Không thể xóa phép đo trên tài khoản lúc này.');
      }
    }
  };

  const handleClearAllRecords = async () => {
    setRecords([]);
    if (user) {
      try {
        const token = await getIdToken();
        if (token) {
          await fetch('/api/measurements', {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch {
        setSyncError('Không thể xóa toàn bộ bảng phép đo lúc này.');
      }
    }
  };

  const handleExportPdf = () => {
    try {
      const meta = exportRefractionPdfReport({
        physics,
        polarization,
        wavelengthVacuumNm,
        material1Label,
        material2Label,
        canvasElement: waveCanvasRef.current,
      });
      showBanner(`Đã xuất báo cáo PDF: ${meta.filename}`, false);
    } catch {
      showBanner('Không thể xuất tệp PDF lúc này. Vui lòng thử lại.', false);
    }
  };

  const handleLoadRecord = (rec: MeasurementRecord) => {
    setActiveScenarioId(null);
    setN1(rec.n1);
    setN2(rec.n2);
    setMaterial1Id(rec.material1Id);
    setMaterial2Id(rec.material2Id);
    setIncidentAngleDeg(rec.incidentAngleDeg);
    setPolarization(rec.polarization);
    setWavelengthVacuumNm(rec.wavelengthVacuumNm);
    setBand(rec.band);
    setActiveTab('SIMULATOR');
  };

  const handleApplyIdentified = (params: {
    n1: number;
    n2: number;
    incidentAngleDeg: number;
    polarization: PolarizationMode;
    wavelengthVacuumNm: number;
    matchedMaterial2Id: string;
  }) => {
    setActiveScenarioId(null);
    setN1(params.n1);
    setN2(params.n2);
    setMaterial1Id(Math.abs(params.n1 - 1.0003) < 0.002 ? 'air' : 'custom');
    setMaterial2Id(params.matchedMaterial2Id);
    setIncidentAngleDeg(params.incidentAngleDeg);
    setPolarization(params.polarization);
    setWavelengthVacuumNm(params.wavelengthVacuumNm);
    setBand(
      params.wavelengthVacuumNm <= 780
        ? 'VISIBLE'
        : params.wavelengthVacuumNm < 100_000
        ? 'INFRARED'
        : 'MICROWAVE'
    );
    setActiveTab('SIMULATOR');
  };

  const handleApplySearchedN2 = (nextN2: number) => {
    setActiveScenarioId(null);
    setN2(nextN2);
    setMaterial2Id('custom');
    setActiveTab('SIMULATOR');
    showBanner(`Đã nạp chiết suất n₂ = ${nextN2.toFixed(4)} từ Google Search vào mô phỏng.`, false);
  };

  const handleApplyAiPrediction = (
    params: {
      n1: number;
      n2: number;
      incidentAngleDeg: number;
      wavelengthVacuumNm: number;
      polarization: PolarizationMode;
    },
    targetTab: 'SIMULATOR' | 'LAB_3D'
  ) => {
    setActiveScenarioId(null);
    setN1(params.n1);
    setN2(params.n2);
    setMaterial1Id(Math.abs(params.n1 - 1.0003) < 0.005 ? 'air' : 'custom');
    setMaterial2Id(Math.abs(params.n2 - 1.0003) < 0.005 ? 'air' : 'custom');
    setIncidentAngleDeg(params.incidentAngleDeg);
    setPolarization(params.polarization);
    setWavelengthVacuumNm(params.wavelengthVacuumNm);
    setBand(
      params.wavelengthVacuumNm <= 780
        ? 'VISIBLE'
        : params.wavelengthVacuumNm < 100_000
        ? 'INFRARED'
        : 'MICROWAVE'
    );
    setActiveTab(targetTab);
    showBanner(
      `Đã nạp tham số dự đoán AI (n₁=${params.n1.toFixed(3)}, n₂=${params.n2.toFixed(3)}, θi=${params.incidentAngleDeg.toFixed(1)}°).`,
      false
    );
  };

  const navItems: Array<{ id: ActiveTab; desktopLabel: string; mobileLabel: string }> = [
    { id: 'SIMULATOR', desktopLabel: 'Mô phỏng 2D', mobileLabel: '2D' },
    { id: 'LAB_3D', desktopLabel: 'Phòng lab 3D', mobileLabel: '3D' },
    { id: 'AI_PREDICT', desktopLabel: 'Dự đoán AI', mobileLabel: 'Dự đoán AI' },
    { id: 'IDENTIFIER', desktopLabel: 'Nhận dạng ngược', mobileLabel: 'Nhận dạng' },
    { id: 'SEARCH', desktopLabel: 'Tra cứu vật liệu', mobileLabel: 'Tra cứu' },
    { id: 'LOG', desktopLabel: `Bảng phép đo (${records.length})`, mobileLabel: `Đo (${records.length})` },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar: Strict 3-Zone Contract with Balanced Typographic Hierarchy */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-4 sm:gap-6">
          {/* Zone 1: Single text element display wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('SIMULATOR')}
            className="font-display text-lg sm:text-[20px] font-bold tracking-[-0.02em] text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            EMRefract Lab
          </button>

          {/* Zone 2: Clean single-line text navigation links (desktop) */}
          <nav
            aria-label="Điều hướng chính"
            className="hidden lg:flex items-center gap-6 text-sm font-medium"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={activeTab === item.id ? 'page' : undefined}
                onClick={() => setActiveTab(item.id)}
                className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === item.id
                    ? 'border-sky-600 text-slate-950 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.desktopLabel}
              </button>
            ))}
          </nav>

          {/* Zone 3: Auth action + Primary CTA */}
          <div className="flex items-center gap-2.5 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void signOutUser()}
                title={user.email ?? 'Đăng xuất'}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-slate-700 hover:text-slate-900 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="max-w-[100px] truncate">
                  {user.displayName?.split(' ')[0] || 'Tài khoản'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-slate-700 hover:text-slate-900 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                Đăng nhập
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleRecordMeasurement()}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ghi nhận phép đo
            </button>
          </div>
        </div>
      </header>

      {/* Subtle inline feedback strip when recording a measurement, applying AI/search params, or exporting PDF */}
      {statusBanner && (
        <div
          role="status"
          aria-live="polite"
          data-testid="status-banner"
          className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-[13px] px-6 py-2.5"
        >
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4">
            <span>● {statusBanner.text}</span>
            {statusBanner.showLogLink && (
              <button
                type="button"
                onClick={() => setActiveTab('LOG')}
                className="font-semibold underline hover:text-emerald-700 cursor-pointer whitespace-nowrap"
              >
                Xem bảng phép đo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Non-sticky mobile/tablet navigation tabs with horizontal scroll so labels never squish */}
      <div className="lg:hidden px-4 pt-3 bg-slate-50">
        <nav
          aria-label="Điều hướng di động"
          className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-lg overflow-x-auto"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={activeTab === item.id ? 'page' : undefined}
              onClick={() => setActiveTab(item.id)}
              className={`py-2 px-3 text-[13px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === item.id ? 'bg-white text-slate-950 font-semibold shadow-xs' : 'text-slate-600'
              }`}
            >
              {item.mobileLabel}
            </button>
          ))}
        </nav>
      </div>

      {/* Full-bleed 3D Optical Lab Viewport */}
      {activeTab === 'LAB_3D' ? (
        <main className="flex-1 w-full">
          <WaveScene3D
            physics={physics}
            polarization={polarization}
            wavelengthVacuumNm={wavelengthVacuumNm}
            material1Label={material1Label}
            material2Label={material2Label}
            onChangeIncidentAngle={(deg) => {
              setActiveScenarioId(null);
              setIncidentAngleDeg(deg);
            }}
            onChangeN1={(nextN1) => {
              setActiveScenarioId(null);
              setMaterial1Id('custom');
              setN1(nextN1);
            }}
            onChangeN2={(nextN2) => {
              setActiveScenarioId(null);
              setMaterial2Id('custom');
              setN2(nextN2);
            }}
            onSelectScenario={handleSelectScenario}
          />
        </main>
      ) : (
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
          {activeTab === 'SIMULATOR' && (
            <div className="grid grid-cols-1 lg:grid-cols-[336px_minmax(0,1fr)] gap-6 items-start">
              <div className="order-2 lg:order-1">
                <ControlDeck
                  n1={n1}
                  n2={n2}
                  material1Id={material1Id}
                  material2Id={material2Id}
                  incidentAngleDeg={incidentAngleDeg}
                  polarization={polarization}
                  wavelengthVacuumNm={wavelengthVacuumNm}
                  band={band}
                  activeScenarioId={activeScenarioId}
                  physics={physics}
                  onSelectScenario={handleSelectScenario}
                  onChangeMaterial1={(id, nextN) => {
                    setActiveScenarioId(null);
                    setMaterial1Id(id);
                    setN1(nextN);
                  }}
                  onChangeMaterial2={(id, nextN) => {
                    setActiveScenarioId(null);
                    setMaterial2Id(id);
                    setN2(nextN);
                  }}
                  onSwapMedia={handleSwapMedia}
                  onChangeIncidentAngle={(deg) => {
                    setActiveScenarioId(null);
                    setIncidentAngleDeg(deg);
                  }}
                  onChangePolarization={(pol) => {
                    setActiveScenarioId(null);
                    setPolarization(pol);
                  }}
                  onChangeBand={handleChangeBand}
                  onChangeWavelengthNm={(nm) => {
                    setActiveScenarioId(null);
                    setWavelengthVacuumNm(nm);
                  }}
                  onExportPdf={handleExportPdf}
                />
              </div>

              <div className="order-1 lg:order-2 space-y-5 min-w-0">
                <WaveCanvas
                  physics={physics}
                  polarization={polarization}
                  wavelengthVacuumNm={wavelengthVacuumNm}
                  material1Label={material1Label}
                  material2Label={material2Label}
                  canvasElementRef={waveCanvasRef}
                  onChangeIncidentAngle={(deg) => {
                    setActiveScenarioId(null);
                    setIncidentAngleDeg(deg);
                  }}
                  onChangeN1={(nextN1) => {
                    setActiveScenarioId(null);
                    setMaterial1Id('custom');
                    setN1(nextN1);
                  }}
                  onChangeN2={(nextN2) => {
                    setActiveScenarioId(null);
                    setMaterial2Id('custom');
                    setN2(nextN2);
                  }}
                  onResetSimulation={handleResetSimulation}
                />

                <CharacteristicsPanel
                  physics={physics}
                  onOpenAiPredictor={() => setActiveTab('AI_PREDICT')}
                />

                <FresnelChart
                  physics={physics}
                  polarization={polarization}
                  wavelengthVacuumNm={wavelengthVacuumNm}
                  material1Label={material1Label}
                  material2Label={material2Label}
                  onSelectAngle={(deg) => {
                    setActiveScenarioId(null);
                    setIncidentAngleDeg(deg);
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === 'AI_PREDICT' && (
            <AiWavePredictorView
              currentPhysics={physics}
              currentPolarization={polarization}
              currentWavelengthNm={wavelengthVacuumNm}
              material1Label={material1Label}
              material2Label={material2Label}
              onApplyPrediction={handleApplyAiPrediction}
            />
          )}

          {activeTab === 'IDENTIFIER' && (
            <InverseIdentifierView
              currentPhysics={physics}
              currentPolarization={polarization}
              currentWavelengthNm={wavelengthVacuumNm}
              onApplyToSimulator={handleApplyIdentified}
            />
          )}

          {activeTab === 'SEARCH' && (
            <MaterialSearchView
              currentN1={n1}
              currentN2={n2}
              wavelengthVacuumNm={wavelengthVacuumNm}
              onApplyRefractiveIndex={handleApplySearchedN2}
            />
          )}

          {activeTab === 'LOG' && (
            <MeasurementLogView
              records={records}
              syncLoading={syncLoading}
              syncError={syncError}
              onLoadRecord={handleLoadRecord}
              onDeleteRecord={(rec) => void handleDeleteRecord(rec)}
              onClearAll={() => void handleClearAllRecords()}
            />
          )}
        </main>
      )}

      {/* Minimal Quiet Footer (hidden in full-bleed 3D lab so 3D occupies 100vh cleanly) */}
      {activeTab !== 'LAB_3D' && (
        <footer className="border-t border-slate-200 bg-white py-4 px-6 text-[13px] text-slate-500">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2">
            <span>
              EMRefract Lab · Mô phỏng định luật Snell, phương trình Fresnel & sóng suy giảm điện môi
            </span>
            <span className="font-mono text-xs text-slate-400">
              n₁ sin θi = n₂ sin θt · Z = Z₀ / n · μr = 1
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
