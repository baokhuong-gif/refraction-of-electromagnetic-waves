import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Compass,
  MoveUpRight,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Ruler,
  StepForward,
  Waves,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  clamp,
  degToRad,
  formatWavelength,
  radToDeg,
  WavePhysicsResult,
  wavelengthToColor,
} from '../physics/emPhysics';
import { PolarizationMode } from '../physics/materials';

export interface WaveLayerToggles {
  wavefronts: boolean;
  rays: boolean;
  eField: boolean;
  angles: boolean;
  protractor: boolean;
}

interface WaveCanvasProps {
  physics: WavePhysicsResult;
  polarization: PolarizationMode;
  wavelengthVacuumNm: number;
  material1Label: string;
  material2Label: string;
  canvasElementRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  onChangeIncidentAngle: (angleDeg: number) => void;
  onChangeN1: (n1: number) => void;
  onChangeN2: (n2: number) => void;
  onResetSimulation: () => void;
}

type CanvasDragMode = 'NONE' | 'ANGLE' | 'N1' | 'N2';

interface ProbeState {
  active: boolean;
  xPx: number;
  yPx: number;
  medium: 1 | 2;
  normX: number;
  normZ: number;
  angleFromNormalDeg: number;
}

const N_RAIL_MIN = 1.0;
const N_RAIL_MAX = 3.8;

