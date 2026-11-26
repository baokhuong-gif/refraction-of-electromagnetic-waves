import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEMRefraction,
  generateFresnelCurve,
  SPEED_OF_LIGHT,
  VACUUM_IMPEDANCE,
} from './emPhysics';
import { identifyWaveMedium } from './identifier';

test('Snell law computes accurate refracted angle for Air -> BK7 Glass at 45 deg', () => {
  const res = computeEMRefraction({
    n1: 1.0003,
    n2: 1.517,
    incidentAngleDeg: 45,
    wavelengthVacuumNm: 532,
    polarization: 'UNPOLARIZED',
  });

  assert.equal(res.isTotalInternalReflection, false);
  assert.ok(res.refractedAngleDeg !== null);
  // arcsin((1.0003 / 1.517) * sin(45°)) ≈ 27.791°
  assert.ok(Math.abs(res.refractedAngleDeg - 27.791) < 0.02);
  assert.equal(res.classification.code, 'REFRACTION_TO_DENSER');
});

test('Energy conservation R + T = 1 holds across TE, TM, and Unpolarized states', () => {
  const angles = [0, 15, 30, 45, 53.12, 70, 85];
  for (const angle of angles) {
    for (const pol of ['TE', 'TM', 'UNPOLARIZED'] as const) {
      const res = computeEMRefraction({
        n1: 1.0,
        n2: 1.5,
        incidentAngleDeg: angle,
        wavelengthVacuumNm: 550,
        polarization: pol,
      });
      assert.ok(Math.abs(res.reflectanceS + res.transmittanceS - 1) < 1e-12);
      assert.ok(Math.abs(res.reflectanceP + res.transmittanceP - 1) < 1e-12);
      assert.ok(Math.abs(res.reflectanceEffective + res.transmittanceEffective - 1) < 1e-12);
    }
  }
});

test('Brewster angle zeroes TM (p-polarized) reflectance and triggers BREWSTER_ANGLE classification', () => {
  const n1 = 1.0;
  const n2 = 1.333;
  const thetaB = (Math.atan(n2 / n1) * 180) / Math.PI; // ~53.123°

  const res = computeEMRefraction({
    n1,
    n2,
    incidentAngleDeg: thetaB,
    wavelengthVacuumNm: 589,
    polarization: 'TM',
  });

  assert.ok(res.reflectanceP < 1e-10, `Expected Rp ≈ 0 at Brewster angle, got ${res.reflectanceP}`);
  assert.ok(Math.abs(res.transmittanceP - 1) < 1e-10);
  assert.equal(res.classification.code, 'BREWSTER_ANGLE');
});

test('Total Internal Reflection triggers above critical angle with R = 1, T = 0, and finite evanescent depth', () => {
  const res = computeEMRefraction({
    n1: 1.517,
    n2: 1.0003,
    incidentAngleDeg: 55,
    wavelengthVacuumNm: 633,
    polarization: 'TE',
  });

  assert.equal(res.isTotalInternalReflection, true);
  assert.equal(res.refractedAngleDeg, null);
  assert.equal(res.reflectanceS, 1);
  assert.equal(res.reflectanceP, 1);
  assert.equal(res.transmittanceEffective, 0);
  assert.ok(res.criticalAngleDeg !== null && Math.abs(res.criticalAngleDeg - 41.25) < 0.05);
  assert.ok(
    res.evanescentPenetrationDepthNm !== null && res.evanescentPenetrationDepthNm > 50 && res.evanescentPenetrationDepthNm < 400
  );
  assert.equal(res.classification.code, 'TOTAL_INTERNAL_REFLECTION');
});

