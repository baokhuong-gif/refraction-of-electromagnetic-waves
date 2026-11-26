import { PolarizationMode } from './materials';

export const SPEED_OF_LIGHT = 299_792_458; // m/s
export const VACUUM_IMPEDANCE = 376.730313668; // Ohms (Z0 = sqrt(mu0/eps0))

export type PropagationRegimeCode =
  | 'MATCHED_MEDIA'
  | 'NORMAL_INCIDENCE'
  | 'BREWSTER_ANGLE'
  | 'CRITICAL_THRESHOLD'
  | 'TOTAL_INTERNAL_REFLECTION'
  | 'REFRACTION_TO_DENSER'
  | 'REFRACTION_TO_RARER';

export interface WaveSimulationInput {
  n1: number;
  n2: number;
  incidentAngleDeg: number; // [0, 89.9]
  wavelengthVacuumNm: number; // vacuum wavelength in nm (e.g. 532 nm or 30,000,000 nm for 10 GHz)
  polarization: PolarizationMode;
}

export interface PropagationClassification {
  code: PropagationRegimeCode;
  label: string;
  shortTag: string;
  severity: 'nominal' | 'transition' | 'critical';
  summary: string;
  keyCharacteristics: string[];
}

export interface WavePhysicsResult {
  n1: number;
  n2: number;
  incidentAngleDeg: number;
  incidentAngleRad: number;
  reflectedAngleDeg: number;
  refractedAngleDeg: number | null; // null in TIR
  refractedAngleRad: number | null;
  deviationAngleDeg: number | null;
  isTotalInternalReflection: boolean;
  isNearCritical: boolean;
  isNearBrewster: boolean;

  criticalAngleDeg: number | null; // exists iff n1 > n2
  brewsterAngleDeg: number;

  // Fresnel amplitude reflection coefficients (complex magnitude and phase shift in degrees)
  rsMag: number;
  rpMag: number;
  phaseShiftSDeg: number;
  phaseShiftPDeg: number;

  // Fresnel power reflectance & transmittance [0, 1]
  reflectanceS: number;
  reflectanceP: number;
  reflectanceEffective: number;
  transmittanceS: number;
  transmittanceP: number;
  transmittanceEffective: number;

  // Wave kinematics & electromagnetic medium parameters
  frequencyHz: number;
  phaseVelocity1: number; // m/s
  phaseVelocity2: number; // m/s
  wavelength1Nm: number;
  wavelength2Nm: number;
  wavelengthRatio: number; // lambda2 / lambda1 = n1 / n2
  waveNumber1: number; // rad/m
  waveNumber2: number; // rad/m
  impedance1Ohm: number;
  impedance2Ohm: number;
  permittivity1: number;
  permittivity2: number;

  // Evanescent wave decay depth (1/e amplitude decay) in nm when TIR occurs
  evanescentPenetrationDepthNm: number | null;

  // Automatic characteristic identification
  classification: PropagationClassification;
}

