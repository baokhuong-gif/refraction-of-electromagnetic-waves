import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Eye,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  clamp,
  formatWavelength,
  WavePhysicsResult,
  wavelengthToColor,
} from '../physics/emPhysics';
import { PolarizationMode, PRESET_SCENARIOS, PresetScenario } from '../physics/materials';
import {
  computeOpticalBenchVectors3D,
  createBreadboardTextures,
  createContactShadowTexture,
  createDielectricBlockAssembly,
  createGoniometerDialTexture,
  createLaserEmitterAssembly,
  createOpticalBenchAssembly,
  createPhotodetectorAssembly,
} from '../three/opticalBenchGeometry';

interface WaveScene3DProps {
  physics: WavePhysicsResult;
  polarization: PolarizationMode;
  wavelengthVacuumNm: number;
  material1Label: string;
  material2Label: string;
  onChangeIncidentAngle: (deg: number) => void;
  onChangeN1: (n1: number) => void;
  onChangeN2: (n2: number) => void;
  onSelectScenario: (scenario: PresetScenario) => void;
}

type CameraPresetId = 'ISO' | 'TOP' | 'INTERFACE' | 'EFIELD';

interface CameraPresetConfig {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: CameraPresetConfig[] = [
  { id: 'ISO', label: 'Tổng quan', position: [-6.0, 6.4, 8.8], target: [0, 1.35, 0.45] },
  { id: 'TOP', label: 'Từ trên xuống', position: [0.0, 11.4, 0.05], target: [0, 1.4, 0.0] },
  { id: 'INTERFACE', label: 'Mặt phân cách', position: [-6.2, 3.0, 0.5], target: [0, 1.75, 0.15] },
  { id: 'EFIELD', label: 'Cận cảnh', position: [4.6, 3.9, -5.0], target: [0, 1.9, -0.2] },
];

const WAVE_SEGMENTS = 96;
const PHOTON_COUNT_PER_BEAM = 12;
const TOTAL_PHOTONS = PHOTON_COUNT_PER_BEAM * 3;
const BEAM_RADIUS_LEN = 2.68;

// Pre-allocated module-scope scratch objects for zero-GC render loop
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _upVec = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function updateCylinderBeamTransform(
  mesh: THREE.Mesh,
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  radiusScale: number
) {
  _dirVec.set(endX - startX, endY - startY, endZ - startZ);
  const len = _dirVec.length();
  if (len < 0.001) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.position.set((startX + endX) * 0.5, (startY + endY) * 0.5, (startZ + endZ) * 0.5);
  _dirVec.divideScalar(len);
  mesh.quaternion.setFromUnitVectors(_upVec, _dirVec);
  mesh.scale.set(radiusScale, len, radiusScale);
}

function writeWaveLineVertices(
  attr: THREE.BufferAttribute,
  startX: number,
  startY: number,
  startZ: number,
  dirX: number,
  dirZ: number,
  length: number,
  wavelengthUnits: number,
  phase: number,
  amplitude: number,
  oscillateVertical: boolean,
  evanescentDecay = 0
) {
  // Perpendicular vector in XZ plane for TM polarization
  const perpX = -dirZ;
  const perpZ = dirX;
  const k = (Math.PI * 2) / Math.max(0.28, wavelengthUnits);

  for (let i = 0; i <= WAVE_SEGMENTS; i++) {
    const t = i / WAVE_SEGMENTS;
    const s = t * length;
    const envelope = evanescentDecay > 0 ? Math.exp(-s * evanescentDecay) : 1;
    const wave = Math.sin(k * s - phase) * amplitude * envelope;

    const px = startX + dirX * s + (oscillateVertical ? 0 : perpX * wave);
    const py = startY + (oscillateVertical ? wave : 0);
    const pz = startZ + dirZ * s + (oscillateVertical ? 0 : perpZ * wave);

    attr.setXYZ(i, px, py, pz);
  }
  attr.needsUpdate = true;
}

export const WaveScene3D: React.FC<WaveScene3DProps> = ({
  physics,
  polarization,
  wavelengthVacuumNm,
  material1Label,
  material2Label,
  onChangeIncidentAngle,
  onChangeN1,
  onChangeN2,
  onSelectScenario,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showEField, setShowEField] = useState(true);
  const [dockExpanded, setDockExpanded] = useState(true);
  const [activeCamPreset, setActiveCamPreset] = useState<CameraPresetId>('ISO');

  // Mutable state refs so React updates never tear down the Three.js WebGL context
  const physicsRef = useRef(physics);
  const polarizationRef = useRef(polarization);
  const wavelengthRef = useRef(wavelengthVacuumNm);
  const isPlayingRef = useRef(isPlaying);
  const showEFieldRef = useRef(showEField);
  const cameraTransitionRef = useRef<{
    active: boolean;
    pos: [number, number, number];
    target: [number, number, number];
  }>({
    active: false,
    pos: CAMERA_PRESETS[0].position,
    target: CAMERA_PRESETS[0].target,
  });

  physicsRef.current = physics;
  polarizationRef.current = polarization;
  wavelengthRef.current = wavelengthVacuumNm;
  isPlayingRef.current = isPlaying;
  showEFieldRef.current = showEField;

  const triggerCameraPreset = (preset: CameraPresetConfig) => {
    setActiveCamPreset(preset.id);
    cameraTransitionRef.current = {
      active: true,
      pos: preset.position,
      target: preset.target,
    };
  };

  // Keyboard shortcut H to collapse/expand bottom HUD
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockExpanded((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Mount Three.js WebGLRenderer & Studio Optical Bench once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(320, container.clientWidth);
    const height = Math.max(360, container.clientHeight);

    const scene = new THREE.Scene();
    const bgHex = 0xeef2f6;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.Fog(bgHex, 18, 42);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(...CAMERA_PRESETS[0].position);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio IBL environment map via RoomEnvironment on EVERY device
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Warm/cool studio lighting rig (1 shadow-casting directional key + Hemisphere fill + cool rim)
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.85);
    hemiLight.position.set(0, 16, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.0);
    keyLight.position.set(7.5, 11.5, 6.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 28;
    keyLight.shadow.camera.left = -7.5;
    keyLight.shadow.camera.right = 7.5;
    keyLight.shadow.camera.top = 7.5;
    keyLight.shadow.camera.bottom = -7.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.75);
    rimLight.position.set(-8, 6, -7);
    scene.add(rimLight);

    // Studio lab floor & radial contact shadow (grounded at y = 0)
    const floorGeo = new THREE.PlaneGeometry(70, 70);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.88,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const contactShadowTex = createContactShadowTexture();
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const contactShadowMesh = new THREE.Mesh(new THREE.CircleGeometry(6.8, 48), contactShadowMat);
    contactShadowMesh.rotation.x = -Math.PI / 2;
    contactShadowMesh.position.y = 0.015;
    scene.add(contactShadowMesh);

    // Procedural Textures & Composite 3-12 Part Hardware Assemblies
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const breadboardMaps = createBreadboardTextures(maxAniso);
    const goniometerDialTex = createGoniometerDialTexture(maxAniso);

    const { group: benchGroup, surfaceY } = createOpticalBenchAssembly(
      breadboardMaps,
      goniometerDialTex,
      !isSoftwareGl
    );
    scene.add(benchGroup);

    const beamY = surfaceY + 0.72;

    const { pivotGroup: emitterPivot, indicatorRingMat } = createLaserEmitterAssembly(
      !isSoftwareGl
    );
    emitterPivot.position.y = surfaceY;
    scene.add(emitterPivot);

    const { pivotGroup: detectorPivot, sensorGlowMat } = createPhotodetectorAssembly(
      !isSoftwareGl
    );
    detectorPivot.position.y = surfaceY;
    scene.add(detectorPivot);

    const { group: dielectricGroup, glassMaterial, medium1AuraMaterial } =
      createDielectricBlockAssembly(isSoftwareGl, !isSoftwareGl);
    dielectricGroup.position.y = surfaceY;
    scene.add(dielectricGroup);

    // Dynamic 3D EM Laser Beams (shared unit CylinderGeometry scaled in place)
    const unitBeamGeo = new THREE.CylinderGeometry(0.032, 0.032, 1, 14);
    const incBeamMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 1.3,
      roughness: 0.2,
      transparent: true,
      opacity: 0.92,
    });
    const refBeamMat = new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      emissive: 0xe11d48,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      transparent: true,
      opacity: 0.55,
    });
    const transBeamMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      emissive: 0x059669,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      transparent: true,
      opacity: 0.88,
    });

    const incBeamMesh = new THREE.Mesh(unitBeamGeo, incBeamMat);
    const refBeamMesh = new THREE.Mesh(unitBeamGeo, refBeamMat);
    const transBeamMesh = new THREE.Mesh(unitBeamGeo, transBeamMat);
    scene.add(incBeamMesh, refBeamMesh, transBeamMesh);

    // Optical interface glowing incidence spot
    const hitSpotMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x38bdf8,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    });
    const hitSpotMesh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 16), hitSpotMat);
    hitSpotMesh.position.set(0, beamY, 0);
    scene.add(hitSpotMesh);

    // Dynamic 3D E-field Sinusoidal Wave Ribbons (pre-allocated Float32Arrays — zero GC!)
    const createWaveLine = (colorHex: number) => {
      const positions = new Float32Array((WAVE_SEGMENTS + 1) * 3);
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(positions, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      const mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.92,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      scene.add(line);
      return { line, attr, mat, geo };
    };

    const incWaveTE = createWaveLine(0x16a34a);
    const incWaveTM = createWaveLine(0x0284c7);
    const refWave = createWaveLine(0xe11d48);
    const transWave = createWaveLine(0x059669);
    const evanescentWave = createWaveLine(0xd97706);

    // Instanced Photonic Wavefront Nodes along all 3 rays (InstancedMesh, frustumCulled = false)
    const photonGeo = new THREE.SphereGeometry(0.055, 10, 10);
    const photonMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.1,
    });
    const photonMesh = new THREE.InstancedMesh(photonGeo, photonMat, TOTAL_PHOTONS);
    photonMesh.frustumCulled = false;
    scene.add(photonMesh);

    // OrbitControls with exponential damping (disabled on software WebGL per threejs skill)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS[0].target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 4.2;
    controls.maxDistance = 17.5;
    controls.update();

    controls.addEventListener('start', () => {
      cameraTransitionRef.current.active = false;
    });

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // ResizeObserver for crisp container fitting
    const handleResize = () => {
      const nextW = Math.max(320, container.clientWidth);
      const nextH = Math.max(360, container.clientHeight);
      camera.aspect = nextW / nextH;
      camera.updateProjectionMatrix();
      renderer.setSize(nextW, nextH);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Smooth damped mechanical state
    let dampedThetaI = physicsRef.current.incidentAngleRad;
    let phase = 0;
    let lastTime = performance.now();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.06, (now - lastTime) / 1000);
      lastTime = now;

      const p = physicsRef.current;
      const pol = polarizationRef.current;
      const waveHex = wavelengthToColor(wavelengthRef.current);

      if (isPlayingRef.current) {
        phase = (phase + dt * 5.2) % (Math.PI * 200);
      }

      // Smooth camera preset damping
      if (cameraTransitionRef.current.active) {
        const [gx, gy, gz] = cameraTransitionRef.current.pos;
        const [tx, ty, tz] = cameraTransitionRef.current.target;
        _camGoalPos.set(gx, gy, gz);
        _camGoalTarget.set(tx, ty, tz);

        const k = isSoftwareGl ? 18 : 6.5;
        const alpha = 1 - Math.exp(-k * dt);
        camera.position.lerp(_camGoalPos, alpha);
        controls.target.lerp(_camGoalTarget, alpha);

        if (
          camera.position.distanceToSquared(_camGoalPos) < 0.002 &&
          controls.target.distanceToSquared(_camGoalTarget) < 0.002
        ) {
          camera.position.copy(_camGoalPos);
          controls.target.copy(_camGoalTarget);
          cameraTransitionRef.current.active = false;
        }
      }

      // Smooth mechanical emitter & photodetector goniometer swing
      dampedThetaI = THREE.MathUtils.damp(
        dampedThetaI,
        p.incidentAngleRad,
        isSoftwareGl ? 24 : 11,
        dt
      );
      emitterPivot.rotation.y = dampedThetaI;
      detectorPivot.rotation.y = -dampedThetaI;

      // Update optical material visual properties based on refractive indices n1, n2
      glassMaterial.ior = clamp(p.n2, 1.0, 2.33);
      const n2Tint = clamp((p.n2 - 1.0) / 2.4, 0, 1);
      glassMaterial.color.setRGB(
        0.85 - n2Tint * 0.42,
        0.95 - n2Tint * 0.24,
        1.0 - n2Tint * 0.06
      );
      glassMaterial.opacity = isSoftwareGl ? clamp(0.18 + n2Tint * 0.36, 0.14, 0.56) : 0.92;

      const m1Opacity = p.n1 > 1.05 ? clamp((p.n1 - 1.0) * 0.18, 0.08, 0.34) : 0;
      medium1AuraMaterial.opacity = m1Opacity;

      // Update beam & emitter colors
      _color.set(waveHex);
      indicatorRingMat.color.copy(_color);
      indicatorRingMat.emissive.copy(_color);
      incBeamMat.color.copy(_color);
      incBeamMat.emissive.copy(_color);
      hitSpotMat.emissive.copy(_color);

      const vecs = computeOpticalBenchVectors3D(dampedThetaI, p.refractedAngleRad);
      const startX = -vecs.incDirX * BEAM_RADIUS_LEN;
      const startZ = -vecs.incDirZ * BEAM_RADIUS_LEN;

      // Incident beam from emitter nozzle to origin (0, beamY, 0)
      updateCylinderBeamTransform(incBeamMesh, startX, beamY, startZ, 0, beamY, 0, 1.0);

      // Reflected beam from origin toward detector
      const refStrength = Math.sqrt(clamp(p.reflectanceEffective, 0, 1));
      refBeamMat.opacity = clamp(0.18 + refStrength * 0.82, 0.18, 0.96);
      sensorGlowMat.emissiveIntensity = 0.3 + refStrength * 2.1;
      updateCylinderBeamTransform(
        refBeamMesh,
        0,
        beamY,
        0,
        vecs.refDirX * BEAM_RADIUS_LEN,
        beamY,
        vecs.refDirZ * BEAM_RADIUS_LEN,
        clamp(0.45 + refStrength * 0.6, 0.45, 1.05)
      );

      // Refracted beam into dielectric block (hidden in TIR)
      const transStrength = Math.sqrt(clamp(p.transmittanceEffective, 0, 1));
      if (!p.isTotalInternalReflection && vecs.transDirX !== null && vecs.transDirZ !== null) {
        transBeamMat.opacity = clamp(0.2 + transStrength * 0.8, 0.2, 0.96);
        updateCylinderBeamTransform(
          transBeamMesh,
          0,
          beamY,
          0,
          vecs.transDirX * 2.22,
          beamY,
          vecs.transDirZ * 2.22,
          clamp(0.45 + transStrength * 0.6, 0.45, 1.05)
        );
      } else {
        transBeamMesh.visible = false;
      }

      // 3D E-field wave ribbons showing TE vs TM polarization and wavelength compression
      const showWaves = showEFieldRef.current;
      const lambda1Units = clamp(0.85 / p.n1, 0.28, 1.05);
      const lambda2Units = clamp(0.85 / p.n2, 0.22, 1.05);

      incWaveTE.line.visible = showWaves && (pol === 'TE' || pol === 'UNPOLARIZED');
      incWaveTM.line.visible = showWaves && (pol === 'TM' || pol === 'UNPOLARIZED');
      incWaveTE.mat.color.copy(_color);

      if (incWaveTE.line.visible) {
        writeWaveLineVertices(
          incWaveTE.attr,
          startX,
          beamY,
          startZ,
          vecs.incDirX,
          vecs.incDirZ,
          BEAM_RADIUS_LEN,
          lambda1Units,
          phase,
          0.26,
          true
        );
      }
      if (incWaveTM.line.visible) {
        writeWaveLineVertices(
          incWaveTM.attr,
          startX,
          beamY,
          startZ,
          vecs.incDirX,
          vecs.incDirZ,
          BEAM_RADIUS_LEN,
          lambda1Units,
          phase,
          0.24,
          false
        );
      }

      refWave.line.visible = showWaves && refStrength > 0.08;
      if (refWave.line.visible) {
        const phaseShiftRad =
          pol === 'TM'
            ? (p.phaseShiftPDeg * Math.PI) / 180
            : (p.phaseShiftSDeg * Math.PI) / 180;
        writeWaveLineVertices(
          refWave.attr,
          0,
          beamY,
          0,
          vecs.refDirX,
          vecs.refDirZ,
          BEAM_RADIUS_LEN,
          lambda1Units,
          phase - phaseShiftRad,
          0.24 * clamp(refStrength, 0.25, 1),
          pol !== 'TM'
        );
      }

      transWave.line.visible =
        showWaves &&
        !p.isTotalInternalReflection &&
        vecs.transDirX !== null &&
        vecs.transDirZ !== null;
      if (transWave.line.visible && vecs.transDirX !== null && vecs.transDirZ !== null) {
        writeWaveLineVertices(
          transWave.attr,
          0,
          beamY,
          0,
          vecs.transDirX,
          vecs.transDirZ,
          2.18,
          lambda2Units,
          phase,
          0.26 * clamp(transStrength, 0.25, 1),
          pol !== 'TM'
        );
      }

      // 3D Evanescent Surface Wave decaying along +X/+Z boundary in TIR
      evanescentWave.line.visible = showWaves && p.isTotalInternalReflection;
      if (evanescentWave.line.visible) {
        writeWaveLineVertices(
          evanescentWave.attr,
          0,
          beamY,
          0.16,
          1,
          0.12,
          2.05,
          lambda1Units * 0.8,
          phase,
          0.3,
          true,
          1.35
        );
      }

      // Update Instanced Photonic Wavefront Nodes along incident, reflected, refracted rays
      const v1Speed = 1 / p.n1;
      const v2Speed = 1 / p.n2;
      _quat.identity();
      let idx = 0;

      // 1. Incident wavefront nodes
      _color.set(waveHex);
      for (let i = 0; i < PHOTON_COUNT_PER_BEAM; i++) {
        const frac = (i / PHOTON_COUNT_PER_BEAM + (phase * 0.055 * v1Speed)) % 1;
        const dist = frac * BEAM_RADIUS_LEN;
        _pos.set(startX + vecs.incDirX * dist, beamY, startZ + vecs.incDirZ * dist);
        _scale.set(1, 1, 1);
        _mat4.compose(_pos, _quat, _scale);
        photonMesh.setMatrixAt(idx, _mat4);
        photonMesh.setColorAt(idx, _color);
        idx++;
      }

      // 2. Reflected wavefront nodes
      _color.setHex(0xe11d48);
      for (let i = 0; i < PHOTON_COUNT_PER_BEAM; i++) {
        const frac = (i / PHOTON_COUNT_PER_BEAM + (phase * 0.055 * v1Speed)) % 1;
        const dist = frac * BEAM_RADIUS_LEN;
        const s = refStrength > 0.08 ? clamp(0.45 + refStrength * 0.65, 0.45, 1.05) : 0.0001;
        _pos.set(vecs.refDirX * dist, beamY, vecs.refDirZ * dist);
        _scale.set(s, s, s);
        _mat4.compose(_pos, _quat, _scale);
        photonMesh.setMatrixAt(idx, _mat4);
        photonMesh.setColorAt(idx, _color);
        idx++;
      }

      // 3. Refracted (or evanescent) wavefront nodes
      _color.setHex(p.isTotalInternalReflection ? 0xd97706 : 0x059669);
      for (let i = 0; i < PHOTON_COUNT_PER_BEAM; i++) {
        const frac = (i / PHOTON_COUNT_PER_BEAM + (phase * 0.055 * v2Speed)) % 1;
        if (!p.isTotalInternalReflection && vecs.transDirX !== null && vecs.transDirZ !== null) {
          const dist = frac * 2.15;
          const s = clamp(0.45 + transStrength * 0.65, 0.45, 1.05);
          _pos.set(vecs.transDirX * dist, beamY, vecs.transDirZ * dist);
          _scale.set(s, s, s);
        } else {
          // Evanescent surface decay dots hugging the interface
          const dist = frac * 1.65;
          const s = clamp(Math.exp(-dist * 1.4), 0.12, 0.9);
          _pos.set(dist, beamY, 0.16);
          _scale.set(s, s, s);
        }
        _mat4.compose(_pos, _quat, _scale);
        photonMesh.setMatrixAt(idx, _mat4);
        photonMesh.setColorAt(idx, _color);
        idx++;
      }

      photonMesh.instanceMatrix.needsUpdate = true;
      if (photonMesh.instanceColor) photonMesh.instanceColor.needsUpdate = true;

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      breadboardMaps.albedo.dispose();
      breadboardMaps.bump.dispose();
      goniometerDialTex.dispose();
      contactShadowTex.dispose();
      envTarget.dispose();
      unitBeamGeo.dispose();
      photonGeo.dispose();
      incWaveTE.geo.dispose();
      incWaveTM.geo.dispose();
      refWave.geo.dispose();
      transWave.geo.dispose();
      evanescentWave.geo.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, []);

  return (
    <section
      aria-label="Phòng thí nghiệm khúc xạ sóng điện từ 3D"
      className="relative w-full h-[calc(100vh-3.5rem)] min-h-[560px] overflow-hidden bg-[#eef2f6] select-none"
      data-testid="wave-scene-3d"
      data-regime={physics.classification.code}
    >
      {/* Dedicated WebGL mount container outside sibling React HUD overlays */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* Minimal Top-Left Optical Telemetry Readout (solid/rgba surface, NO backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-w-xs sm:max-w-sm rounded-xl border border-slate-300/90 bg-[rgba(255,255,255,0.93)] px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-900">Bàn quang học 3D</span>
          <span className="font-mono text-[11px] font-semibold text-sky-800">
            {physics.classification.shortTag}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-slate-600 truncate">
          {material1Label} (n₁={physics.n1.toFixed(3)}) → {material2Label} (n₂={physics.n2.toFixed(3)})
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 border-t border-slate-200 pt-2 font-mono text-[11px] tabular-nums">
          <div>
            <div className="text-slate-400 text-[10px]">θi</div>
            <div className="font-semibold text-slate-900">{physics.incidentAngleDeg.toFixed(1)}°</div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px]">θt</div>
            <div className="font-semibold text-emerald-700">
              {physics.refractedAngleDeg !== null ? `${physics.refractedAngleDeg.toFixed(1)}°` : 'TIR'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px]">R / T</div>
            <div className="font-semibold text-rose-700">
              {(physics.reflectanceEffective * 100).toFixed(0)}/
              {(physics.transmittanceEffective * 100).toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px]">λ₂</div>
            <div className="font-semibold text-slate-800">{formatWavelength(physics.wavelength2Nm)}</div>
          </div>
        </div>
      </div>

      {/* Collapsible Unified Bottom Control Dock (Zero Mid-Screen Occlusion, NO backdrop-filter) */}
      <div className="absolute bottom-2.5 sm:bottom-4 left-1/2 -translate-x-1/2 z-10 w-[min(920px,94vw)] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockExpanded((v) => !v)}
          aria-expanded={dockExpanded}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-slate-700 bg-[rgba(255,255,255,0.95)] border border-slate-300 border-b-0 rounded-t-lg hover:bg-slate-50 transition-colors cursor-pointer"
        >
          {dockExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          {dockExpanded ? 'Ẩn bảng điều khiển (H)' : 'Hiện bảng điều khiển (H)'}
        </button>

        {dockExpanded && (
          <div className="w-full rounded-xl border border-slate-300 bg-[rgba(255,255,255,0.96)] p-2.5 sm:p-3.5 shadow-md space-y-2 sm:space-y-3 max-h-[48vh] overflow-y-auto">
            {/* Row 1: Camera Presets + Playback + Scenarios */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsPlaying((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Tạm dừng' : 'Phát sóng'}
                </button>

                <button
                  type="button"
                  aria-pressed={showEField}
                  onClick={() => setShowEField((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border cursor-pointer whitespace-nowrap ${
                    showEField
                      ? 'bg-sky-50 border-sky-200 text-sky-900'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Trường E 3D
                </button>

                <div
                  role="group"
                  aria-label="Góc nhìn camera 3D"
                  className="flex flex-wrap items-center gap-1 sm:pl-1.5 sm:border-l sm:border-slate-200"
                >
                  <Camera className="w-3.5 h-3.5 text-slate-400 hidden sm:block mr-0.5" />
                  {CAMERA_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={activeCamPreset === preset.id}
                      onClick={() => triggerCameraPreset(preset)}
                      className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        activeCamPreset === preset.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelectScenario(PRESET_SCENARIOS[1])}
                  className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-amber-50 hover:border-amber-200 cursor-pointer whitespace-nowrap"
                >
                  Góc Brewster
                </button>
                <button
                  type="button"
                  onClick={() => onSelectScenario(PRESET_SCENARIOS[2])}
                  className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-rose-50 hover:border-rose-200 cursor-pointer whitespace-nowrap"
                >
                  Phản xạ toàn phần
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectScenario(PRESET_SCENARIOS[0]);
                    triggerCameraPreset(CAMERA_PRESETS[0]);
                  }}
                  aria-label="Đặt lại cảnh 3D"
                  className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Row 2: Direct Compact Physical Sliders (θi, n1, n2) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 pt-2 border-t border-slate-200">
              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-[11px] font-medium text-slate-700">
                  <span>Góc tới θi</span>
                  <span className="font-mono tabular-nums text-sky-800">
                    {physics.incidentAngleDeg.toFixed(1)}°
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={89}
                  step={0.5}
                  value={physics.incidentAngleDeg}
                  onChange={(e) => onChangeIncidentAngle(Number(e.target.value))}
                  aria-label="Điều chỉnh góc tới 3D"
                  className="w-full accent-sky-700 cursor-pointer"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-[11px] font-medium text-slate-700">
                  <span>Chiết suất n₁</span>
                  <span className="font-mono tabular-nums text-sky-800">{physics.n1.toFixed(3)}</span>
                </span>
                <input
                  type="range"
                  min={1.0}
                  max={3.5}
                  step={0.005}
                  value={physics.n1}
                  onChange={(e) => onChangeN1(Number(e.target.value))}
                  aria-label="Điều chỉnh chiết suất n1 3D"
                  className="w-full accent-sky-700 cursor-pointer"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-[11px] font-medium text-slate-700">
                  <span>Chiết suất n₂</span>
                  <span className="font-mono tabular-nums text-indigo-800">
                    {physics.n2.toFixed(3)}
                  </span>
                </span>
                <input
                  type="range"
                  min={1.0}
                  max={3.5}
                  step={0.005}
                  value={physics.n2}
                  onChange={(e) => onChangeN2(Number(e.target.value))}
                  aria-label="Điều chỉnh chiết suất n2 3D"
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
