import * as THREE from 'three';

export interface BeamVectors3D {
  /** Incident unit vector traveling from emitter toward origin (0, beamY, 0) in XZ plane */
  incDirX: number;
  incDirZ: number;
  /** Reflected unit vector traveling from origin back into Medium 1 (-Z half) */
  refDirX: number;
  refDirZ: number;
  /** Refracted unit vector traveling from origin into Medium 2 (+Z half), or null in TIR */
  transDirX: number | null;
  transDirZ: number | null;
}

/**
 * Pure 3D propagation vector helper for the horizontal optical bench (XZ plane).
 * Normal axis lies along Z: Medium 1 is z < 0, Medium 2 is z > 0, interface is z = 0.
 * Incident wave enters from quadrant (-X, -Z) toward origin (0, beamY, 0).
 */
export function computeOpticalBenchVectors3D(
  incidentAngleRad: number,
  refractedAngleRad: number | null
): BeamVectors3D {
  const sinI = Math.sin(incidentAngleRad);
  const cosI = Math.cos(incidentAngleRad);
  return {
    incDirX: sinI,
    incDirZ: cosI,
    refDirX: sinI,
    refDirZ: -cosI,
    transDirX: refractedAngleRad !== null ? Math.sin(refractedAngleRad) : null,
    transDirZ: refractedAngleRad !== null ? Math.cos(refractedAngleRad) : null,
  };
}

/**
 * Generates procedural brushed anodized optical breadboard textures (albedo + bump).
 */