export interface FresnelCurvePoint {
  angleDeg: number;
  Rs: number;
  Rp: number;
  Runpol: number;
  Teff: number;
  phaseS: number;
  phaseP: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Computes complete Snell's Law, Fresnel reflectance/transmittance, phase shifts,
 * evanescent penetration depth, and automatic propagation regime classification
 * for a non-magnetic isotropic lossless dielectric interface (mu_r1 = mu_r2 = 1).
 */
export function computeEMRefraction(input: WaveSimulationInput): WavePhysicsResult {
  const n1 = clamp(input.n1, 1.0, 5.0);
  const n2 = clamp(input.n2, 1.0, 5.0);
  const incidentAngleDeg = clamp(input.incidentAngleDeg, 0, 89.9);
  const incidentAngleRad = degToRad(incidentAngleDeg);
  const wavelengthVacuumNm = Math.max(1, input.wavelengthVacuumNm);

  const sinI = Math.sin(incidentAngleRad);
  const cosI = Math.cos(incidentAngleRad);

  const brewsterAngleDeg = radToDeg(Math.atan2(n2, n1));
  const criticalAngleDeg = n1 > n2 ? radToDeg(Math.asin(n2 / n1)) : null;

  const sinT = (n1 / n2) * sinI;
  const isTotalInternalReflection = sinT > 1 + 1e-12;
  const isNearCritical =
    criticalAngleDeg !== null && Math.abs(incidentAngleDeg - criticalAngleDeg) <= 0.6;
  const isNearBrewster =
    Math.abs(n1 - n2) > 0.005 && Math.abs(incidentAngleDeg - brewsterAngleDeg) <= 0.6;

  let refractedAngleRad: number | null = null;
  let refractedAngleDeg: number | null = null;
  let deviationAngleDeg: number | null = null;

  let rsMag = 0;
  let rpMag = 0;
  let phaseShiftSDeg = 0;
  let phaseShiftPDeg = 0;

  let reflectanceS = 0;
  let reflectanceP = 0;
  let transmittanceS = 1;
  let transmittanceP = 1;
  let evanescentPenetrationDepthNm: number | null = null;

  if (isTotalInternalReflection) {
    // Total Internal Reflection (TIR): |r_s| = |r_p| = 1, T = 0
    rsMag = 1;
    rpMag = 1;
    reflectanceS = 1;
    reflectanceP = 1;
    transmittanceS = 0;
    transmittanceP = 0;

    // Exact TIR phase shifts (Born & Wolf / Hecht convention)
    const radical = Math.sqrt(Math.max(0, sinI * sinI - (n2 / n1) * (n2 / n1)));
    const phiSRad = 2 * Math.atan2(radical, cosI);
    const phiPRad = 2 * Math.atan2(radical, (n2 / n1) * (n2 / n1) * cosI);
    phaseShiftSDeg = radToDeg(phiSRad);
    phaseShiftPDeg = radToDeg(phiPRad);

    // Evanescent field decay depth: delta_e = lambda_0 / (2 * pi * sqrt(n1^2 sin^2(theta_i) - n2^2))
    const decayTerm = Math.sqrt(Math.max(1e-12, n1 * n1 * sinI * sinI - n2 * n2));
    evanescentPenetrationDepthNm = wavelengthVacuumNm / (2 * Math.PI * decayTerm);
  } else {
    const clampedSinT = clamp(sinT, -1, 1);
    refractedAngleRad = Math.asin(clampedSinT);
    refractedAngleDeg = radToDeg(refractedAngleRad);
    deviationAngleDeg = Math.abs(incidentAngleDeg - refractedAngleDeg);

    const cosT = Math.cos(refractedAngleRad);

    // Fresnel amplitude reflection coefficients (r_s for TE, r_p for TM)
    // Using standard optical convention:
    // r_s = (n1 cosI - n2 cosT) / (n1 cosI + n2 cosT)
    // r_p = (n2 cosI - n1 cosT) / (n2 cosI + n1 cosT)
    const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
    const rp = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT);

    rsMag = Math.abs(rs);
    rpMag = Math.abs(rp);
    phaseShiftSDeg = rs < -1e-12 ? 180 : 0;
    phaseShiftPDeg = rp < -1e-12 ? 180 : 0;

    reflectanceS = clamp(rs * rs, 0, 1);
    reflectanceP = clamp(rp * rp, 0, 1);
    transmittanceS = clamp(1 - reflectanceS, 0, 1);
    transmittanceP = clamp(1 - reflectanceP, 0, 1);
  }

  let reflectanceEffective: number;
  let transmittanceEffective: number;

  if (input.polarization === 'TE') {
    reflectanceEffective = reflectanceS;
    transmittanceEffective = transmittanceS;
  } else if (input.polarization === 'TM') {
    reflectanceEffective = reflectanceP;
    transmittanceEffective = transmittanceP;
  } else {
    reflectanceEffective = 0.5 * (reflectanceS + reflectanceP);
    transmittanceEffective = 0.5 * (transmittanceS + transmittanceP);
  }

  // Wave kinematics
  const wavelengthVacuumM = wavelengthVacuumNm * 1e-9;
  const frequencyHz = SPEED_OF_LIGHT / wavelengthVacuumM;
  const phaseVelocity1 = SPEED_OF_LIGHT / n1;
  const phaseVelocity2 = SPEED_OF_LIGHT / n2;
  const wavelength1Nm = wavelengthVacuumNm / n1;
  const wavelength2Nm = wavelengthVacuumNm / n2;
  const wavelengthRatio = n1 / n2;
  const waveNumber1 = (2 * Math.PI) / (wavelength1Nm * 1e-9);
  const waveNumber2 = (2 * Math.PI) / (wavelength2Nm * 1e-9);
  const impedance1Ohm = VACUUM_IMPEDANCE / n1;
  const impedance2Ohm = VACUUM_IMPEDANCE / n2;
  const permittivity1 = n1 * n1;
  const permittivity2 = n2 * n2;

