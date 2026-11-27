import React, { useEffect } from 'react';
import { BookOpen, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { formatWavelength, WavePhysicsResult } from '../physics/emPhysics';

interface PhysicsFormulasModalProps {
  isOpen: boolean;
  onClose: () => void;
  n1: number;
  n2: number;
  incidentAngleDeg: number;
  wavelengthVacuumNm: number;
  physics: WavePhysicsResult;
}

interface FractionProps {
  numerator: React.ReactNode;
  denominator: React.ReactNode;
}

const MathFraction: React.FC<FractionProps> = ({ numerator, denominator }) => (
  <span className="inline-flex flex-col items-center align-middle mx-1 leading-tight">
    <span className="px-1.5 pb-0.5 border-b border-slate-500 text-center">{numerator}</span>
    <span className="px-1.5 pt-0.5 text-center">{denominator}</span>
  </span>
);

const SYMBOL_GLOSSARY: Array<{ symbol: string; meaning: string }> = [
  {
    symbol: 'n₁, n₂',
    meaning: 'Chiết suất tuyệt đối của môi trường tới (1) và môi trường khúc xạ (2), xác định mức độ làm chậm sóng (n = c / v).',
  },
  {
    symbol: 'θi, θr, θt',
    meaning: 'Góc tới, góc phản xạ (θr = θi) và góc khúc xạ, đều đo giữa tia sóng và đường pháp tuyến của mặt phân cách.',
  },
  {
    symbol: 'Δθ',
    meaning: 'Độ lệch hướng của tia khúc xạ so với phương truyền ban đầu (Δθ = |θi − θt|).',
  },
  {
    symbol: 's (TE)',
    meaning: 'Phân cực điện ngang (Transverse Electric): vectơ cường độ điện trường E vuông góc với mặt phẳng tới.',
  },
  {
    symbol: 'p (TM)',
    meaning: 'Phân cực từ ngang (Transverse Magnetic): vectơ điện trường E nằm song song trong mặt phẳng tới.',
  },
  {
    symbol: 'rs, rp',
    meaning: 'Hệ số biên độ phản xạ Fresnel cho phân cực s và p (tỷ số biên độ điện trường phản xạ trên điện trường tới).',
  },
  {
    symbol: 'Rs, Rp',
    meaning: 'Hệ số phản xạ công suất (tỷ lệ phần trăm năng lượng bật lại), tính bằng bình phương mô-đun |rs|² và |rp|².',
  },
  {
    symbol: 'Ts, Tp',
    meaning: 'Hệ số truyền qua công suất sang môi trường 2; theo bảo toàn năng lượng luôn có Rs + Ts = 1 và Rp + Tp = 1.',
  },
  {
    symbol: 'θc',
    meaning: 'Góc tới hạn phản xạ toàn phần (chỉ có khi n₁ > n₂). Khi θi > θc, toàn bộ năng lượng phản xạ (R = 100%).',
  },
  {
    symbol: 'θB',
    meaning: 'Góc Brewster (góc phân cực): tại θi = θB, sóng phản xạ thành phần TM bị triệt tiêu hoàn toàn (Rp = 0%).',
  },
  {
    symbol: 'λ₀, λ₁, λ₂',
    meaning: 'Bước sóng trong chân không (λ₀) và bước sóng nội môi trong môi trường 1, 2 (λ = λ₀ / n).',
  },
  {
    symbol: 'v, c',
    meaning: 'Vận tốc pha trong môi trường (v = c / n) và vận tốc ánh sáng trong chân không (c ≈ 2.998×10⁸ m/s).',
  },
  {
    symbol: 'εr, μr',
    meaning: 'Hằng số điện môi tương đối (εr = n² khi μr = 1) và độ từ thẩm tương đối của môi trường.',
  },
  {
    symbol: 'Z, Z₀',
    meaning: 'Trở kháng sóng nội tại của môi trường (Z = Z₀ / n) và trở kháng chân không (Z₀ ≈ 376.73 Ω).',
  },
  {
    symbol: 'd',
    meaning: 'Độ sâu xuyên thấu của sóng suy giảm bề mặt (evanescent wave) vào môi trường 2 khi xảy ra phản xạ toàn phần.',
  },
  {
    symbol: 'Δφ',
    meaning: 'Độ dịch pha của sóng phản xạ so với sóng tới (ví dụ 180° khi sóng đảo pha tại biên chiết quang tăng).',
  },
];

export const PhysicsFormulasModal: React.FC<PhysicsFormulasModalProps> = ({
  isOpen,
  onClose,
  n1,
  n2,
  incidentAngleDeg,
  wavelengthVacuumNm,
  physics,
}) => {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="formulas-backdrop"
          data-testid="formulas-modal-backdrop"
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/55 backdrop-blur-xs"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="formulas-modal-title"
            data-testid="formulas-modal"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[88vh] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0 bg-white">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 p-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 shrink-0">
                  <BookOpen className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="formulas-modal-title"
                    className="font-display text-lg sm:text-xl font-bold text-slate-950 tracking-[-0.015em]"
                  >
                    Hệ công thức vật lý mô phỏng khúc xạ sóng điện từ
                  </h2>
                  <p className="text-[13px] text-slate-600 mt-0.5 leading-relaxed">
                    Định luật Snell, phương trình phản xạ Fresnel cho phân cực s (TE) và p (TM) cùng chú giải từng ký hiệu.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng bảng công thức"
                data-testid="close-formulas-modal-btn"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
              {/* Active Lab Live Context Strip */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
                <span className="font-medium text-slate-700">Trạng thái mô phỏng hiện tại:</span>
                <span className="font-mono text-slate-800 tabular-nums">
                  n₁ = {n1.toFixed(3)} · n₂ = {n2.toFixed(3)} · θi = {incidentAngleDeg.toFixed(1)}° →{' '}
                  {physics.isTotalInternalReflection
                    ? 'TIR (R = 100%)'
                    : `θt = ${physics.refractedAngleDeg!.toFixed(2)}°`}
                </span>
              </div>

              {/* Section 1: Snell's Law */}
              <section className="space-y-3">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  1. Định luật khúc xạ Snell & Độ lệch tia
                </h3>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-mono text-base sm:text-lg font-semibold text-slate-950 tracking-tight">
                      n₁ · sin(θi) = n₂ · sin(θt)
                    </div>
                    <div className="font-mono text-xs text-sky-800 tabular-nums">
                      {physics.isTotalInternalReflection
                        ? `n₁ sin(θi) = ${(n1 * Math.sin((incidentAngleDeg * Math.PI) / 180)).toFixed(3)} > n₂ → Phản xạ toàn phần`
                        : `θt = ${physics.refractedAngleDeg!.toFixed(2)}° · Δθ = ${physics.deviationAngleDeg!.toFixed(2)}°`}
                    </div>
                  </div>
                  <div className="pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[13px] text-slate-800">
                    <div className="flex items-center">
                      <span>θt = arcsin</span>
                      <span className="mx-0.5">(</span>
                      <MathFraction numerator="n₁" denominator="n₂" />
                      <span>· sin θi )</span>
                    </div>
                    <div>Δθ = |θi − θt|</div>
                    <div>θr = θi</div>
                  </div>
                </div>
              </section>

              {/* Section 2: Fresnel Equations (s & p polarization) */}
              <section className="space-y-3">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  2. Phương trình phản xạ & truyền qua Fresnel (phân cực s và p)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* s-polarization (TE) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-sm font-semibold text-slate-900">
                        Phân cực s — TE (vuông góc)
                      </span>
                      <span className="font-mono text-xs font-semibold text-sky-700 tabular-nums">
                        Rs = {(physics.reflectanceS * 100).toFixed(2)}%
                      </span>
                    </div>

                    <div className="py-1 font-mono text-[13px] text-slate-950 overflow-x-auto">
                      <div className="inline-flex items-center whitespace-nowrap">
                        <span className="font-semibold">rs =</span>
                        <MathFraction
                          numerator="n₁ cos θi − n₂ cos θt"
                          denominator="n₁ cos θi + n₂ cos θt"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs font-mono text-slate-700 tabular-nums">
                      <span>Rs = |rs|²</span>
                      <span>Ts = 1 − Rs = {(physics.transmittanceS * 100).toFixed(2)}%</span>
                    </div>
                  </div>

                  {/* p-polarization (TM) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-sm font-semibold text-slate-900">
                        Phân cực p — TM (song song)
                      </span>
                      <span className="font-mono text-xs font-semibold text-indigo-700 tabular-nums">
                        Rp = {(physics.reflectanceP * 100).toFixed(2)}%
                      </span>
                    </div>

                    <div className="py-1 font-mono text-[13px] text-slate-950 overflow-x-auto">
                      <div className="inline-flex items-center whitespace-nowrap">
                        <span className="font-semibold">rp =</span>
                        <MathFraction
                          numerator="n₂ cos θi − n₁ cos θt"
                          denominator="n₂ cos θi + n₁ cos θt"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs font-mono text-slate-700 tabular-nums">
                      <span>Rp = |rp|²</span>
                      <span>Tp = 1 − Rp = {(physics.transmittanceP * 100).toFixed(2)}%</span>
                    </div>
                  </div>
                </div>

                {/* Unpolarized & Normal Incidence Summary */}
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px] font-mono text-slate-800">
                  <div className="inline-flex items-center">
                    <span>R_tự nhiên =</span>
                    <MathFraction numerator="Rs + Rp" denominator="2" />
                  </div>
                  <div>R + T = 100%</div>
                  <div className="inline-flex items-center">
                    <span>R₀ (θi = 0°) =</span>
                    <span className="mx-0.5">(</span>
                    <MathFraction numerator="n₁ − n₂" denominator="n₁ + n₂" />
                    <span>)²</span>
                  </div>
                </div>
              </section>

              {/* Section 3: Critical Angle, Brewster Angle & Evanescent Wave */}
              <section className="space-y-3">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  3. Góc đặc biệt & Thông số truyền sóng điện môi (μr = 1)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-[13px]">
                    <div className="font-mono text-slate-900 flex items-center flex-wrap gap-y-1">
                      <span className="font-semibold">Góc tới hạn (n₁ &gt; n₂):</span>
                      <span className="ml-2 inline-flex items-center">
                        sin θc = <MathFraction numerator="n₂" denominator="n₁" />
                      </span>
                    </div>
                    <div className="font-mono text-slate-900 flex items-center flex-wrap gap-y-1">
                      <span className="font-semibold">Góc Brewster (Rp = 0):</span>
                      <span className="ml-2 inline-flex items-center">
                        tan θB = <MathFraction numerator="n₂" denominator="n₁" />
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200/80 font-mono text-xs text-slate-600 tabular-nums">
                      Hiện tại: θB = {physics.brewsterAngleDeg.toFixed(2)}° ·{' '}
                      {physics.criticalAngleDeg !== null
                        ? `θc = ${physics.criticalAngleDeg.toFixed(2)}°`
                        : 'Không có θc (n₂ ≥ n₁)'}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-[13px]">
                    <div className="font-mono text-slate-900 flex flex-wrap gap-x-4 gap-y-1">
                      <span>v = c / n</span>
                      <span>λ = λ₀ / n</span>
                      <span>εr = n²</span>
                      <span>Z = Z₀ / n</span>
                    </div>
                    <div className="font-mono text-slate-900 flex items-center flex-wrap gap-y-1">
                      <span className="font-semibold">Sóng suy giảm (TIR):</span>
                      <span className="ml-1.5 inline-flex items-center text-xs">
                        d = <MathFraction numerator="λ₀" denominator="2π √(n₁² sin²θi − n₂²)" />
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200/80 font-mono text-xs text-slate-600 tabular-nums">
                      λ₀ = {formatWavelength(wavelengthVacuumNm)} → λ₂ ={' '}
                      {formatWavelength(physics.wavelength2Nm)}
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 4: Detailed Symbol Glossary */}
              <section className="space-y-3">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  4. Giải thích chi tiết các ký hiệu
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 border-t border-slate-200 pt-3">
                  {SYMBOL_GLOSSARY.map((item) => (
                    <div
                      key={item.symbol}
                      className="grid grid-cols-[74px_minmax(0,1fr)] gap-2.5 items-baseline py-1 border-b border-slate-100"
                    >
                      <dt className="font-mono text-xs font-semibold text-sky-800 whitespace-nowrap">
                        {item.symbol}
                      </dt>
                      <dd className="text-xs text-slate-600 leading-relaxed">{item.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>

            {/* Footer */}
            <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-slate-500">
                Áp dụng cho mặt phân cách phẳng giữa hai môi trường điện môi đẳng hướng, không tổn hao (μr = 1).
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[13px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