export function createBreadboardTextures(maxAnisotropy: number): {
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const size = 512;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d')!;

  ctx.fillStyle = '#252f3f';
  ctx.fillRect(0, 0, size, size);

  // Subtle brushed metal grain
  for (let y = 0; y < size; y += 2) {
    const tone = 35 + ((y * 13) % 7);
    ctx.fillStyle = `rgb(${tone}, ${tone + 10}, ${tone + 24})`;
    ctx.fillRect(0, y, size, 1);
  }

  // Metric M6 optical table grid & tapped holes
  const step = 64;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  for (let x = step / 2; x < size; x += step) {
    for (let y = step / 2; y < size; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, 6.2, 0, Math.PI * 2);
      ctx.fillStyle = '#111827';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 7.2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(3, 2);
  albedo.anisotropy = maxAnisotropy;

  // Matching linear bump map
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#a0a0a0';
  bctx.fillRect(0, 0, size, size);
  for (let x = step / 2; x < size; x += step) {
    for (let y = step / 2; y < size; y += step) {
      bctx.beginPath();
      bctx.arc(x, y, 6.5, 0, Math.PI * 2);
      bctx.fillStyle = '#181818';
      bctx.fill();
    }
  }
  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(3, 2);
  bump.anisotropy = maxAnisotropy;

  return { albedo, bump };
}

/**
 * Generates a calibrated 360-degree optical goniometer dial texture.
 */
export function createGoniometerDialTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.48;

  ctx.clearRect(0, 0, size, size);

  // Subtle metallic circular plate
  const grad = ctx.createRadialGradient(cx, cy, outerR * 0.15, cx, cy, outerR);
  grad.addColorStop(0, '#f1f5f9');
  grad.addColorStop(0.75, '#e2e8f0');
  grad.addColorStop(1, '#cbd5e1');
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Concentric reference circles
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.32)';
  ctx.lineWidth = 2;
  [0.32, 0.62, 0.88, 0.97].forEach((f) => {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR * f, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Interface line (X axis) & Normal line (Z axis)
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - outerR * 0.96, cy);
  ctx.lineTo(cx + outerR * 0.96, cy);
  ctx.stroke();

  ctx.save();
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR * 0.94);
  ctx.lineTo(cx, cy + outerR * 0.94);
  ctx.stroke();
  ctx.restore();

  // Degree tick marks every 5 degrees
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const isMed = deg % 15 === 0;
    const inner = outerR * (isMajor ? 0.84 : isMed ? 0.88 : 0.91);
    const outer = outerR * 0.96;

    ctx.strokeStyle = isMajor ? '#0f172a' : '#475569';
    ctx.lineWidth = isMajor ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(rad) * inner, cy - Math.cos(rad) * inner);
    ctx.lineTo(cx + Math.sin(rad) * outer, cy - Math.cos(rad) * outer);
    ctx.stroke();
  }

  // Degree labels relative to normal (0°, 30°, 60°, 90°)
  ctx.font = '600 28px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelR = outerR * 0.76;
  const markings: Array<[number, string]> = [
    [0, '0°'],
    [30, '30°'],
    [60, '60°'],
    [90, '90°'],
    [120, '60°'],
    [150, '30°'],
    [180, '0°'],
    [210, '30°'],
    [240, '60°'],
    [270, '90°'],
    [300, '60°'],
    [330, '30°'],
  ];
  for (const [deg, text] of markings) {
    const rad = (deg * Math.PI) / 180;
    ctx.fillText(text, cx + Math.sin(rad) * labelR, cy - Math.cos(rad) * labelR);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/**
 * Generates a soft radial contact shadow texture for floor grounding.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds the composite Optical Bench Table + 4 Vibration Isolation Legs + 360° Goniometer Base (8 parts).
 * Pivoted at bottom-center flush with y = 0.
 */
export function createOpticalBenchAssembly(
  breadboardMaps: { albedo: THREE.CanvasTexture; bump: THREE.CanvasTexture },
  goniometerDialTex: THREE.CanvasTexture,
  castShadows: boolean
): { group: THREE.Group; surfaceY: number } {
  const group = new THREE.Group();
  const legHeight = 1.05;
  const slabThickness = 0.28;
  const surfaceY = legHeight + slabThickness;

  // 1. Beveled optical breadboard slab (ExtrudeGeometry)
  const w = 10.4;
  const d = 8.4;
  const r = 0.35;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2);
  shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  shape.lineTo(w / 2, d / 2 - r);
  shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  shape.lineTo(-w / 2 + r, d / 2);
  shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  shape.lineTo(-w / 2, -d / 2 + r);
  shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);

  const slabGeo = new THREE.ExtrudeGeometry(shape, {
    depth: slabThickness - 0.04,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3,
  });
  slabGeo.rotateX(Math.PI / 2);

  const slabMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: breadboardMaps.albedo,
    bumpMap: breadboardMaps.bump,
    bumpScale: 0.015,
    roughness: 0.52,
    metalness: 0.55,
  });

  const slabMesh = new THREE.Mesh(slabGeo, slabMat);
  slabMesh.position.y = surfaceY - 0.02;
  slabMesh.receiveShadow = true;
  slabMesh.castShadow = castShadows;
  group.add(slabMesh);

  // 2. Anodized brushed aluminum side bumper rails (trim contrast, roughness 0.26)
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.26,
    metalness: 0.88,
  });
  const frontRail = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, 0.08, 0.06), trimMat);
  frontRail.position.set(0, legHeight + slabThickness * 0.5, d / 2 + 0.02);
  group.add(frontRail);

  const backRail = frontRail.clone();
  backRail.position.z = -d / 2 - 0.02;
  group.add(backRail);

  // 3. Four machined pneumatic vibration-isolation legs (LatheGeometry, flush on y = 0)
  const legPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.42, 0.0),
    new THREE.Vector2(0.42, 0.08),
    new THREE.Vector2(0.32, 0.14),
    new THREE.Vector2(0.28, 0.26),
    new THREE.Vector2(0.26, 0.72),
    new THREE.Vector2(0.34, 0.82),
    new THREE.Vector2(0.34, legHeight),
    new THREE.Vector2(0.0, legHeight),
  ];
  const legGeo = new THREE.LatheGeometry(legPoints, 24);
  const legMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.9,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.85,
    metalness: 0.05,
  });

  const legOffsets: Array<[number, number]> = [
    [-w / 2 + 0.95, -d / 2 + 0.95],
    [w / 2 - 0.95, -d / 2 + 0.95],
    [-w / 2 + 0.95, d / 2 - 0.95],
    [w / 2 - 0.95, d / 2 - 0.95],
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, 0, lz);
    leg.castShadow = castShadows;
    leg.receiveShadow = true;
    group.add(leg);

    const damperRing = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.07, 24), rubberMat);
    damperRing.position.set(lx, 0.77, lz);
    group.add(damperRing);
  }

  // 4. Precision Brass Bezel Ring around the 360° Goniometer
  const bezelProfile = [
    new THREE.Vector2(3.15, 0.0),
    new THREE.Vector2(3.36, 0.0),
    new THREE.Vector2(3.36, 0.09),
    new THREE.Vector2(3.26, 0.13),
    new THREE.Vector2(3.15, 0.11),
  ];
  const bezelGeo = new THREE.LatheGeometry(bezelProfile, 64);
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a34a,
    roughness: 0.26,
    metalness: 0.9,
  });
  const bezelMesh = new THREE.Mesh(bezelGeo, brassMat);
  bezelMesh.position.y = surfaceY + 0.01;
  bezelMesh.castShadow = castShadows;
  bezelMesh.receiveShadow = true;
  group.add(bezelMesh);

  // 5. Calibrated Goniometer Dial Disc (offset >= 0.025 above table to avoid Z-fighting)
  const dialGeo = new THREE.CylinderGeometry(3.16, 3.16, 0.05, 64);
  const dialMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: goniometerDialTex,
    roughness: 0.38,
    metalness: 0.18,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const dialMesh = new THREE.Mesh(dialGeo, dialMat);
  dialMesh.position.y = surfaceY + 0.035;
  dialMesh.receiveShadow = true;
  group.add(dialMesh);

  // 6. Central Brass Pivot Post at optical origin (0, surfaceY, 0)
  const centerPin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.09, 24), brassMat);
  centerPin.position.y = surfaceY + 0.09;
  group.add(centerPin);

  return { group, surfaceY: surfaceY + 0.06 };
}

