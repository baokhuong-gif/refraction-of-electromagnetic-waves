import React from 'react';
import { Download, LogIn, LogOut, Play, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatWavelength } from '../physics/emPhysics';
import { PolarizationMode, SpectrumBand } from '../physics/materials';

export interface MeasurementRecord {
  id: string;
  dbId?: number;
  timestamp: string;
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
}

interface MeasurementLogViewProps {
  records: MeasurementRecord[];
  syncLoading?: boolean;
  syncError?: string | null;
  onLoadRecord: (rec: MeasurementRecord) => void;
  onDeleteRecord: (rec: MeasurementRecord) => void;
  onClearAll: () => void;
}

export const MeasurementLogView: React.FC<MeasurementLogViewProps> = ({
  records,
  syncLoading = false,
  syncError = null,
  onLoadRecord,
  onDeleteRecord,
  onClearAll,
}) => {
  const { user, signInWithGoogle, signOutUser, authError } = useAuth();

  const handleExportCsv = () => {
    const header = [
      'STT',
      'Thoi_gian',
      'Kich_ban',
      'Che_do_truyen',
      'n1',
      'n2',
      'Goc_toi_deg',
      'Goc_khuc_xa_deg',
      'Phan_xa_pct',
      'Truyen_qua_pct',
      'Buoc_song_MT2_nm',
      'Phan_cuc',
    ];
    const rows = records.map((r, i) => [
      String(i + 1),
      r.timestamp,
      `"${r.label.replace(/"/g, '""')}"`,
      `"${r.regimeShort.replace(/"/g, '""')}"`,
      r.n1.toFixed(4),
      r.n2.toFixed(4),
      r.incidentAngleDeg.toFixed(2),
      r.refractedAngleDeg !== null ? r.refractedAngleDeg.toFixed(2) : 'TIR',
      r.reflectancePct.toFixed(2),
      r.transmittancePct.toFixed(2),
      r.wavelength2Nm.toFixed(2),
      r.polarization,
    ]);
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'emrefract-phep-do-song-dien-tu.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-label="Bảng ghi nhận phép đo thực nghiệm"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <div className="px-6 py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
            Bảng phép đo & So sánh chế độ truyền sóng
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {records.length} phép đo đã lưu · Nhấp &ldquo;Nạp&rdquo; để khôi phục cấu hình lên sân
            khấu mô phỏng
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700">
              <span className="max-w-[160px] truncate font-medium">
                {user.displayName || user.email}
              </span>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                Đăng xuất
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 transition-colors whitespace-nowrap cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              Đăng nhập Google để lưu lâu dài
            </button>
          )}

          <button
            type="button"
            disabled={records.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất CSV
          </button>
          <button
            type="button"
            disabled={records.length === 0}
            onClick={onClearAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Xóa bảng
          </button>
        </div>
      </div>

      {(authError || syncError) && (
        <div
          role="alert"
          className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900"
        >
          {authError || syncError}
        </div>
      )}

      {syncLoading ? (
        <div className="p-10 text-center text-xs text-slate-500">
          Đang tải danh sách phép đo của tài khoản...
        </div>
      ) : records.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm font-medium text-slate-700">Chưa có phép đo nào được ghi nhận.</p>
          <p className="text-xs text-slate-500 mt-1">
            Nhấn nút &ldquo;Ghi nhận phép đo&rdquo; ở thanh trên cùng để lưu trạng thái mô phỏng hiện
            tại.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                <th className="py-3.5 pl-6 pr-3 font-medium">#</th>
                <th className="py-3.5 px-3 font-medium">Môi trường / Phép đo</th>
                <th className="py-3.5 px-3 font-medium">Chế độ nhận dạng</th>
                <th className="py-3.5 px-3 font-medium text-right">n₁ → n₂</th>
                <th className="py-3.5 px-3 font-medium text-right">θi</th>
                <th className="py-3.5 px-3 font-medium text-right">θt</th>
                <th className="py-3.5 px-3 font-medium text-right">R (%)</th>
                <th className="py-3.5 px-3 font-medium text-right">T (%)</th>
                <th className="py-3.5 px-3 font-medium text-right">λ₂</th>
                <th className="py-3.5 px-3 font-medium">Phân cực</th>
                <th className="py-3.5 pl-3 pr-6 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((rec, idx) => (
                <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 pl-6 pr-3 font-mono text-xs text-slate-400 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="font-semibold text-slate-900">{rec.label}</div>
                    <div className="text-xs font-mono text-slate-400 mt-0.5">{rec.timestamp}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-700 whitespace-nowrap">{rec.regimeShort}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                    {rec.n1.toFixed(3)} → {rec.n2.toFixed(3)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                    {rec.incidentAngleDeg.toFixed(1)}°
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                    {rec.refractedAngleDeg !== null ? `${rec.refractedAngleDeg.toFixed(1)}°` : 'TIR'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-700">
                    {rec.reflectancePct.toFixed(1)}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700">
                    {rec.transmittancePct.toFixed(1)}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {formatWavelength(rec.wavelength2Nm)}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-600">{rec.polarization}</td>
                  <td className="py-3 pl-3 pr-6 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onLoadRecord(rec)}
                        aria-label={`Nạp phép đo ${rec.label}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-200 bg-white text-sky-700 hover:bg-sky-50 transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        Nạp
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRecord(rec)}
                        aria-label={`Xóa phép đo ${rec.label}`}
                        className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