  const classification = classifyPropagationRegime({
    n1,
    n2,
    incidentAngleDeg,
    refractedAngleDeg,
    isTotalInternalReflection,
    isNearCritical,
    isNearBrewster,
    criticalAngleDeg,
    brewsterAngleDeg,
    reflectanceS,
    reflectanceP,
    polarization: input.polarization,
    evanescentPenetrationDepthNm,
    wavelengthRatio,
  });

  return {
    n1,
    n2,
    incidentAngleDeg,
    incidentAngleRad,
    reflectedAngleDeg: incidentAngleDeg,
    refractedAngleDeg,
    refractedAngleRad,
    deviationAngleDeg,
    isTotalInternalReflection,
    isNearCritical,
    isNearBrewster,
    criticalAngleDeg,
    brewsterAngleDeg,
    rsMag,
    rpMag,
    phaseShiftSDeg,
    phaseShiftPDeg,
    reflectanceS,
    reflectanceP,
    reflectanceEffective,
    transmittanceS,
    transmittanceP,
    transmittanceEffective,
    frequencyHz,
    phaseVelocity1,
    phaseVelocity2,
    wavelength1Nm,
    wavelength2Nm,
    wavelengthRatio,
    waveNumber1,
    waveNumber2,
    impedance1Ohm,
    impedance2Ohm,
    permittivity1,
    permittivity2,
    evanescentPenetrationDepthNm,
    classification,
  };
}