/**
 * Builds the composite 8-part Articulated EM / Laser Emitter Assembly.
 * Positioned along local -Z facing +Z toward the optical center.
 */
export function createLaserEmitterAssembly(castShadows: boolean): {
  pivotGroup: THREE.Group;
  indicatorRingMat: THREE.MeshStandardMaterial;
} {
  const pivotGroup = new THREE.Group();
  const emitterBody = new THREE.Group();
  // Place emitter along negative Z axis (at radius 3.05) pointing toward (0,0,0)
  emitterBody.position.set(0, 0, -3.05);
  pivotGroup.add(emitterBody);

  const matteHousingMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.72,
    metalness: 0.25,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.16,
    metalness: 0.94,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a34a,
    roughness: 0.28,
    metalness: 0.88,
  });
  const indicatorRingMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x22c55e,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.1,
  });

  // Part 1: Curved Track Carriage Base
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.84), matteHousingMat);
  carriage.position.set(0, 0.07, -0.05);
  carriage.castShadow = castShadows;
  emitterBody.add(carriage);

  // Part 2: Vertical Precision Post
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.56, 20), chromeMat);
  post.position.set(0, 0.4, -0.1);
  post.castShadow = castShadows;
  emitterBody.add(post);

  // Part 3: Brass Micrometer Locking Collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 24), brassMat);
  collar.position.set(0, 0.34, -0.1);
  emitterBody.add(collar);

  // Part 4: Main Optical Tube Housing (oriented along Z)
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.92, 28), matteHousingMat);
  housing.rotation.x = Math.PI / 2;
  housing.position.set(0, 0.72, -0.1);
  housing.castShadow = castShadows;
  emitterBody.add(housing);

  // Part 5: 3 Machined Heat-Sink Cooling Fins
  for (let i = -1; i <= 1; i++) {
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 28), chromeMat);
    fin.rotation.x = Math.PI / 2;
    fin.position.set(0, 0.72, -0.25 + i * 0.14);
    emitterBody.add(fin);
  }

  // Part 6: Front Tapered Chrome Aperture Nozzle (LatheGeometry)
  const nozzlePts = [
    new THREE.Vector2(0.08, 0.0),
    new THREE.Vector2(0.21, 0.0),
    new THREE.Vector2(0.18, 0.18),
    new THREE.Vector2(0.13, 0.32),
    new THREE.Vector2(0.07, 0.32),
  ];
  const nozzleGeo = new THREE.LatheGeometry(nozzlePts, 24);
  nozzleGeo.rotateX(Math.PI / 2);
  const nozzle = new THREE.Mesh(nozzleGeo, chromeMat);
  nozzle.position.set(0, 0.72, 0.35);
  nozzle.castShadow = castShadows;
  emitterBody.add(nozzle);

  // Part 7: Emissive Wavelength Indicator Ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.022, 12, 28), indicatorRingMat);
  ring.position.set(0, 0.72, 0.52);
  emitterBody.add(ring);

  // Part 8: Rear Knurled Power/Vernier Knob
  const rearKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 16), brassMat);
  rearKnob.rotation.x = Math.PI / 2;
  rearKnob.position.set(0, 0.72, -0.62);
  emitterBody.add(rearKnob);

  return { pivotGroup, indicatorRingMat };
}

/**
 * Builds the composite 6-part Dielectric Medium 2 Optical Slab + Retention Cradle.
 * Front flat entry face sits precisely at z = 0 (interface plane).
 */
