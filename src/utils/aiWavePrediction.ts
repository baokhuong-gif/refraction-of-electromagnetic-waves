import { clamp, computeEMRefraction, type WavePhysicsResult } from '../physics/emPhysics.ts';
import type { PolarizationMode } from '../physics/materials.ts';

export type WaveDirectionCategory =
  | 'TOWARD_NORMAL'
  | 'AWAY_FROM_NORMAL'
  | 'STRAIGHT_THROUGH'
  | 'TOTAL_INTERNAL_REFLECTION'
  | 'GRAZING_REFRACTION';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AiWavePrediction {
  scenarioSummary: string;
  inferredN1: number;
  inferredN2: number;
  inferredIncidentAngleDeg: number;
  inferredWavelengthNm: number;
  inferredPolarization: PolarizationMode;
  directionCategory: WaveDirectionCategory;
  directionLabel: string;
  predictedRefractedAngleDeg: number | null;
  predictedReflectedAngleDeg: number;
  predictedDeviationDeg: number;
  confidenceLevel: ConfidenceLevel;
  physicalReasoning: string;
  engineeringRecommendations: string[];
}

export interface PhysicsCrossCheck {
  exactPhysics: WavePhysicsResult;
  expectedCategory: WaveDirectionCategory;
  isDirectionAligned: boolean;
  angleDiscrepancyDeg: number | null;
}

export interface TrajectorySvgGeometry {
  cx: number;
  cy: number;
  incStart: { x: number; y: number };
  refEnd: { x: number; y: number };
  transEnd: { x: number; y: number } | null;
  isTir: boolean;
}

const VALID_CATEGORIES = new Set<WaveDirectionCategory>([
  'TOWARD_NORMAL',
  'AWAY_FROM_NORMAL',
  'STRAIGHT_THROUGH',
  'TOTAL_INTERNAL_REFLECTION',
  'GRAZING_REFRACTION',
]);

const VALID_CONFIDENCE = new Set<ConfidenceLevel>(['HIGH', 'MEDIUM', 'LOW']);
const VALID_POLARIZATIONS = new Set<PolarizationMode>(['TE', 'TM', 'UNPOLARIZED']);

export function normalizeAiWavePrediction(raw: unknown): AiWavePrediction {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Phản hồi dự đoán AI không đúng định dạng dữ liệu.');
  }

  const obj = raw as Record<string, unknown>;

  const scenarioSummary =
    typeof obj.scenarioSummary === 'string' && obj.scenarioSummary.trim().length > 0
      ? obj.scenarioSummary.trim()
      : 'Kịch bản truyền sóng điện từ qua mặt phân cách hai môi trường';

  const inferredN1 =
    typeof obj.inferredN1 === 'number' && Number.isFinite(obj.inferredN1)
      ? clamp(obj.inferredN1, 1.0, 4.0)
      : NaN;
  const inferredN2 =
    typeof obj.inferredN2 === 'number' && Number.isFinite(obj.inferredN2)
      ? clamp(obj.inferredN2, 1.0, 4.0)
      : NaN;
  const inferredIncidentAngleDeg =
    typeof obj.inferredIncidentAngleDeg === 'number' && Number.isFinite(obj.inferredIncidentAngleDeg)
      ? clamp(obj.inferredIncidentAngleDeg, 0, 89.5)
      : NaN;

  if (!Number.isFinite(inferredN1) || !Number.isFinite(inferredN2) || !Number.isFinite(inferredIncidentAngleDeg)) {
    throw new Error('Mô hình AI không trích xuất đủ tham số vật lý (n₁, n₂, θi).');
  }

  const inferredWavelengthNm =
    typeof obj.inferredWavelengthNm === 'number' && Number.isFinite(obj.inferredWavelengthNm)
      ? clamp(obj.inferredWavelengthNm, 100, 300_000_000)
      : 532;

  const inferredPolarization: PolarizationMode =
    typeof obj.inferredPolarization === 'string' &&
    VALID_POLARIZATIONS.has(obj.inferredPolarization as PolarizationMode)
      ? (obj.inferredPolarization as PolarizationMode)
      : 'UNPOLARIZED';

  const directionCategory: WaveDirectionCategory =
    typeof obj.directionCategory === 'string' &&
    VALID_CATEGORIES.has(obj.directionCategory as WaveDirectionCategory)
      ? (obj.directionCategory as WaveDirectionCategory)
      : 'TOWARD_NORMAL';

  const directionLabel =
    typeof obj.directionLabel === 'string' && obj.directionLabel.trim().length > 0
      ? obj.directionLabel.trim()
      : getDefaultDirectionLabel(directionCategory);

  const predictedRefractedAngleDeg =
    directionCategory === 'TOTAL_INTERNAL_REFLECTION' ||
    obj.predictedRefractedAngleDeg === null ||
    obj.predictedRefractedAngleDeg === undefined
      ? null
      : typeof obj.predictedRefractedAngleDeg === 'number' &&
          Number.isFinite(obj.predictedRefractedAngleDeg)
        ? clamp(obj.predictedRefractedAngleDeg, 0, 90)
        : null;

  const predictedReflectedAngleDeg =
    typeof obj.predictedReflectedAngleDeg === 'number' &&
    Number.isFinite(obj.predictedReflectedAngleDeg)
      ? clamp(obj.predictedReflectedAngleDeg, 0, 89.5)
      : inferredIncidentAngleDeg;

  const predictedDeviationDeg =
    typeof obj.predictedDeviationDeg === 'number' && Number.isFinite(obj.predictedDeviationDeg)
      ? clamp(obj.predictedDeviationDeg, 0, 180)
      : predictedRefractedAngleDeg !== null
        ? Math.abs(inferredIncidentAngleDeg - predictedRefractedAngleDeg)
        : 180 - 2 * inferredIncidentAngleDeg;

  const confidenceLevel: ConfidenceLevel =
    typeof obj.confidenceLevel === 'string' &&
    VALID_CONFIDENCE.has(obj.confidenceLevel as ConfidenceLevel)
      ? (obj.confidenceLevel as ConfidenceLevel)
      : 'HIGH';

  const physicalReasoning =
    typeof obj.physicalReasoning === 'string' && obj.physicalReasoning.trim().length > 0
      ? obj.physicalReasoning.trim()
      : 'Hướng truyền sóng tuân theo định luật Snell và sự thay đổi vận tốc pha tại mặt phân cách.';

  const engineeringRecommendations = Array.isArray(obj.engineeringRecommendations)
    ? obj.engineeringRecommendations
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 4)
    : [];

  return {
    scenarioSummary,
    inferredN1,
    inferredN2,
    inferredIncidentAngleDeg,
    inferredWavelengthNm,
    inferredPolarization,
    directionCategory,
    directionLabel,
    predictedRefractedAngleDeg,
    predictedReflectedAngleDeg,
    predictedDeviationDeg,
    confidenceLevel,
    physicalReasoning,
    engineeringRecommendations,
  };
}