function classifyPropagationRegime(params: {
  n1: number;
  n2: number;
  incidentAngleDeg: number;
  refractedAngleDeg: number | null;
  isTotalInternalReflection: boolean;
  isNearCritical: boolean;
  isNearBrewster: boolean;
  criticalAngleDeg: number | null;
  brewsterAngleDeg: number;
  reflectanceS: number;
  reflectanceP: number;
  polarization: PolarizationMode;
  evanescentPenetrationDepthNm: number | null;
  wavelengthRatio: number;
}): PropagationClassification {
  const {
    n1,
    n2,
    incidentAngleDeg,
    isTotalInternalReflection,
    isNearCritical,
    isNearBrewster,
    criticalAngleDeg,
    brewsterAngleDeg,
    reflectanceS,
    reflectanceP,
    evanescentPenetrationDepthNm,
    wavelengthRatio,
  } = params;

  if (Math.abs(n1 - n2) < 0.005) {
    return {
      code: 'MATCHED_MEDIA',
      label: 'Môi trường đồng nhất — Không khúc xạ',
      shortTag: 'Đồng nhất trở kháng',
      severity: 'nominal',
      summary:
        'Hai môi trường có chiết suất và trở kháng sóng tương đương (Z₁ ≈ Z₂). Sóng điện từ truyền thẳng gần như hoàn toàn không phản xạ.',
      keyCharacteristics: [
        'Góc khúc xạ bằng góc tới (θt ≈ θi), độ lệch tia ≈ 0°',
        'Hệ số phản xạ Fresnel xấp xỉ 0% cho cả phân cực TE và TM',
        'Không có sự nén hay giãn bước sóng qua mặt phân cách',
      ],
    };
  }

  if (isTotalInternalReflection) {
    const depthStr =
      evanescentPenetrationDepthNm !== null
        ? formatWavelength(evanescentPenetrationDepthNm)
        : '—';
    return {
      code: 'TOTAL_INTERNAL_REFLECTION',
      label: 'Phản xạ toàn phần & Sóng suy giảm (TIR)',
      shortTag: 'Phản xạ toàn phần',
      severity: 'critical',
      summary: `Góc tới vượt ngưỡng tới hạn θc = ${criticalAngleDeg?.toFixed(2)}°. Toàn bộ công suất phản xạ về môi trường 1 (R = 100%) và tạo sóng suy giảm (evanescent) lan sát mặt phân cách.`,
      keyCharacteristics: [
        'Công suất truyền xa T = 0%, toàn bộ năng lượng bảo toàn trong tia phản xạ',
        `Độ sâu xuyên thấu biên độ 1/e của sóng suy giảm: δe ≈ ${depthStr}`,
        'Xuất hiện dịch pha phi tuyến liên tục (hiệu ứng Goos–Hänchen) giữa TE và TM',
      ],
    };
  }

  if (isNearCritical && criticalAngleDeg !== null) {
    return {
      code: 'CRITICAL_THRESHOLD',
      label: 'Ngưỡng góc tới hạn (Critical Angle)',
      shortTag: 'Ngưỡng tới hạn',
      severity: 'transition',
      summary: `Góc tới tiệm cận ngưỡng tới hạn θc = ${criticalAngleDeg.toFixed(2)}°. Tia khúc xạ truyền sát mặt phân cách (θt → 90°), hệ số phản xạ tăng dốc về 100%.`,
      keyCharacteristics: [
        'Tia ló đi là là dọc biên phân cách hai môi trường điện môi',
        'Chỉ cần tăng nhẹ góc tới sẽ kích hoạt chế độ phản xạ toàn phần (TIR)',
        'Nhạy cảm cao với biến thiên chiết suất — ứng dụng trong cảm biến quang học',
      ],
    };
  }

  if (isNearBrewster) {
    return {
      code: 'BREWSTER_ANGLE',
      label: 'Góc Brewster — Triệt tiêu phản xạ TM',
      shortTag: 'Góc Brewster',
      severity: 'transition',
      summary: `Tại θB = ${brewsterAngleDeg.toFixed(2)}°, tia phản xạ và tia khúc xạ vuông góc nhau (θi + θt = 90°). Thành phần phân cực TM truyền qua 100% (Rp ≈ ${(reflectanceP * 100).toFixed(2)}%).`,
      keyCharacteristics: [
        'Tia phản xạ bị phân cực tuyến tính thuần TE (vuông góc mặt phẳng tới)',
        `Công suất phản xạ Rp ≈ ${(reflectanceP * 100).toFixed(2)}%, trong khi Rs = ${(reflectanceS * 100).toFixed(2)}%`,
        'Ứng dụng trong cửa sổ laser Brewster và kính lọc chống chói phân cực',
      ],
    };
  }

  if (incidentAngleDeg <= 0.5) {
    const rPct = (reflectanceS * 100).toFixed(2);
    return {
      code: 'NORMAL_INCIDENCE',
      label: 'Chiếu vuông góc pháp tuyến (Normal Incidence)',
      shortTag: 'Chiếu pháp tuyến',
      severity: 'nominal',
      summary: `Sóng điện từ đập vuông góc mặt phân cách (θi ≈ 0°). Không xảy ra bẻ cong phương truyền, phân cực TE và TM đối xứng hoàn toàn (Rs = Rp = ${rPct}%).`,
      keyCharacteristics: [
        'Tia truyền thẳng (θt = 0°), chỉ thay đổi vận tốc pha và bước sóng',
        `Hệ số phản xạ phụ thuộc thuần vào độ lệch trở kháng: R = ((n₁ − n₂)/(n₁ + n₂))² = ${rPct}%`,
        n2 > n1
          ? 'Tia phản xạ đảo pha 180° do đi vào môi trường chiết quang hơn'
          : 'Tia phản xạ giữ nguyên pha 0° do đi vào môi trường kém chiết quang hơn',
      ],
    };
  }

  if (n2 > n1) {
    return {
      code: 'REFRACTION_TO_DENSER',
      label: 'Khúc xạ chuẩn — Chiết quang tăng (n₂ > n₁)',
      shortTag: 'Chiết quang tăng',
      severity: 'nominal',
      summary: `Sóng đi vào môi trường chiết quang hơn (v₂ < v₁). Tia khúc xạ lệch lại gần pháp tuyến (θt < θi), bước sóng bị nén còn ${(wavelengthRatio * 100).toFixed(1)}% so với môi trường 1.`,
      keyCharacteristics: [
        'Không tồn tại góc tới hạn (sóng luôn truyền được vào môi trường 2 với mọi góc tới)',
        'Thành phần TE đảo pha 180° khi phản xạ; thành phần TM đổi pha khi vượt góc Brewster',
        `Tỷ số nén bước sóng λ₂/λ₁ = ${wavelengthRatio.toFixed(3)}, trở kháng sóng giảm`,
      ],
    };
  }

  return {
    code: 'REFRACTION_TO_RARER',
    label: 'Khúc xạ chuẩn — Chiết quang giảm (n₁ > n₂)',
    shortTag: 'Chiết quang giảm',
    severity: 'nominal',
    summary: `Sóng đi sang môi trường chiết suất thấp hơn (v₂ > v₁). Tia khúc xạ lệch xa pháp tuyến (θt > θi), bước sóng giãn ra ${(wavelengthRatio).toFixed(2)} lần. Góc tới hạn θc = ${criticalAngleDeg?.toFixed(2)}°.`,
    keyCharacteristics: [
      `Tồn tại ngưỡng phản xạ toàn phần tại θc = ${criticalAngleDeg?.toFixed(2)}°`,
      'Tia phản xạ giữ nguyên pha (0°) đối với phân cực TE dưới ngưỡng tới hạn',
      `Vận tốc pha tăng từ ${(SPEED_OF_LIGHT / n1 / 1e8).toFixed(2)}×10⁸ lên ${(SPEED_OF_LIGHT / n2 / 1e8).toFixed(2)}×10⁸ m/s`,
    ],
  };
}