export function createDielectricBlockAssembly(
  isSoftwareGl: boolean,
  castShadows: boolean
): {
  group: THREE.Group;
  glassMaterial: THREE.MeshPhysicalMaterial;
  medium1AuraMaterial: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();

  // Semicircular D-shaped optical dielectric prism block (flat face at z = 0, radius 2.25 into +Z)
  const radius = 2.25;
  const blockHeight = 1.24;
  const dShape = new THREE.Shape();
  dShape.moveTo(-radius, 0);
  dShape.lineTo(radius, 0);
  dShape.absarc(0, 0, radius, 0, Math.PI, false);
  dShape.closePath();

  const prismGeo = new THREE.ExtrudeGeometry(dShape, {
    depth: blockHeight - 0.06,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 3,
    curveSegments: 48,
  });
  // Orient flat face along z = 0 extending into +Z, vertical along +Y
  prismGeo.rotateX(Math.PI / 2);

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#bae6fd'),
    roughness: 0.06,
    metalness: 0.0,
    transmission: isSoftwareGl ? 0 : 0.84,
    transparent: true,
    opacity: isSoftwareGl ? 0.34 : 0.92,
    ior: 1.52,
    thickness: 1.8,
    attenuationColor: new THREE.Color('#38bdf8'),
    attenuationDistance: 4.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    depthWrite: false,
  });

  const prismMesh = new THREE.Mesh(prismGeo, glassMaterial);
  prismMesh.position.y = blockHeight + 0.06;
  prismMesh.renderOrder = 5;
  group.add(prismMesh);

  // Subtle crisp wireframe rim around the optical block for crystal-clear refraction edge reading
  const edgesGeo = new THREE.EdgesGeometry(prismGeo, 28);
  const edgesMat = new THREE.LineBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.38,
  });
  const edgesLine = new THREE.LineSegments(edgesGeo, edgesMat);
  edgesLine.position.copy(prismMesh.position);
  group.add(edgesLine);

  // Machined Titanium Retention Base Cradle beneath the semicircular prism
  const cradleMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.58,
    metalness: 0.65,
  });
  const cradleGeo = new THREE.ExtrudeGeometry(dShape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 48,
  });
  cradleGeo.rotateX(Math.PI / 2);
  const cradleMesh = new THREE.Mesh(cradleGeo, cradleMat);
  cradleMesh.position.y = 0.095;
  cradleMesh.castShadow = castShadows;
  cradleMesh.receiveShadow = true;
  group.add(cradleMesh);

  // Two Brass Clamping Posts on outer perimeter of the prism
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a34a,
    roughness: 0.26,
    metalness: 0.9,
  });
  [-radius + 0.08, radius - 0.08].forEach((xPos) => {
    const clampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.32, 16), brassMat);
    clampPost.position.set(xPos, 0.19, 0.14);
    clampPost.castShadow = castShadows;
    group.add(clampPost);
  });

  // Subtle Medium 1 Dielectric Indicator Arc (visible when n1 > 1.05, e.g., Glass -> Air TIR!)
  const m1Shape = new THREE.Shape();
  m1Shape.moveTo(-radius, 0);
  m1Shape.lineTo(radius, 0);
  m1Shape.absarc(0, 0, radius, 0, -Math.PI, true);
  m1Shape.closePath();

  const m1Geo = new THREE.ExtrudeGeometry(m1Shape, {
    depth: blockHeight - 0.08,
    bevelEnabled: false,
    curveSegments: 40,
  });
  m1Geo.rotateX(Math.PI / 2);

  const medium1AuraMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7dd3fc'),
    roughness: 0.15,
    metalness: 0.0,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const m1Mesh = new THREE.Mesh(m1Geo, medium1AuraMaterial);
  m1Mesh.position.y = blockHeight + 0.04;
  m1Mesh.renderOrder = 4;
  group.add(m1Mesh);

  return { group, glassMaterial, medium1AuraMaterial };
}

/**
 * Builds the composite 5-part Reflected Beam Photodetector Receiver Arm.
 */
export function createPhotodetectorAssembly(castShadows: boolean): {
  pivotGroup: THREE.Group;
  sensorGlowMat: THREE.MeshStandardMaterial;
} {
  const pivotGroup = new THREE.Group();
  const arm = new THREE.Group();
  arm.position.set(0, 0, -2.95);
  pivotGroup.add(arm);

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.68,
    metalness: 0.3,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.24,
    metalness: 0.88,
  });
  const sensorGlowMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    emissive: 0xe11d48,
    emissiveIntensity: 0.5,
    roughness: 0.2,
    metalness: 0.1,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.56), darkMat);
  base.position.set(0, 0.06, 0);
  base.castShadow = castShadows;
  arm.add(base);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.58, 16), steelMat);
  stem.position.set(0, 0.38, 0);
  arm.add(stem);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.34, 24), darkMat);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.72, 0);
  head.castShadow = castShadows;
  arm.add(head);

  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 24, 1, true), steelMat);
  hood.rotation.x = Math.PI / 2;
  hood.position.set(0, 0.72, 0.22);
  arm.add(hood);

  const sensorFace = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), sensorGlowMat);
  sensorFace.position.set(0, 0.72, 0.18);
  arm.add(sensorFace);

  return { pivotGroup, sensorGlowMat };
}
