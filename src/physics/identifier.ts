import {
  computeEMRefraction,
  degToRad,
  radToDeg,
  SPEED_OF_LIGHT,
  VACUUM_IMPEDANCE,
  WavePhysicsResult,
} from './emPhysics';
import { OPTICAL_MATERIALS, OpticalMaterial, PolarizationMode } from './materials';

export type MeasurementMode = 'SNELL_ANGLES' | 'CRITICAL_ANGLE' | 'BREWSTER_ANGLE';

export interface InverseMeasurementInput {
  mode: MeasurementMode;
  knownN1: number;
  incidentAngleDeg: number; // Used in SNELL_ANGLES
  refractedAngleDeg: number; // Used in SNELL_ANGLES
  measuredCriticalAngleDeg: number; // Used in CRITICAL_ANGLE
  measuredBrewsterAngleDeg: number; // Used in BREWSTER_ANGLE
  measuredReflectancePct: number | null; // Optional cross-check (0 - 100)
  polarization: PolarizationMode;
  wavelengthVacuumNm: number;
}

export interface MaterialCandidateMatch {
  material: OpticalMaterial;
  deltaN: number;
  confidencePct: number;
}

export interface ReflectanceConsistencyCheck {
  measuredPct: number;
  predictedPct: number;
  residualPct: number;
  status: 'MATCH' | 'MODERATE_DRIFT' | 'ANOMALY';
  diagnosis: string;
}

export interface InverseIdentificationResult {
  ok: true;
  estimatedN2: number;
  estimatedPermittivity2: number;
  estimatedImpedance2Ohm: number;
  estimatedVelocity2: number;
  wavelengthRatio: number;
  methodUsed: string;
  formulaTrace: string;
  physicsPreview: WavePhysicsResult;
  topCandidates: MaterialCandidateMatch[];
  consistencyCheck: ReflectanceConsistencyCheck | null;
}

export interface InverseIdentificationError {
  ok: false;
  fieldErrors: Record<string, string>;
  message: string;
}

export type InverseIdentificationOutput =
  | InverseIdentificationResult
  | InverseIdentificationError;

export interface MysterySamplePreset {
  id: string;
  title: string;
  description: string;
  input: InverseMeasurementInput;
}

export const MYSTERY_SAMPLES: MysterySamplePreset[] = [
  {
    id: 'sample-a',
    title: 'Mẫu đo A — Khối quang học trong suốt',
    description: 'Chiếu tia 532 nm từ không khí ở θi = 45.0°, đo được θt = 27.78° và R ≈ 4.9%.',
    input: {
      mode: 'SNELL_ANGLES',
      knownN1: 1.0003,
      incidentAngleDeg: 45.0,
      refractedAngleDeg: 27.78,
      measuredCriticalAngleDeg: 41.2,
      measuredBrewsterAngleDeg: 56.6,
      measuredReflectancePct: 4.9,
      polarization: 'UNPOLARIZED',
      wavelengthVacuumNm: 532,
    },
  },
  {
    id: 'sample-b',
    title: 'Mẫu đo B — Tinh thể chiết suất cao (Góc Brewster)',
    description: 'Đo được góc triệt tiêu phản xạ TM tại θB = 67.52° trong không khí.',
    input: {
      mode: 'BREWSTER_ANGLE',
      knownN1: 1.0003,
      incidentAngleDeg: 67.52,
      refractedAngleDeg: 22.48,
      measuredCriticalAngleDeg: 24.4,
      measuredBrewsterAngleDeg: 67.52,
      measuredReflectancePct: 0.05,
      polarization: 'TM',
      wavelengthVacuumNm: 589,
    },
  },
  {
    id: 'sample-c',
    title: 'Mẫu đo C — Xác định vỏ bọc sợi quang qua góc tới hạn',
    description: 'Sóng từ lõi thạch anh (n₁ = 1.458) bắt đầu phản xạ toàn phần tại θc = 66.1°.',
    input: {
      mode: 'CRITICAL_ANGLE',
      knownN1: 1.458,
      incidentAngleDeg: 66.1,
      refractedAngleDeg: 89,
      measuredCriticalAngleDeg: 66.1,
      measuredBrewsterAngleDeg: 42.4,
      measuredReflectancePct: 99.8,
      polarization: 'TE',
      wavelengthVacuumNm: 1550,
    },
  },
  {
    id: 'sample-d',
    title: 'Mẫu đo D — Phát hiện bất thường tổn hao hấp thụ',
    description: 'Góc Snell cho n₂ ≈ 1.333 nhưng độ phản xạ đo được cao bất thường (18.5%).',
    input: {
      mode: 'SNELL_ANGLES',
      knownN1: 1.0003,
      incidentAngleDeg: 40.0,
      refractedAngleDeg: 28.83,
      measuredCriticalAngleDeg: 48.6,
      measuredBrewsterAngleDeg: 53.1,
      measuredReflectancePct: 18.5,
      polarization: 'UNPOLARIZED',
      wavelengthVacuumNm: 633,
    },
  },
];