/**
 * Generates sampled Fresnel curves from 0° to 89.5° for interactive plotting.
 */
export function generateFresnelCurve(
  n1: number,
  n2: number,
  polarization: PolarizationMode,
  wavelengthVacuumNm: number,
  stepDeg = 1
): FresnelCurvePoint[] {
  const points: FresnelCurvePoint[] = [];
  for (let angle = 0; angle <= 89; angle += stepDeg) {
    const res = computeEMRefraction({
      n1,
      n2,
      incidentAngleDeg: angle,
      wavelengthVacuumNm,
      polarization,
    });
    points.push({
      angleDeg: angle,
      Rs: res.reflectanceS,
      Rp: res.reflectanceP,
      Runpol: 0.5 * (res.reflectanceS + res.reflectanceP),
      Teff: res.transmittanceEffective,
      phaseS: res.phaseShiftSDeg,
      phaseP: res.phaseShiftPDeg,
    });
  }
  // Ensure 89.9 endpoint for smooth grazing finish
  const endRes = computeEMRefraction({
    n1,
    n2,
    incidentAngleDeg: 89.9,
    wavelengthVacuumNm,
    polarization,
  });
  points.push({
    angleDeg: 89.9,
    Rs: endRes.reflectanceS,
    Rp: endRes.reflectanceP,
    Runpol: 0.5 * (endRes.reflectanceS + endRes.reflectanceP),
    Teff: endRes.transmittanceEffective,
    phaseS: endRes.phaseShiftSDeg,
    phaseP: endRes.phaseShiftPDeg,
  });
  return points;
}

/**
 * Converts a visible wavelength (380-750 nm) or IR/Microwave band to a calibrated display RGB hex color.
 */
export function wavelengthToColor(wavelengthNm: number): string {
  if (wavelengthNm > 780) {
    // Infrared or RF/Microwave: calibrated high-contrast scientific accent
    return wavelengthNm >= 1_000_000 ? '#0284c7' : '#dc2626';
  }
  if (wavelengthNm < 380) {
    return '#6d28d9';
  }

  let r = 0;
  let g = 0;
  let b = 0;

  if (wavelengthNm >= 380 && wavelengthNm < 440) {
    r = -(wavelengthNm - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wavelengthNm >= 440 && wavelengthNm < 490) {
    r = 0;
    g = (wavelengthNm - 440) / (490 - 440);
    b = 1;
  } else if (wavelengthNm >= 490 && wavelengthNm < 510) {
    r = 0;
    g = 1;
    b = -(wavelengthNm - 510) / (510 - 490);
  } else if (wavelengthNm >= 510 && wavelengthNm < 580) {
    r = (wavelengthNm - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wavelengthNm >= 580 && wavelengthNm < 645) {
    r = 1;
    g = -(wavelengthNm - 645) / (645 - 580);
    b = 0;
  } else {
    r = 1;
    g = 0;
    b = 0;
  }

  // Slightly darken overly bright yellow/green for clean legibility on light lab canvas
  const lumScale = wavelengthNm >= 520 && wavelengthNm <= 600 ? 0.78 : 0.88;
  const toHex = (c: number) =>
    Math.round(clamp(c * lumScale, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function formatWavelength(wavelengthNm: number): string {
  if (wavelengthNm >= 1e9) {
    return `${(wavelengthNm / 1e9).toFixed(2)} m`;
  }
  if (wavelengthNm >= 1e6) {
    return `${(wavelengthNm / 1e6).toFixed(2)} mm`;
  }
  if (wavelengthNm >= 1e3) {
    return `${(wavelengthNm / 1e3).toFixed(2)} µm`;
  }
  return `${wavelengthNm.toFixed(1)} nm`;
}

export function formatFrequency(freqHz: number): string {
  if (freqHz >= 1e12) {
    return `${(freqHz / 1e12).toFixed(1)} THz`;
  }
  if (freqHz >= 1e9) {
    return `${(freqHz / 1e9).toFixed(2)} GHz`;
  }
  if (freqHz >= 1e6) {
    return `${(freqHz / 1e6).toFixed(2)} MHz`;
  }
  return `${freqHz.toFixed(0)} Hz`;
}