test('Wavelength compression, phase velocity, and intrinsic impedance obey EM wave equations', () => {
  const res = computeEMRefraction({
    n1: 1.0,
    n2: 2.0,
    incidentAngleDeg: 0,
    wavelengthVacuumNm: 600,
    polarization: 'TE',
  });

  assert.equal(res.classification.code, 'NORMAL_INCIDENCE');
  assert.ok(Math.abs(res.wavelength2Nm - 300) < 1e-9);
  assert.ok(Math.abs(res.phaseVelocity2 - SPEED_OF_LIGHT / 2) < 1e-3);
  assert.ok(Math.abs(res.impedance2Ohm - VACUUM_IMPEDANCE / 2) < 1e-6);
  // Normal incidence reflectance R = ((1-2)/(1+2))^2 = 1/9
  assert.ok(Math.abs(res.reflectanceEffective - 1 / 9) < 1e-10);
});

test('Fresnel curve generates monotonic coverage from 0 to 89.9 deg', () => {
  const curve = generateFresnelCurve(1.0, 1.5, 'UNPOLARIZED', 550, 2);
  assert.ok(curve.length >= 45);
  assert.equal(curve[0].angleDeg, 0);
  assert.equal(curve[curve.length - 1].angleDeg, 89.9);
  assert.ok(curve[curve.length - 1].Rs > 0.98);
});

