import { clamp, SPEED_OF_LIGHT, VACUUM_IMPEDANCE } from '../physics/emPhysics.ts';
import { OPTICAL_MATERIALS, OpticalMaterial } from '../physics/materials.ts';

export type ComparisonCategoryFilter = 'ALL' | 'GAS_LIQUID' | 'OPTICAL' | 'RF_SEMI';

export interface ComparisonBarItem {
  material: OpticalMaterial;
  widthPct: number;
  isCurrentN1: boolean;
  isCurrentN2: boolean;
}

export interface MaterialBracketSummary {
  exactMatch: OpticalMaterial | null;
  nearest: OpticalMaterial;
  lowerNeighbor: OpticalMaterial | null;
  upperNeighbor: OpticalMaterial | null;
  deltaToNearest: number;
}

export interface RefractiveComparisonModel {
  minScale: number;
  maxScale: number;
  ticks: number[];
  items: ComparisonBarItem[];
  n1Pct: number;
  n2Pct: number;
  spanLeftPct: number;
  spanWidthPct: number;
  ratioN2ToN1: number;
  deltaN: number;
  n1Bracket: MaterialBracketSummary;
  n2Bracket: MaterialBracketSummary;
  markersAreClose: boolean;
}

const MATCH_EPSILON = 0.004;

export function filterMaterialsByGroup(
  materials: OpticalMaterial[],
  filter: ComparisonCategoryFilter
): OpticalMaterial[] {
  if (filter === 'ALL') return materials;
  if (filter === 'GAS_LIQUID') {
    return materials.filter(
      (m) => m.category === 'Khí & Chân không' || m.category === 'Chất lỏng'
    );
  }
  if (filter === 'OPTICAL') {
    return materials.filter((m) => m.category === 'Thủy tinh & Quang học');
  }
  return materials.filter((m) => m.category === 'Bán dẫn & RF');
}

export function findMaterialBracket(
  n: number,
  sortedMaterials: OpticalMaterial[]
): MaterialBracketSummary {
  let nearest = sortedMaterials[0];
  let bestDelta = Math.abs(sortedMaterials[0].refractiveIndex - n);
  let exactMatch: OpticalMaterial | null = null;
  let lowerNeighbor: OpticalMaterial | null = null;
  let upperNeighbor: OpticalMaterial | null = null;

  for (const mat of sortedMaterials) {
    const delta = Math.abs(mat.refractiveIndex - n);
    if (delta < bestDelta) {
      bestDelta = delta;
      nearest = mat;
    }
    if (delta <= MATCH_EPSILON && (!exactMatch || delta < Math.abs(exactMatch.refractiveIndex - n))) {
      exactMatch = mat;
    }
    if (mat.refractiveIndex < n - MATCH_EPSILON) {
      lowerNeighbor = mat;
    } else if (mat.refractiveIndex > n + MATCH_EPSILON && upperNeighbor === null) {
      upperNeighbor = mat;
    }
  }

  return {
    exactMatch,
    nearest,
    lowerNeighbor,
    upperNeighbor,
    deltaToNearest: bestDelta,
  };
}

export function normalizeRefractiveIndexToPct(
  n: number,
  minScale: number,
  maxScale: number
): number {
  if (maxScale <= minScale) return 0;
  return clamp(((n - minScale) / (maxScale - minScale)) * 100, 0, 100);
}