/**
 * Identifies unknown medium refractive index, dielectric permittivity, impedance,
 * closest physical materials, and checks Fresnel reflectance consistency from
 * experimental wave refraction measurements.
 */
export function identifyWaveMedium(
  input: InverseMeasurementInput
): InverseIdentificationOutput {
  const fieldErrors: Record<string, string> = {};

  if (!Number.isFinite(input.knownN1) || input.knownN1 < 1.0 || input.knownN1 > 5.0) {
    fieldErrors.knownN1 = 'Chiết suất môi trường biết trước n₁ phải nằm trong khoảng 1.00 đến 5.00.';
  }

  if (
    input.measuredReflectancePct !== null &&
    (!Number.isFinite(input.measuredReflectancePct) ||
      input.measuredReflectancePct < 0 ||
      input.measuredReflectancePct > 100)
  ) {
    fieldErrors.measuredReflectancePct = 'Hệ số phản xạ đo được phải nằm trong khoảng 0% đến 100%.';
  }

  let estimatedN2 = 1.0;
  let methodUsed = '';
  let formulaTrace = '';
  let previewAngleDeg = 45;

  if (input.mode === 'SNELL_ANGLES') {
    if (
      !Number.isFinite(input.incidentAngleDeg) ||
      input.incidentAngleDeg <= 0.1 ||
      input.incidentAngleDeg >= 89.9
    ) {
      fieldErrors.incidentAngleDeg =
        'Góc tới θi phải lớn hơn 0.1° và nhỏ hơn 89.9° để tính định luật Snell.';
    }
    if (
      !Number.isFinite(input.refractedAngleDeg) ||
      input.refractedAngleDeg <= 0.1 ||
      input.refractedAngleDeg >= 89.9
    ) {
      fieldErrors.refractedAngleDeg =
        'Góc khúc xạ θt phải lớn hơn 0.1° và nhỏ hơn 89.9°.';
    }

    if (Object.keys(fieldErrors).length === 0) {
      const sinI = Math.sin(degToRad(input.incidentAngleDeg));
      const sinT = Math.sin(degToRad(input.refractedAngleDeg));
      estimatedN2 = (input.knownN1 * sinI) / sinT;
      previewAngleDeg = input.incidentAngleDeg;
      methodUsed = 'Định luật Snell đảo (sin θi / sin θt)';
      formulaTrace = `n₂ = n₁ · sin(${input.incidentAngleDeg.toFixed(2)}°) / sin(${input.refractedAngleDeg.toFixed(2)}°) = ${estimatedN2.toFixed(4)}`;
    }
  } else if (input.mode === 'CRITICAL_ANGLE') {
    if (
      !Number.isFinite(input.measuredCriticalAngleDeg) ||
      input.measuredCriticalAngleDeg <= 5 ||
      input.measuredCriticalAngleDeg >= 89.5
    ) {
      fieldErrors.measuredCriticalAngleDeg =
        'Góc tới hạn θc phải nằm trong khoảng 5° đến 89.5°.';
    }
    if (Object.keys(fieldErrors).length === 0) {
      estimatedN2 = input.knownN1 * Math.sin(degToRad(input.measuredCriticalAngleDeg));
      previewAngleDeg = Math.min(88, input.measuredCriticalAngleDeg + 2);
      methodUsed = 'Nhận dạng từ góc tới hạn phản xạ toàn phần (θc)';
      formulaTrace = `n₂ = n₁ · sin(${input.measuredCriticalAngleDeg.toFixed(2)}°) = ${estimatedN2.toFixed(4)}`;
    }
  } else if (input.mode === 'BREWSTER_ANGLE') {
    if (
      !Number.isFinite(input.measuredBrewsterAngleDeg) ||
      input.measuredBrewsterAngleDeg <= 5 ||
      input.measuredBrewsterAngleDeg >= 85
    ) {
      fieldErrors.measuredBrewsterAngleDeg =
        'Góc Brewster θB phải nằm trong khoảng 5° đến 85°.';
    }
    if (Object.keys(fieldErrors).length === 0) {
      estimatedN2 = input.knownN1 * Math.tan(degToRad(input.measuredBrewsterAngleDeg));
      previewAngleDeg = input.measuredBrewsterAngleDeg;
      methodUsed = 'Nhận dạng từ góc phân cực Brewster (tan θB)';
      formulaTrace = `n₂ = n₁ · tan(${input.measuredBrewsterAngleDeg.toFixed(2)}°) = ${estimatedN2.toFixed(4)}`;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: 'Vui lòng kiểm tra lại các thông số đo chưa hợp lệ.',
    };
  }

  if (estimatedN2 < 0.99 || estimatedN2 > 5.5) {
    return {
      ok: false,
      fieldErrors: {
        general: `Kết quả suy luận n₂ = ${estimatedN2.toFixed(3)} nằm ngoài miền điện môi chuẩn (1.00 – 5.50). Kiểm tra lại góc đo hoặc n₁.`,
      },
      message: `Giá trị suy luận n₂ = ${estimatedN2.toFixed(3)} không khả thi về mặt vật lý cho điện môi thông thường.`,
    };
  }

  const clampedN2 = Math.max(1.0, estimatedN2);
  const estimatedPermittivity2 = clampedN2 * clampedN2;
  const estimatedImpedance2Ohm = VACUUM_IMPEDANCE / clampedN2;
  const estimatedVelocity2 = SPEED_OF_LIGHT / clampedN2;
  const wavelengthRatio = input.knownN1 / clampedN2;

  const physicsPreview = computeEMRefraction({
    n1: input.knownN1,
    n2: clampedN2,
    incidentAngleDeg: previewAngleDeg,
    wavelengthVacuumNm: input.wavelengthVacuumNm,
    polarization: input.polarization,
  });

  // Rank closest physical optical/RF materials by |n - n_est|
  const topCandidates: MaterialCandidateMatch[] = OPTICAL_MATERIALS.map((material) => {
    const deltaN = Math.abs(material.refractiveIndex - clampedN2);
    // Gaussian-like similarity curve calibrated so deltaN = 0.01 -> ~99%, deltaN = 0.05 -> ~82%, deltaN = 0.2 -> ~20%
    const confidencePct = Math.round(Math.exp(-(deltaN * deltaN) / (2 * 0.09 * 0.09)) * 1000) / 10;
    return {
      material,
      deltaN,
      confidencePct,
    };
  })
    .sort((a, b) => a.deltaN - b.deltaN)
    .slice(0, 4);

  // Cross-check measured reflectance against ideal lossless Fresnel prediction
  let consistencyCheck: ReflectanceConsistencyCheck | null = null;
  if (input.measuredReflectancePct !== null) {
    const predictedPct = physicsPreview.reflectanceEffective * 100;
    const residualPct = Math.abs(input.measuredReflectancePct - predictedPct);

    if (residualPct <= 2.5) {
      consistencyCheck = {
        measuredPct: input.measuredReflectancePct,
        predictedPct,
        residualPct,
        status: 'MATCH',
        diagnosis:
          'Phù hợp cao với mô hình điện môi lý tưởng không tổn hao (phương trình Fresnel chuẩn).',
      };
    } else if (residualPct <= 8.0) {
      consistencyCheck = {
        measuredPct: input.measuredReflectancePct,
        predictedPct,
        residualPct,
        status: 'MODERATE_DRIFT',
        diagnosis:
          'Có sai lệch trung bình so với Fresnel lý tưởng — có thể do nhám bề mặt, lớp phủ mỏng hoặc lệch góc phân cực.',
      };
    } else {
      consistencyCheck = {
        measuredPct: input.measuredReflectancePct,
        predictedPct,
        residualPct,
        status: 'ANOMALY',
        diagnosis:
          'Phát hiện bất thường phản xạ! Môi trường có thể là điện môi có tổn hao (hấp thụ phức κ > 0), bán dẫn dẫn điện, hoặc thiết lập sai phân cực TE/TM.',
      };
    }
  }

  return {
    ok: true,
    estimatedN2: clampedN2,
    estimatedPermittivity2,
    estimatedImpedance2Ohm,
    estimatedVelocity2,
    wavelengthRatio,
    methodUsed,
    formulaTrace,
    physicsPreview,
    topCandidates,
    consistencyCheck,
  };
}

/**
 * Helper to compute expected Snell refracted angle for unit tests and presets.
 */
export function expectedSnellAngleDeg(n1: number, n2: number, thetaIDeg: number): number | null {
  const sinT = (n1 / n2) * Math.sin(degToRad(thetaIDeg));
  if (sinT > 1) return null;
  return radToDeg(Math.asin(sinT));
}