export const WaveCanvas: React.FC<WaveCanvasProps> = ({
  physics,
  polarization,
  wavelengthVacuumNm,
  material1Label,
  material2Label,
  canvasElementRef,
  onChangeIncidentAngle,
  onChangeN1,
  onChangeN2,
  onResetSimulation,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isSweeping, setIsSweeping] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [layers, setLayers] = useState<WaveLayerToggles>({
    wavefronts: true,
    rays: true,
    eField: true,
    angles: true,
    protractor: true,
  });
  const [dragMode, setDragMode] = useState<CanvasDragMode>('NONE');
  const [probe, setProbe] = useState<ProbeState>({
    active: false,
    xPx: 0,
    yPx: 0,
    medium: 1,
    normX: 0,
    normZ: 0,
    angleFromNormalDeg: 0,
  });
  const prefersReducedMotion = useReducedMotion();

  // Mutable animation refs to avoid React re-renders at 60Hz
  const phaseRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  const speedRef = useRef(speedMultiplier);
  const zoomRef = useRef(zoomLevel);
  const physicsRef = useRef(physics);
  const polarizationRef = useRef(polarization);
  const wavelengthRef = useRef(wavelengthVacuumNm);
  const layersRef = useRef(layers);
  const labelsRef = useRef({ m1: material1Label, m2: material2Label });
  const sweepDirRef = useRef<1 | -1>(1);
  const onChangeAngleRef = useRef(onChangeIncidentAngle);

  isPlayingRef.current = isPlaying;
  speedRef.current = speedMultiplier;
  zoomRef.current = zoomLevel;
  physicsRef.current = physics;
  polarizationRef.current = polarization;
  wavelengthRef.current = wavelengthVacuumNm;
  layersRef.current = layers;
  labelsRef.current = { m1: material1Label, m2: material2Label };
  onChangeAngleRef.current = onChangeIncidentAngle;

  const drawFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    if (width <= 0 || height <= 0) return;

    const p = physicsRef.current;
    const pol = polarizationRef.current;
    const ly = layersRef.current;
    const phase = phaseRef.current;
    const waveHex = wavelengthToColor(wavelengthRef.current);

    ctx.save();
    ctx.scale(dpr, dpr);

    const cx = width * 0.5;
    const cy = height * 0.5;
    const zoom = zoomRef.current;
    const maxRayLen = Math.min(width * 0.45, height * 0.44) * Math.min(1.2, 0.85 + zoom * 0.15);

    // 1. Medium 1 (Top) & Medium 2 (Bottom) backgrounds shaded subtly by refractive index
    const m1Alpha = clamp((p.n1 - 1.0) * 0.085, 0, 0.24);
    const m2Alpha = clamp((p.n2 - 1.0) * 0.085, 0, 0.24);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, cy);
    ctx.fillStyle = `rgba(14, 165, 233, ${m1Alpha.toFixed(3)})`;
    ctx.fillRect(0, 0, width, cy);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, cy, width, height - cy);
    ctx.fillStyle = `rgba(37, 99, 235, ${(0.03 + m2Alpha).toFixed(3)})`;
    ctx.fillRect(0, cy, width, height - cy);

    // Subtle scientific coordinate grid scaled by zoom
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1;
    const gridStep = Math.round(36 * zoom);
    ctx.beginPath();
    for (let x = cx % gridStep; x < width; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = cy % gridStep; y < height; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Optional calibrated circular optical protractor centered on (cx, cy)
    if (ly.protractor) {
      const pRadius = Math.min(width * 0.37, height * 0.41);
      ctx.save();
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.26)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, pRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, pRadius - 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.stroke();

      // Batch major (30°) and minor (5°/15°) ticks into two strokes for smooth frame performance
      ctx.beginPath();
      for (let deg = 0; deg < 360; deg += 5) {
        if (deg % 30 === 0) continue;
        const rad = degToRad(deg);
        const innerR = deg % 15 === 0 ? pRadius - 7 : pRadius - 4;
        ctx.moveTo(cx + Math.sin(rad) * innerR, cy - Math.cos(rad) * innerR);
        ctx.lineTo(cx + Math.sin(rad) * pRadius, cy - Math.cos(rad) * pRadius);
      }
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.24)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.beginPath();
      for (let deg = 0; deg < 360; deg += 30) {
        const rad = degToRad(deg);
        const innerR = pRadius - 11;
        ctx.moveTo(cx + Math.sin(rad) * innerR, cy - Math.cos(rad) * innerR);
        ctx.lineTo(cx + Math.sin(rad) * pRadius, cy - Math.cos(rad) * pRadius);
      }
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Degree numerals relative to Normal (0° at top/bottom, 30°, 60°)
      if (width >= 480) {
        ctx.font = '500 9.5px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(71, 85, 105, 0.65)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelR = pRadius + 12;
        [30, 60].forEach((ang) => {
          const rad = degToRad(ang);
          // Upper-left & upper-right
          ctx.fillText(`${ang}°`, cx - Math.sin(rad) * labelR, cy - Math.cos(rad) * labelR);
          ctx.fillText(`${ang}°`, cx + Math.sin(rad) * labelR, cy - Math.cos(rad) * labelR);
          // Lower-left & lower-right
          ctx.fillText(`${ang}°`, cx - Math.sin(rad) * labelR, cy + Math.cos(rad) * labelR);
          ctx.fillText(`${ang}°`, cx + Math.sin(rad) * labelR, cy + Math.cos(rad) * labelR);
        });
      }
      ctx.restore();
    }

    // Base visual wavelength in pixels scaled cleanly by refractive index & zoom
    const baseLambdaPx = 46 * zoom;
    const lambda1Px = clamp(baseLambdaPx / p.n1, 12, 86);
    const lambda2Px = clamp(baseLambdaPx / p.n2, 10, 86);

    const thetaI = p.incidentAngleRad;
    const sinI = Math.sin(thetaI);
    const cosI = Math.cos(thetaI);

    // Unit propagation vectors (screen coordinates: +x right, +y down)
    // Incident travels from upper-left toward origin (cx, cy)
    const incDirX = sinI;
    const incDirY = cosI;

    // Reflected travels from origin toward upper-right
    const refDirX = sinI;
    const refDirY = -cosI;

    // Beam visual width
    const beamHalfWidth = Math.min(width, height) * 0.145;

    // Helper: draw planar electromagnetic wavefronts along a finite beam corridor
    const drawWavefrontBeam = (
      originX: number,
      originY: number,
      dirX: number,
      dirY: number,
      length: number,
      lambdaPx: number,
      phaseOffsetRad: number,
      amplitudeWeight: number,
      strokeColor: string,
      clipRegion: 'top' | 'bottom',
      reverseTravel = false
    ) => {
      if (amplitudeWeight < 0.025) return;

      ctx.save();
      ctx.beginPath();
      if (clipRegion === 'top') {
        ctx.rect(0, 0, width, cy);
      } else {
        ctx.rect(0, cy, width, height - cy);
      }
      ctx.clip();

      const perpX = -dirY;
      const perpY = dirX;
      const k = (2 * Math.PI) / lambdaPx;

      // Subtle beam corridor guide
      ctx.beginPath();
      ctx.moveTo(originX + perpX * beamHalfWidth, originY + perpY * beamHalfWidth);
      ctx.lineTo(
        originX + dirX * length + perpX * beamHalfWidth,
        originY + dirY * length + perpY * beamHalfWidth
      );
      ctx.lineTo(
        originX + dirX * length - perpX * beamHalfWidth,
        originY + dirY * length - perpY * beamHalfWidth
      );
      ctx.lineTo(originX - perpX * beamHalfWidth, originY - perpY * beamHalfWidth);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(strokeColor, 0.045 * amplitudeWeight);
      ctx.fill();

      // Draw crisp sinusoidal wavefront crests & troughs
      const stepPx = 5;
      for (let s = 0; s <= length; s += stepPx) {
        const distFromOrigin = reverseTravel ? -s : s;
        const val = Math.cos(k * distFromOrigin - phase + phaseOffsetRad);
        if (Math.abs(val) < 0.25) continue;

        const alpha = Math.pow(Math.abs(val), 1.6) * 0.55 * amplitudeWeight;
        const px = originX + dirX * s;
        const py = originY + dirY * s;

        ctx.strokeStyle =
          val >= 0
            ? hexToRgba(strokeColor, alpha)
            : hexToRgba('#475569', alpha * 0.42);
        ctx.lineWidth = val >= 0 ? 2.1 : 1.1;
        ctx.beginPath();
        ctx.moveTo(px - perpX * beamHalfWidth, py - perpY * beamHalfWidth);
        ctx.lineTo(px + perpX * beamHalfWidth, py + perpY * beamHalfWidth);
        ctx.stroke();
      }
      ctx.restore();
    };

    // Helper: draw oscillating E-field polarization vectors along a ray
    const drawEFieldVectors = (
      startX: number,
      startY: number,
      dirX: number,
      dirY: number,
      length: number,
      lambdaPx: number,
      phaseOffsetRad: number,
      amplitudeWeight: number,
      color: string,
      clipRegion: 'top' | 'bottom',
      reverseTravel = false
    ) => {
      if (amplitudeWeight < 0.06) return;
      ctx.save();
      ctx.beginPath();
      if (clipRegion === 'top') {
        ctx.rect(0, 0, width, cy);
      } else {
        ctx.rect(0, cy, width, height - cy);
      }
      ctx.clip();

      const perpX = -dirY;
      const perpY = dirX;
      const k = (2 * Math.PI) / lambdaPx;
      const maxVecLen = 22 * amplitudeWeight;

      if (pol === 'TM' || pol === 'UNPOLARIZED') {
        // Transverse in-plane E-field wave envelope + vector arrows
        ctx.strokeStyle = hexToRgba(color, 0.85 * amplitudeWeight);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let s = 8; s <= length - 8; s += 3) {
          const dist = reverseTravel ? -s : s;
          const eVal = Math.sin(k * dist - phase + phaseOffsetRad) * maxVecLen;
          const x = startX + dirX * s + perpX * eVal;
          const y = startY + dirY * s + perpY * eVal;
          if (s === 8) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Discrete vector ticks perpendicular to ray
        const arrowSpacing = Math.max(12, lambdaPx * 0.35);
        for (let s = 14; s <= length - 14; s += arrowSpacing) {
          const dist = reverseTravel ? -s : s;
          const eVal = Math.sin(k * dist - phase + phaseOffsetRad) * maxVecLen;
          if (Math.abs(eVal) < 4) continue;
          const bx = startX + dirX * s;
          const by = startY + dirY * s;
          const tx = bx + perpX * eVal;
          const ty = by + perpY * eVal;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = hexToRgba(color, 0.65 * amplitudeWeight);
          ctx.lineWidth = 1.25;
          ctx.stroke();
        }
      }

      if (pol === 'TE' || pol === 'UNPOLARIZED') {
        // Out-of-plane E-field markers (dot = out of screen, cross = into screen)
        const spacing = Math.max(18, lambdaPx * 0.5);
        for (let s = 18; s <= length - 18; s += spacing) {
          const dist = reverseTravel ? -s : s;
          const eVal = Math.sin(k * dist - phase + phaseOffsetRad);
          const radius = 3.2 + Math.abs(eVal) * 4.5 * amplitudeWeight;
          const bx = startX + dirX * s;
          const by = startY + dirY * s;

          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = hexToRgba(color, 0.85 * amplitudeWeight);
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(bx, by, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          if (eVal >= 0) {
            ctx.fillStyle = hexToRgba(color, 0.9 * amplitudeWeight);
            ctx.beginPath();
            ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const d = radius * 0.55;
            ctx.beginPath();
            ctx.moveTo(bx - d, by - d);
            ctx.lineTo(bx + d, by + d);
            ctx.moveTo(bx + d, by - d);
            ctx.lineTo(bx - d, by + d);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    };

    // 2. Render Wavefronts (Incident, Reflected, Refracted or Evanescent)
    const refAmp = Math.sqrt(clamp(p.reflectanceEffective, 0, 1));
    const transAmp = Math.sqrt(clamp(p.transmittanceEffective, 0, 1));
    const refPhaseRad = degToRad(
      pol === 'TM' ? p.phaseShiftPDeg : p.phaseShiftSDeg
    );

    const beamLen = Math.hypot(width * 0.55, height * 0.55);

    if (ly.wavefronts) {
      // Incident wavefronts traveling toward (cx, cy)
      drawWavefrontBeam(
        cx,
        cy,
        -incDirX,
        -incDirY,
        beamLen,
        lambda1Px,
        0,
        1.0,
        waveHex,
        'top',
        true
      );

      // Reflected wavefronts traveling away from (cx, cy)
      drawWavefrontBeam(
        cx,
        cy,
        refDirX,
        refDirY,
        beamLen,
        lambda1Px,
        refPhaseRad,
        refAmp,
        '#dc2626',
        'top',
        false
      );

      if (!p.isTotalInternalReflection && p.refractedAngleRad !== null) {
        const transDirX = Math.sin(p.refractedAngleRad);
        const transDirY = Math.cos(p.refractedAngleRad);
        drawWavefrontBeam(
          cx,
          cy,
          transDirX,
          transDirY,
          beamLen,
          lambda2Px,
          0,
          transAmp,
          '#059669',
          'bottom',
          false
        );
      } else if (p.isTotalInternalReflection) {
        // Evanescent wave decaying exponentially into Medium 2 and propagating along +x
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, cy, width, height - cy);
        ctx.clip();

        // Map real penetration depth ratio (delta_e / lambda_0) to crisp pixel decay depth
        const ratio =
          p.evanescentPenetrationDepthNm !== null
            ? clamp(p.evanescentPenetrationDepthNm / wavelengthRef.current, 0.1, 1.8)
            : 0.35;
        const decayDepthPx = clamp(ratio * 110, 26, height * 0.34);
        const kx = (2 * Math.PI * sinI) / lambda1Px;

        const spanStart = cx - beamHalfWidth * 0.95;
        const spanEnd = Math.min(width - 12, cx + width * 0.44);
        const cols = 4;

        for (let z = 2; z <= decayDepthPx * 2.8; z += 4) {
          const decay = Math.exp(-z / decayDepthPx);
          if (decay < 0.04) break;
          for (let x = spanStart; x <= spanEnd; x += cols) {
            const dx = x - cx;
            const envX =
              dx < 0
                ? Math.exp(-Math.pow(dx / (beamHalfWidth * 0.72), 2))
                : Math.exp(-dx / (width * 0.34));
            const val = Math.cos(kx * dx - phase) * decay * envX;
            if (Math.abs(val) < 0.05) continue;
            ctx.fillStyle =
              val >= 0
                ? hexToRgba('#d97706', Math.abs(val) * 0.82)
                : hexToRgba('#0f172a', Math.abs(val) * 0.32);
            ctx.fillRect(x, cy + z, cols, 3.4);
          }
        }

        // Dashed 1/e decay horizon line
        ctx.save();
        ctx.strokeStyle = 'rgba(180, 83, 9, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy + decayDepthPx);
        ctx.lineTo(Math.min(width - 120, cx + 150), cy + decayDepthPx);
        ctx.stroke();
        ctx.restore();

        // Draw penetration depth 1/e indicator bracket
        const bracketX = Math.min(width - 130, cx + 118);
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bracketX, cy + 2);
        ctx.lineTo(bracketX, cy + decayDepthPx);
        ctx.moveTo(bracketX - 5, cy + decayDepthPx);
        ctx.lineTo(bracketX + 5, cy + decayDepthPx);
        ctx.stroke();

        const depthLabel =
          p.evanescentPenetrationDepthNm !== null
            ? `δe = ${formatWavelength(p.evanescentPenetrationDepthNm)}`
            : 'Sóng suy giảm';
        drawHaloText(
          ctx,
          depthLabel,
          bracketX + 9,
          cy + Math.max(14, decayDepthPx * 0.55 + 3),
          '#92400e',
          '600 11px "JetBrains Mono", monospace',
          'left'
        );
        ctx.restore();
      }
    }

    // 3. Interface Boundary Line & Normal Line
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.stroke();

    if (ly.angles) {
      // Normal line (dashed vertical through origin)
      ctx.save();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(cx, 16);
      ctx.lineTo(cx, height - 16);
      ctx.stroke();
      ctx.restore();

      if (width >= 520) {
        drawHaloText(
          ctx,
          'Pháp tuyến (N)',
          cx + 8,
          24,
          '#64748b',
          '500 11px "IBM Plex Sans", sans-serif',
          'left'
        );
      }

      // Optional critical angle reference line in upper-left quadrant
      if (p.criticalAngleDeg !== null) {
        const cRad = degToRad(p.criticalAngleDeg);
        const cLen = maxRayLen * 0.96;
        ctx.save();
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.65)';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - Math.sin(cRad) * cLen, cy - Math.cos(cRad) * cLen);
        ctx.stroke();
        ctx.restore();

        drawHaloText(
          ctx,
          `θc = ${p.criticalAngleDeg.toFixed(1)}°`,
          cx - Math.sin(cRad) * (cLen * 0.88) - 8,
          cy - Math.cos(cRad) * (cLen * 0.88) - 6,
          '#b45309',
          '600 11px "JetBrains Mono", monospace',
          'right'
        );
      }
    }

    // 4. E-field oscillation overlays along rays
    if (ly.eField) {
      drawEFieldVectors(
        cx,
        cy,
        -incDirX,
        -incDirY,
        maxRayLen * 0.92,
        lambda1Px,
        0,
        1.0,
        waveHex,
        'top',
        true
      );
      if (refAmp > 0.08) {
        drawEFieldVectors(
          cx,
          cy,
          refDirX,
          refDirY,
          maxRayLen * 0.92,
          lambda1Px,
          refPhaseRad,
          refAmp,
          '#dc2626',
          'top',
          false
        );
      }
      if (!p.isTotalInternalReflection && p.refractedAngleRad !== null && transAmp > 0.08) {
        drawEFieldVectors(
          cx,
          cy,
          Math.sin(p.refractedAngleRad),
          Math.cos(p.refractedAngleRad),
          maxRayLen * 0.92,
          lambda2Px,
          0,
          transAmp,
          '#059669',
          'bottom',
          false
        );
      }
    }

    // 5. Crisp Ray Arrows (Incident, Reflected, Refracted)
    const srcX = cx - incDirX * maxRayLen;
    const srcY = cy - incDirY * maxRayLen;

    if (ly.rays) {
      // Incident ray
      drawRayArrow(ctx, srcX, srcY, cx, cy, waveHex, 2.8, 1.0);

      // Reflected ray (opacity + thickness scales with sqrt(R))
      const refAlpha = clamp(0.18 + refAmp * 0.82, 0.18, 1);
      const refWidth = 1.4 + refAmp * 1.8;
      drawRayArrow(
        ctx,
        cx,
        cy,
        cx + refDirX * maxRayLen,
        cy + refDirY * maxRayLen,
        '#dc2626',
        refWidth,
        refAlpha
      );

      // Refracted ray
      if (!p.isTotalInternalReflection && p.refractedAngleRad !== null) {
        const transAlpha = clamp(0.2 + transAmp * 0.8, 0.2, 1);
        const transWidth = 1.4 + transAmp * 1.8;
        drawRayArrow(
          ctx,
          cx,
          cy,
          cx + Math.sin(p.refractedAngleRad) * maxRayLen,
          cy + Math.cos(p.refractedAngleRad) * maxRayLen,
          '#059669',
          transWidth,
          transAlpha
        );
      }
    }

    // 6. Angle Arcs & Haloed Numeric Annotations (positioned cleanly along arc bisectors)
    if (ly.angles) {
      const arcR = 54;
      // Incident angle arc
      if (p.incidentAngleDeg > 1.5) {
        ctx.strokeStyle = waveHex;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx, cy, arcR, -Math.PI / 2 - thetaI, -Math.PI / 2);
        ctx.stroke();

        const midI = -Math.PI / 2 - thetaI * 0.45;
        const labelR = arcR + 22;
        drawHaloText(
          ctx,
          `θi ${p.incidentAngleDeg.toFixed(1)}°`,
          cx + Math.cos(midI) * labelR - 6,
          cy + Math.sin(midI) * labelR,
          '#0f172a',
          '600 11.5px "JetBrains Mono", monospace',
          'right'
        );
      }

      // Reflected angle arc
      if (p.incidentAngleDeg > 1.5 && p.reflectanceEffective > 0.002) {
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, arcR - 12, -Math.PI / 2, -Math.PI / 2 + thetaI);
        ctx.stroke();

        const midR = -Math.PI / 2 + thetaI * 0.45;
        const labelR = arcR + 18;
        drawHaloText(
          ctx,
          `θr ${p.reflectedAngleDeg.toFixed(1)}°`,
          cx + Math.cos(midR) * labelR + 6,
          cy + Math.sin(midR) * labelR,
          '#b91c1c',
          '600 11px "JetBrains Mono", monospace',
          'left'
        );
      }

      // Refracted angle arc & ray deviation (Δθ) visual cue
      if (!p.isTotalInternalReflection && p.refractedAngleRad !== null) {
        if (p.refractedAngleDeg! > 1.5) {
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(cx, cy, arcR, Math.PI / 2 - p.refractedAngleRad, Math.PI / 2);
          ctx.stroke();

          // Place θt cleanly below the arc near the normal side so it never collides with Δθ
          const midT = Math.PI / 2 - p.refractedAngleRad * 0.45;
          const labelR = arcR + 18;
          drawHaloText(
            ctx,
            `θt ${p.refractedAngleDeg!.toFixed(1)}°`,
            cx + Math.cos(midT) * labelR - 4,
            cy + Math.sin(midT) * labelR + 12,
            '#047857',
            '600 11.5px "JetBrains Mono", monospace',
            'center'
          );
        }

        // Undeviated dashed ray extension into Medium 2 + deviation angle Δθ arc
        if (p.deviationAngleDeg !== null && p.deviationAngleDeg > 2.0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
          ctx.lineWidth = 1.25;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + incDirX * maxRayLen * 0.85, cy + incDirY * maxRayLen * 0.85);
          ctx.stroke();
          ctx.restore();

          const devArcR = arcR + 42;
          const a1 = Math.PI / 2 - thetaI;
          const a2 = Math.PI / 2 - p.refractedAngleRad;
          const startA = Math.min(a1, a2);
          const endA = Math.max(a1, a2);
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(cx, cy, devArcR, startA, endA);
          ctx.stroke();

          const midDev = (startA + endA) * 0.5;
          drawHaloText(
            ctx,
            `Δθ ${p.deviationAngleDeg.toFixed(1)}°`,
            cx + Math.cos(midDev) * (devArcR + 14) + 6,
            cy + Math.sin(midDev) * (devArcR + 14) + 3,
            '#0369a1',
            '600 10.5px "JetBrains Mono", monospace',
            'left'
          );
        }
      }
    }

    // 7. Interactive Emitter Handle on Incident Ray
    ctx.save();
    ctx.beginPath();
    ctx.arc(srcX, srcY, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = waveHex;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(srcX, srcY, 4, 0, Math.PI * 2);
    ctx.fillStyle = waveHex;
    ctx.fill();
    ctx.restore();

    // Origin incidence marker
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    // 8. Medium Labels (Adaptive for desktop vs compact mobile canvas so labels never collide)
    const isCompactCanvas = width < 520;
    const railX = width - 30;

    if (isCompactCanvas) {
      drawHaloText(
        ctx,
        `MT1 · n₁ = ${p.n1.toFixed(3)}`,
        12,
        22,
        '#0f172a',
        '600 11px "JetBrains Mono", monospace',
        'left'
      );
      drawHaloText(
        ctx,
        `MT2 · n₂ = ${p.n2.toFixed(3)}`,
        12,
        cy + 22,
        '#0f172a',
        '600 11px "JetBrains Mono", monospace',
        'left'
      );
      drawHaloText(
        ctx,
        `R = ${(p.reflectanceEffective * 100).toFixed(1)}%`,
        railX - 18,
        22,
        '#b91c1c',
        '600 11px "JetBrains Mono", monospace',
        'right'
      );
      drawHaloText(
        ctx,
        p.isTotalInternalReflection
          ? 'T = 0% (TIR)'
          : `T = ${(p.transmittanceEffective * 100).toFixed(1)}%`,
        railX - 18,
        cy + 22,
        p.isTotalInternalReflection ? '#b45309' : '#047857',
        '600 11px "JetBrains Mono", monospace',
        'right'
      );
    } else {
      ctx.font = '600 12px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`Môi trường 1: ${labelsRef.current.m1}`, 16, 26);
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#475569';
      ctx.fillText(
        `n₁ = ${p.n1.toFixed(3)} · εr₁ = ${p.permittivity1.toFixed(2)} · Z₁ = ${p.impedance1Ohm.toFixed(1)} Ω`,
        16,
        44
      );

      ctx.font = '600 12px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`Môi trường 2: ${labelsRef.current.m2}`, 16, cy + 26);
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#475569';
      ctx.fillText(
        `n₂ = ${p.n2.toFixed(3)} · εr₂ = ${p.permittivity2.toFixed(2)} · Z₂ = ${p.impedance2Ohm.toFixed(1)} Ω`,
        16,
        cy + 44
      );

      // Subtle right-hand energy flux readout (offset left of refractive drag rails)
      ctx.textAlign = 'right';
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#b91c1c';
      ctx.fillText(`Phản xạ R = ${(p.reflectanceEffective * 100).toFixed(1)}%`, railX - 24, 24);
      ctx.fillStyle = p.isTotalInternalReflection ? '#b45309' : '#047857';
      ctx.fillText(
        p.isTotalInternalReflection
          ? 'Truyền xa T = 0.0% (Sóng suy giảm)'
          : `Truyền qua T = ${(p.transmittanceEffective * 100).toFixed(1)}%`,
        railX - 24,
        cy + 24
      );
      ctx.textAlign = 'left';
    }

    // 9. Interactive On-Canvas Drag Rails for Refractive Indices n1 (Top) & n2 (Bottom)
    const drawIndexRail = (
      topY: number,
      bottomY: number,
      value: number,
      label: string,
      accentHex: string
    ) => {
      const span = Math.max(40, bottomY - topY);
      const t = clamp((value - N_RAIL_MIN) / (N_RAIL_MAX - N_RAIL_MIN), 0, 1);
      // Higher refractive index sits toward the top of each rail for intuitive vertical dragging
      const knobY = bottomY - t * span;

      // Track background
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(railX, topY);
      ctx.lineTo(railX, bottomY);
      ctx.stroke();

      // Active fill from bottom up to knob
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(railX, bottomY);
      ctx.lineTo(railX, knobY);
      ctx.stroke();

      // Draggable knob
      ctx.beginPath();
      ctx.arc(railX, knobY, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = accentHex;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(railX, knobY, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = accentHex;
      ctx.fill();

      // Crisp haloed numeric readout beside knob
      drawHaloText(
        ctx,
        `${label} ${value.toFixed(2)}`,
        railX - 13,
        knobY + 4,
        '#0f172a',
        '600 10.5px "JetBrains Mono", monospace',
        'right'
      );
    };

    drawIndexRail(44, cy - 18, p.n1, 'n₁', '#0284c7');
    drawIndexRail(cy + 40, height - 30, p.n2, 'n₂', '#2563eb');

    ctx.restore();
  };

  // Resize observer + animation loop mounted once
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(300, Math.floor(rect.width * dpr));
      canvas.height = Math.max(340, Math.floor(rect.height * dpr));
      drawFrame();
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let lastTs = performance.now();
    let lastDrawTs = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.06, (now - lastTs) / 1000);
      lastTs = now;
      if (isPlayingRef.current && !prefersReducedMotion && now - lastDrawTs >= 32) {
        phaseRef.current = (phaseRef.current + dt * 4.2 * speedRef.current) % (Math.PI * 200);
        lastDrawTs = now;
        drawFrame();
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  // Re-draw immediately on prop changes when paused
  useEffect(() => {
    drawFrame();
  }, [physics, polarization, wavelengthVacuumNm, material1Label, material2Label, layers, zoomLevel]);

  // Smooth automated incident angle sweep mode
  useEffect(() => {
    if (!isSweeping) return;
    const id = window.setInterval(() => {
      const current = physicsRef.current.incidentAngleDeg;
      let next = current + sweepDirRef.current * 0.8;
      if (next >= 85) {
        next = 85;
        sweepDirRef.current = -1;
      } else if (next <= 5) {
        next = 5;
        sweepDirRef.current = 1;
      }
      onChangeAngleRef.current(Math.round(next * 10) / 10);
    }, 55);
    return () => window.clearInterval(id);
  }, [isSweeping]);

  const updateNFromRail = (clientY: number, medium: 1 | 2) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    const cy = rect.height * 0.5;
    const topY = medium === 1 ? 44 : cy + 40;
    const bottomY = medium === 1 ? cy - 18 : rect.height - 30;
    const t = clamp((bottomY - y) / Math.max(40, bottomY - topY), 0, 1);
    const nextN = Math.round((N_RAIL_MIN + t * (N_RAIL_MAX - N_RAIL_MIN)) * 200) / 200;
    if (medium === 1) onChangeN1(nextN);
    else onChangeN2(nextN);
  };

  const updateAngleFromPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cx = rect.width * 0.5;
    const cy = rect.height * 0.5;

    const dx = cx - x; // positive to the left of normal
    const dy = cy - y; // positive above interface
    if (dy < 2) {
      onChangeIncidentAngle(89.0);
      return;
    }
    const clampedDx = Math.max(0, dx);
    const angle = radToDeg(Math.atan2(clampedDx, dy));
    onChangeIncidentAngle(Math.round(clamp(angle, 0, 89.5) * 10) / 10);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isSweeping) setIsSweeping(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cy = rect.height * 0.5;

    // Hit-test right-edge refractive index drag rails first
    if (x >= rect.width - 76) {
      const targetMode: CanvasDragMode = y < cy ? 'N1' : 'N2';
      setDragMode(targetMode);
      e.currentTarget.setPointerCapture(e.pointerId);
      updateNFromRail(e.clientY, y < cy ? 1 : 2);
      return;
    }

    // Otherwise drag anywhere in Medium 1 to aim the incident wave
    if (y <= cy + 8) {
      setDragMode('ANGLE');
      e.currentTarget.setPointerCapture(e.pointerId);
      updateAngleFromPointer(e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width * 0.5;
    const cy = rect.height * 0.5;

    const normX = (x - cx) / (rect.width * 0.5);
    const normZ = (y - cy) / (rect.height * 0.5);
    const angleFromNormalDeg = radToDeg(Math.atan2(Math.abs(x - cx), Math.max(1, Math.abs(y - cy))));

    setProbe({
      active: true,
      xPx: x,
      yPx: y,
      medium: y <= cy ? 1 : 2,
      normX,
      normZ,
      angleFromNormalDeg,
    });

    if (dragMode === 'ANGLE') {
      updateAngleFromPointer(e.clientX, e.clientY);
    } else if (dragMode === 'N1') {
      updateNFromRail(e.clientY, 1);
    } else if (dragMode === 'N2') {
      updateNFromRail(e.clientY, 2);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragMode !== 'NONE') {
      setDragMode('NONE');
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleStepFrame = () => {
    setIsPlaying(false);
    phaseRef.current += Math.PI / 4;
    drawFrame();
  };

  const toggleLayer = (key: keyof WaveLayerToggles) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleZoomStep = (delta: number) => {
    setZoomLevel((prev) => clamp(Math.round((prev + delta) * 100) / 100, 0.75, 1.75));
  };

  // Build miniature wavelength comparison sine SVG paths for the visual instrument strip
  const waveColor = wavelengthToColor(wavelengthVacuumNm);
  const miniPath1 = buildMiniSinePath(112, 20, clamp(28 / physics.n1, 7, 36));
  const miniPath2 = buildMiniSinePath(112, 20, clamp(28 / physics.n2, 7, 36));
  const refPct = clamp(physics.reflectanceEffective * 100, 0, 100);
  const transPct = clamp(physics.transmittanceEffective * 100, 0, 100);

  return (
    <section
      aria-label="Sân khấu mô phỏng truyền sóng điện từ"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Visual Instrument Toolbar Row 1: Playback, Auto-Sweep, Zoom & Speed */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsPlaying((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-slate-200 text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Tạm dừng' : 'Phát sóng'}
          </button>

          <button
            type="button"
            onClick={handleStepFrame}
            aria-label="Bước khung sóng kế tiếp"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <StepForward className="w-3.5 h-3.5" />
            Bước pha
          </button>

          <button
            type="button"
            aria-pressed={isSweeping}
            onClick={() => setIsSweeping((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isSweeping
                ? 'bg-sky-700 border-sky-700 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            {isSweeping ? 'Dừng quét' : 'Quét góc'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsSweeping(false);
              setZoomLevel(1.0);
              onResetSimulation();
            }}
            aria-label="Đặt lại tham số mô phỏng"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Đặt lại
          </button>
        </div>

        {/* Right Group: Zoom Lens & Wave Speed */}
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Thu phóng khung mô phỏng"
            className="inline-flex items-center bg-white border border-slate-200 rounded-md overflow-hidden"
          >
            <button
              type="button"
              onClick={() => handleZoomStep(-0.25)}
              disabled={zoomLevel <= 0.75}
              aria-label="Thu nhỏ sơ đồ sóng"
              className="px-2 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 transition-colors cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[11px] font-mono tabular-nums text-slate-700 border-x border-slate-200">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => handleZoomStep(0.25)}
              disabled={zoomLevel >= 1.75}
              aria-label="Phóng đại sơ đồ sóng"
              className="px-2 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 transition-colors cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-200 text-xs text-slate-600">
            <label htmlFor="wave-speed-select" className="whitespace-nowrap">
              Tốc độ:
            </label>
            <select
              id="wave-speed-select"
              value={speedMultiplier}
              onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded px-1.5 py-1 text-xs font-mono text-slate-800"
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1.0×</option>
              <option value={1.8}>1.8×</option>
            </select>
          </div>
        </div>
      </div>

      {/* Visual Instrument Toolbar Row 2: Icon-Coded Optical Layer Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-200 bg-white">
        <div
          role="group"
          aria-label="Lớp hiển thị mô phỏng"
          className="flex flex-wrap items-center gap-1.5"
        >
          {(
            [
              ['wavefronts', 'Sóng phẳng', Waves],
              ['rays', 'Tia sóng', MoveUpRight],
              ['eField', 'Trường E', Activity],
              ['angles', 'Góc & Δθ', Ruler],
              ['protractor', 'Thước đo góc', Compass],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              aria-pressed={layers[key]}
              onClick={() => toggleLayer(key)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layers[key]
                  ? 'bg-sky-50 border-sky-200 text-sky-900'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {/* Compact Color Legend */}
        <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-500 font-mono">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 inline-block" style={{ backgroundColor: waveColor }} />
            Tia tới
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-rose-600 inline-block" />
            Phản xạ
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-emerald-600 inline-block" />
            Khúc xạ
          </span>
        </div>
      </div>

      {/* Main Canvas Stage */}
      <div
        ref={containerRef}
        className="relative w-full h-[380px] sm:h-[430px] select-none bg-white"
        data-testid="em-wave-canvas-container"
        data-regime={physics.classification.code}
      >
        <canvas
          ref={(node) => {
            canvasRef.current = node;
            if (canvasElementRef) canvasElementRef.current = node;
          }}
          data-testid="em-wave-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            setProbe((prev) => ({ ...prev, active: false }));
          }}
          className={`w-full h-full block ${
            dragMode !== 'NONE' ? 'cursor-grabbing' : 'cursor-crosshair'
          }`}
          aria-label="Biểu đồ trực quan khúc xạ và phản xạ sóng điện từ qua mặt phân cách hai môi trường"
        />

        {/* Subtle Bottom Coordinate Probe & Interaction Hint */}
        <div className="pointer-events-none absolute bottom-2 left-3 right-14 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span className="truncate bg-white/85 px-2 py-0.5 rounded">
            Kéo nguồn phát chỉnh θi · Kéo thanh phải chỉnh n₁, n₂
          </span>
          {probe.active && (
            <span className="hidden sm:inline bg-white/90 px-2 py-0.5 rounded border border-slate-200 tabular-nums text-slate-700 shrink-0 ml-2">
              MT{probe.medium} · x={probe.normX.toFixed(2)} · z={probe.normZ.toFixed(2)} · ∠N=
              {probe.angleFromNormalDeg.toFixed(1)}°
            </span>
          )}
        </div>
      </div>

      {/* Live Visual Instrument Strip: Animated Energy Flux Bar + Wavelength Compression Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 px-4 py-3 border-t border-slate-200 bg-slate-50/70 items-center">
        {/* Energy Split Meter */}
        <div className="md:col-span-7 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono tabular-nums">
            <span className="text-rose-700 font-semibold">
              Phản xạ R: {refPct.toFixed(1)}%
            </span>
            <span className="text-slate-500 font-sans">Phân bổ năng lượng sóng</span>
            <span
              className={`font-semibold ${
                physics.isTotalInternalReflection ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {physics.isTotalInternalReflection
                ? 'Sóng suy giảm (T = 0%)'
                : `Truyền qua T: ${transPct.toFixed(1)}%`}
            </span>
          </div>
          <div
            aria-label="Thanh đo tỷ lệ năng lượng phản xạ và truyền qua"
            className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden flex"
          >
            <motion.div
              className="h-full bg-rose-600 origin-left"
              initial={false}
              animate={{ width: `${refPct}%` }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.01 }
                  : { type: 'spring', stiffness: 360, damping: 34 }
              }
            />
            <motion.div
              className="h-full bg-emerald-600 origin-right"
              initial={false}
              animate={{ width: `${transPct}%` }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.01 }
                  : { type: 'spring', stiffness: 360, damping: 34 }
              }
            />
          </div>
        </div>

        {/* Live Spatial Wavelength Compression Preview */}
        <div className="md:col-span-5 md:border-l md:border-slate-200 md:pl-4 flex items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="text-xs text-slate-500">Nén / giãn bước sóng (λ₁ → λ₂)</div>
            <div className="font-mono text-xs tabular-nums whitespace-nowrap flex items-center gap-1.5">
              <span className="text-slate-600">{formatWavelength(physics.wavelength1Nm)}</span>
              <span className="text-slate-400">→</span>
              <span
                className={`font-semibold ${
                  physics.isTotalInternalReflection ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {formatWavelength(physics.wavelength2Nm)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0" aria-hidden="true">
            <svg width="112" height="24" viewBox="0 0 112 24" className="overflow-visible">
              <path
                d={miniPath1}
                fill="none"
                stroke={waveColor}
                strokeWidth="1.6"
                opacity="0.45"
              />
              <path
                d={miniPath2}
                fill="none"
                stroke={physics.isTotalInternalReflection ? '#d97706' : '#059669'}
                strokeWidth="1.9"
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
};

function buildMiniSinePath(width: number, height: number, lambdaPx: number): string {
  const midY = height / 2 + 2;
  const amp = height * 0.36;
  const pts: string[] = [];
  for (let x = 0; x <= width; x += 2) {
    const y = midY - Math.sin((x / lambdaPx) * Math.PI * 2) * amp;
    pts.push(`${x === 0 ? 'M' : 'L'}${x},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function drawRayArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  alpha: number
) {
  ctx.save();
  ctx.strokeStyle = hexToRgba(color, alpha);
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Midpoint directional arrow
  const mx = x1 + (x2 - x1) * 0.56;
  const my = y1 + (y2 - y1) * 0.56;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 9;

  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(
    mx - headLen * Math.cos(angle - Math.PI / 6),
    my - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    mx - headLen * Math.cos(angle + Math.PI / 6),
    my - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHaloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fillColor: string,
  font: string,
  align: CanvasTextAlign = 'left'
) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}