export function buildRefractiveComparisonModel(params: {
  n1: number;
  n2: number;
  material1Id: string;
  material2Id: string;
  categoryFilter?: ComparisonCategoryFilter;
}): RefractiveComparisonModel {
  const { n1, n2, material1Id, material2Id, categoryFilter = 'ALL' } = params;

  // Deduplicate vacuum vs air in the visual bar list? Keep all library entries sorted ascending
  // except skip 'vacuum' only if 'air' is present and vacuum isn't explicitly selected, so the bar
  // chart doesn't show two nearly identical 1.000 bars stacked on top of each other.
  const allSorted = [...OPTICAL_MATERIALS].sort((a, b) => a.refractiveIndex - b.refractiveIndex);
  const displayPool = allSorted.filter(
    (m) => m.id !== 'vacuum' || material1Id === 'vacuum' || material2Id === 'vacuum'
  );

  const filtered = filterMaterialsByGroup(displayPool, categoryFilter);

  const minScale = 1.0;
  const maxVal = Math.max(3.5, n1, n2);
  const maxScale = maxVal <= 3.5 ? 3.5 : Math.ceil(maxVal * 2) / 2;

  const ticks: number[] = [];
  for (let t = 1.0; t <= maxScale + 1e-6; t += 0.5) {
    ticks.push(Math.round(t * 10) / 10);
  }

  const n1Pct = normalizeRefractiveIndexToPct(n1, minScale, maxScale);
  const n2Pct = normalizeRefractiveIndexToPct(n2, minScale, maxScale);

  const items: ComparisonBarItem[] = filtered.map((material) => {
    const isCurrentN1 =
      (material1Id === material.id && Math.abs(material.refractiveIndex - n1) < 0.01) ||
      Math.abs(material.refractiveIndex - n1) <= MATCH_EPSILON;
    const isCurrentN2 =
      (material2Id === material.id && Math.abs(material.refractiveIndex - n2) < 0.01) ||
      Math.abs(material.refractiveIndex - n2) <= MATCH_EPSILON;

    return {
      material,
      widthPct: normalizeRefractiveIndexToPct(material.refractiveIndex, minScale, maxScale),
      isCurrentN1,
      isCurrentN2,
    };
  });

  const n1Bracket = findMaterialBracket(n1, allSorted);
  const n2Bracket = findMaterialBracket(n2, allSorted);

  return {
    minScale,
    maxScale,
    ticks,
    items,
    n1Pct,
    n2Pct,
    spanLeftPct: Math.min(n1Pct, n2Pct),
    spanWidthPct: Math.abs(n2Pct - n1Pct),
    ratioN2ToN1: n2 / Math.max(1e-6, n1),
    deltaN: n2 - n1,
    n1Bracket,
    n2Bracket,
    markersAreClose: Math.abs(n2Pct - n1Pct) < 13,
  };
}

export interface MaterialIndexTooltipData {
  material: OpticalMaterial;
  phaseVelocityMs: number;
  speedPercentOfC: number;
  wavelengthScalePct: number;
  impedanceOhm: number;
  normalReflectanceFromAirPct: number;
  criticalAngleToAirDeg: number | null;
  brewsterAngleFromAirDeg: number;
  deltaVsN1: number;
  deltaVsN2: number;
  dispersionNote: string | null;
}

const AIR_REF_INDEX = 1.0003;

export function buildMaterialIndexTooltipData(
  material: OpticalMaterial,
  currentN1: number,
  currentN2: number
): MaterialIndexTooltipData {
  const n = Math.max(1.0, material.refractiveIndex);
  const phaseVelocityMs = SPEED_OF_LIGHT / n;
  const speedPercentOfC = (1 / n) * 100;
  const wavelengthScalePct = speedPercentOfC;
  const impedanceOhm = VACUUM_IMPEDANCE / n;

  const r0 = (AIR_REF_INDEX - n) / (AIR_REF_INDEX + n);
  const normalReflectanceFromAirPct = r0 * r0 * 100;

  const criticalAngleToAirDeg =
    n > AIR_REF_INDEX + 0.005 ? (Math.asin(AIR_REF_INDEX / n) * 180) / Math.PI : null;
  const brewsterAngleFromAirDeg = (Math.atan(n / AIR_REF_INDEX) * 180) / Math.PI;

  let dispersionNote: string | null = null;
  if (material.abbeNumber !== undefined) {
    const level =
      material.abbeNumber >= 60
        ? 'tán sắc thấp'
        : material.abbeNumber >= 45
        ? 'tán sắc trung bình'
        : 'tán sắc mạnh';
    dispersionNote = `Abbe Vd = ${material.abbeNumber.toFixed(1)} (${level})`;
  }

  return {
    material,
    phaseVelocityMs,
    speedPercentOfC,
    wavelengthScalePct,
    impedanceOhm,
    normalReflectanceFromAirPct,
    criticalAngleToAirDeg,
    brewsterAngleFromAirDeg,
    deltaVsN1: n - currentN1,
    deltaVsN2: n - currentN2,
    dispersionNote,
  };
}