export function getDefaultDirectionLabel(category: WaveDirectionCategory): string {
  switch (category) {
    case 'TOWARD_NORMAL':
      return 'Khúc xạ lệch lại gần pháp tuyến';
    case 'AWAY_FROM_NORMAL':
      return 'Khúc xạ lệch ra xa pháp tuyến';
    case 'STRAIGHT_THROUGH':
      return 'Truyền thẳng không đổi hướng';
    case 'TOTAL_INTERNAL_REFLECTION':
      return 'Phản xạ toàn phần về môi trường 1';
    case 'GRAZING_REFRACTION':
      return 'Khúc xạ sát mặt phân cách (cận góc tới hạn)';
  }
}

export function deriveExpectedDirectionCategory(physics: WavePhysicsResult): WaveDirectionCategory {
  if (physics.isTotalInternalReflection) {
    return 'TOTAL_INTERNAL_REFLECTION';
  }
  if (physics.incidentAngleDeg < 0.25 || Math.abs(physics.n1 - physics.n2) < 0.002) {
    return 'STRAIGHT_THROUGH';
  }
  if (physics.refractedAngleDeg !== null && physics.refractedAngleDeg >= 82) {
    return 'GRAZING_REFRACTION';
  }
  return physics.n2 > physics.n1 ? 'TOWARD_NORMAL' : 'AWAY_FROM_NORMAL';
}

export function crossCheckAiPredictionWithSnell(prediction: AiWavePrediction): PhysicsCrossCheck {
  const exactPhysics = computeEMRefraction({
    n1: prediction.inferredN1,
    n2: prediction.inferredN2,
    incidentAngleDeg: prediction.inferredIncidentAngleDeg,
    wavelengthVacuumNm: prediction.inferredWavelengthNm,
    polarization: prediction.inferredPolarization,
  });

  const expectedCategory = deriveExpectedDirectionCategory(exactPhysics);
  const isDirectionAligned =
    prediction.directionCategory === expectedCategory ||
    (prediction.directionCategory === 'GRAZING_REFRACTION' &&
      expectedCategory === 'AWAY_FROM_NORMAL') ||
    (prediction.directionCategory === 'AWAY_FROM_NORMAL' &&
      expectedCategory === 'GRAZING_REFRACTION');

  const angleDiscrepancyDeg =
    exactPhysics.refractedAngleDeg !== null && prediction.predictedRefractedAngleDeg !== null
      ? Math.abs(exactPhysics.refractedAngleDeg - prediction.predictedRefractedAngleDeg)
      : exactPhysics.isTotalInternalReflection && prediction.predictedRefractedAngleDeg === null
        ? 0
        : null;

  return {
    exactPhysics,
    expectedCategory,
    isDirectionAligned,
    angleDiscrepancyDeg,
  };
}

export function computeTrajectorySvgGeometry(
  incidentAngleDeg: number,
  refractedAngleDeg: number | null,
  width = 360,
  height = 220
): TrajectorySvgGeometry {
  const cx = width / 2;
  const cy = height / 2;
  const rayLen = Math.min(width, height) * 0.42;

  const thetaI = (clamp(incidentAngleDeg, 0, 89.5) * Math.PI) / 180;
  const incStart = {
    x: cx - Math.sin(thetaI) * rayLen,
    y: cy - Math.cos(thetaI) * rayLen,
  };
  const refEnd = {
    x: cx + Math.sin(thetaI) * rayLen,
    y: cy - Math.cos(thetaI) * rayLen,
  };

  if (refractedAngleDeg === null) {
    return { cx, cy, incStart, refEnd, transEnd: null, isTir: true };
  }

  const thetaT = (clamp(refractedAngleDeg, 0, 89.5) * Math.PI) / 180;
  const transEnd = {
    x: cx + Math.sin(thetaT) * rayLen,
    y: cy + Math.cos(thetaT) * rayLen,
  };

  return { cx, cy, incStart, refEnd, transEnd, isTir: false };
}