test('Inverse identifier recovers BK7 glass from Snell angles and matches top material', () => {
  const result = identifyWaveMedium({
    mode: 'SNELL_ANGLES',
    knownN1: 1.0003,
    incidentAngleDeg: 45.0,
    refractedAngleDeg: 27.79,
    measuredCriticalAngleDeg: 41.2,
    measuredBrewsterAngleDeg: 56.6,
    measuredReflectancePct: 4.9,
    polarization: 'UNPOLARIZED',
    wavelengthVacuumNm: 532,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(Math.abs(result.estimatedN2 - 1.517) < 0.005);
    assert.equal(result.topCandidates[0].material.id, 'bk7');
    assert.equal(result.consistencyCheck?.status, 'MATCH');
  }
});

test('Inverse identifier detects Diamond from Brewster angle and flags reflectance anomalies', () => {
  const brewsterRes = identifyWaveMedium({
    mode: 'BREWSTER_ANGLE',
    knownN1: 1.0003,
    incidentAngleDeg: 67.52,
    refractedAngleDeg: 22.48,
    measuredCriticalAngleDeg: 24.4,
    measuredBrewsterAngleDeg: 67.52,
    measuredReflectancePct: 0.05,
    polarization: 'TM',
    wavelengthVacuumNm: 589,
  });
  assert.equal(brewsterRes.ok, true);
  if (brewsterRes.ok) {
    assert.equal(brewsterRes.topCandidates[0].material.id, 'diamond');
  }

  const anomalyRes = identifyWaveMedium({
    mode: 'SNELL_ANGLES',
    knownN1: 1.0003,
    incidentAngleDeg: 40,
    refractedAngleDeg: 28.83,
    measuredCriticalAngleDeg: 48.6,
    measuredBrewsterAngleDeg: 53.1,
    measuredReflectancePct: 22.0,
    polarization: 'UNPOLARIZED',
    wavelengthVacuumNm: 633,
  });
  assert.equal(anomalyRes.ok, true);
  if (anomalyRes.ok) {
    assert.equal(anomalyRes.consistencyCheck?.status, 'ANOMALY');
  }
});

test('Inverse identifier rejects invalid input angles without falling back silently', () => {
  const errRes = identifyWaveMedium({
    mode: 'SNELL_ANGLES',
    knownN1: 1.0,
    incidentAngleDeg: 95,
    refractedAngleDeg: 30,
    measuredCriticalAngleDeg: 45,
    measuredBrewsterAngleDeg: 55,
    measuredReflectancePct: null,
    polarization: 'UNPOLARIZED',
    wavelengthVacuumNm: 532,
  });
  assert.equal(errRes.ok, false);
  if (!errRes.ok) {
    assert.ok(Boolean(errRes.fieldErrors.incidentAngleDeg));
  }
});

test('PDF report metadata formats refracted angle, ray deviation, and TIR state accurately', async () => {
  const { buildPdfReportMetadata } = await import('../utils/pdfReport');
  const normalRes = computeEMRefraction({
    n1: 1.0,
    n2: 1.5,
    incidentAngleDeg: 30,
    wavelengthVacuumNm: 532,
    polarization: 'UNPOLARIZED',
  });
  const normalMeta = buildPdfReportMetadata(normalRes, new Date(2026, 10, 25, 10, 15));
  assert.match(normalMeta.filename, /^EMRefract-Bao-cao-Khuc-xa-20261125-1015\.pdf$/);
  assert.equal(normalMeta.incidentAngleText, '30.00°');
  assert.equal(normalMeta.refractedAngleText, '19.47°');
  assert.equal(normalMeta.deviationAngleText, '10.53°');

  const tirRes = computeEMRefraction({
    n1: 1.5,
    n2: 1.0,
    incidentAngleDeg: 60,
    wavelengthVacuumNm: 633,
    polarization: 'TE',
  });
  const tirMeta = buildPdfReportMetadata(tirRes, new Date(2026, 10, 25, 10, 15));
  assert.equal(tirMeta.refractedAngleText, 'Phản xạ toàn phần (TIR)');
});

test('Animated slider percentage calculation normalizes and clamps bounds accurately', async () => {
  const { computeSliderPercent } = await import('../components/AnimatedLabSlider');
  assert.equal(computeSliderPercent(45, 0, 90), 50);
  assert.equal(computeSliderPercent(1.0, 1.0, 3.8), 0);
  assert.equal(computeSliderPercent(3.8, 1.0, 3.8), 100);
  assert.equal(computeSliderPercent(5.0, 1.0, 3.8), 100);
  assert.equal(computeSliderPercent(-10, 0, 90), 0);
});

test('3D optical bench vectors maintain unit length and handle Snell and TIR states', async () => {
  const { computeOpticalBenchVectors3D } = await import('../three/opticalBenchGeometry');
  const thetaI = Math.PI / 4;
  const thetaT = Math.asin((1.0 / 1.5) * Math.sin(thetaI));
  const vecs = computeOpticalBenchVectors3D(thetaI, thetaT);

  assert.ok(Math.abs(Math.hypot(vecs.incDirX, vecs.incDirZ) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(vecs.refDirX, vecs.refDirZ) - 1) < 1e-12);
  assert.ok(vecs.transDirX !== null && vecs.transDirZ !== null);
  assert.ok(Math.abs(Math.hypot(vecs.transDirX, vecs.transDirZ) - 1) < 1e-12);
  assert.ok(vecs.refDirZ < 0 && vecs.transDirZ > 0);

  const tirVecs = computeOpticalBenchVectors3D(Math.PI / 3, null);
  assert.equal(tirVecs.transDirX, null);
  assert.equal(tirVecs.transDirZ, null);
});

test('Search grounding utilities sanitize unsafe URLs and parse refractive indices cleanly', async () => {
  const {
    sanitizeGroundedSources,
    extractRefractiveIndexFromText,
    stripInternalIndexTag,
  } = await import('../utils/searchUtils');

  const safe = sanitizeGroundedSources([
    { web: { uri: 'https://refractiveindex.info/?shelf=glass&book=BK7', title: 'RefractiveIndex.INFO' } },
    { web: { uri: 'javascript:alert(1)', title: 'Bad Link' } },
    { web: { uri: 'data:text/html,<script>x</script>', title: 'Data URI' } },
    { web: { uri: 'https://refractiveindex.info/?shelf=glass&book=BK7', title: 'Duplicate' } },
  ]);

  assert.equal(safe.length, 1);
  assert.equal(safe[0].title, 'RefractiveIndex.INFO');

  const sampleText = 'Kính N-BK7 có chiết suất chuẩn ở 532 nm là 1.5195.\n[N_INDEX: 1.5195]';
  assert.equal(extractRefractiveIndexFromText(sampleText), 1.5195);
  assert.equal(stripInternalIndexTag(sampleText), 'Kính N-BK7 có chiết suất chuẩn ở 532 nm là 1.5195.');
  assert.equal(extractRefractiveIndexFromText('Chiết suất n ≈ 1.768 đối với Sapphire.'), 1.768);
  assert.equal(extractRefractiveIndexFromText('Không có chỉ số hợp lệ [N_INDEX: 99.5]'), null);
});

test('AI wave prediction normalizer and Snell cross-check validate normal refraction and TIR accurately', async () => {
  const {
    normalizeAiWavePrediction,
    crossCheckAiPredictionWithSnell,
    computeTrajectorySvgGeometry,
  } = await import('../utils/aiWavePrediction');

  const normalPred = normalizeAiWavePrediction({
    scenarioSummary: 'Tia laser xanh đi từ không khí vào kính BK7 ở 45°',
    inferredN1: 1.0003,
    inferredN2: 1.517,
    inferredIncidentAngleDeg: 45,
    inferredWavelengthNm: 532,
    inferredPolarization: 'UNPOLARIZED',
    directionCategory: 'TOWARD_NORMAL',
    directionLabel: 'Khúc xạ lệch lại gần pháp tuyến',
    predictedRefractedAngleDeg: 27.79,
    predictedReflectedAngleDeg: 45,
    predictedDeviationDeg: 17.21,
    confidenceLevel: 'HIGH',
    physicalReasoning: 'Chiết suất tăng làm vận tốc pha giảm nên tia sáng bẻ gần pháp tuyến.',
    engineeringRecommendations: ['Dùng phân cực TM gần góc Brewster để tăng truyền qua.'],
  });

  const normalCheck = crossCheckAiPredictionWithSnell(normalPred);
  assert.equal(normalCheck.isDirectionAligned, true);
  assert.ok(normalCheck.angleDiscrepancyDeg !== null && normalCheck.angleDiscrepancyDeg < 0.05);

  const tirPred = normalizeAiWavePrediction({
    scenarioSummary: 'Sợi quang thạch anh ra không khí ở 48°',
    inferredN1: 1.458,
    inferredN2: 1.0003,
    inferredIncidentAngleDeg: 48,
    inferredWavelengthNm: 1550,
    inferredPolarization: 'TE',
    directionCategory: 'TOTAL_INTERNAL_REFLECTION',
    directionLabel: 'Phản xạ toàn phần về môi trường 1',
    predictedRefractedAngleDeg: null,
    predictedReflectedAngleDeg: 48,
    predictedDeviationDeg: 84,
    confidenceLevel: 'HIGH',
    physicalReasoning: 'Góc tới 48° lớn hơn góc tới hạn 43.32° nên xảy ra phản xạ toàn phần.',
    engineeringRecommendations: ['Giữ góc tới lớn hơn 44° để duy trì dẫn sóng quang.'],
  });

  const tirCheck = crossCheckAiPredictionWithSnell(tirPred);
  assert.equal(tirCheck.exactPhysics.isTotalInternalReflection, true);
  assert.equal(tirCheck.isDirectionAligned, true);
  assert.equal(tirCheck.angleDiscrepancyDeg, 0);

  const svgNormal = computeTrajectorySvgGeometry(45, 27.79, 420, 240);
  assert.equal(svgNormal.isTir, false);
  assert.ok(svgNormal.transEnd !== null && svgNormal.transEnd.y > svgNormal.cy);

  const svgTir = computeTrajectorySvgGeometry(48, null, 420, 240);
  assert.equal(svgTir.isTir, true);
  assert.equal(svgTir.transEnd, null);

  assert.throws(() => normalizeAiWavePrediction({ scenarioSummary: 'Thiếu dữ liệu số' }));
});


