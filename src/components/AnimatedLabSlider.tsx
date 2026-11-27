import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { clamp } from '../physics/emPhysics';

export interface SliderMarker {
  value: number;
  label: string;
  colorClass: string;
}

interface AnimatedLabSliderProps {
  id?: string;
  ariaLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  formatTooltip?: (value: number) => string;
  accentColor?: string;
  markers?: SliderMarker[];
}

export function computeSliderPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

export const AnimatedLabSlider: React.FC<AnimatedLabSliderProps> = ({
  id,
  ariaLabel,
  min,
  max,
  step,
  value,
  onChange,
  formatTooltip,
  accentColor = '#0284c7',
  markers = [],
}) => {
  const [isActive, setIsActive] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const percent = computeSliderPercent(value, min, max);
  const showFloatingReadout = (isActive || isFocused) && Boolean(formatTooltip);

  const springTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { type: 'spring' as const, stiffness: 460, damping: 36, mass: 0.45 };

  return (
    <div
      className="relative flex items-center h-6 select-none"
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      data-dragging={isActive ? 'true' : 'false'}
    >
      {/* Visual Track */}
      <div className="relative w-full h-1.5 rounded-full bg-slate-200 overflow-visible">
        {/* Smooth Spring Active Fill (compositor scaleX) */}
        <motion.div
          className="absolute inset-y-0 left-0 w-full rounded-full origin-left pointer-events-none"
          style={{ backgroundColor: accentColor }}
          initial={false}
          animate={{ scaleX: percent / 100 }}
          transition={springTransition}
        />

        {/* Calibrated Physical Reference Markers (e.g., θB, θc) */}
        {markers.map((m) => {
          const markerPct = computeSliderPercent(m.value, min, max);
          return (
            <motion.span
              key={m.label}
              aria-hidden="true"
              title={`${m.label}: ${m.value.toFixed(1)}°`}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-3 rounded-xs pointer-events-none ${m.colorClass}`}
              initial={false}
              animate={{ left: `${markerPct}%` }}
              transition={springTransition}
            />
          );
        })}

        {/* Spring-Animated Precision Thumb & Halo */}
        <motion.div
          aria-hidden="true"
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none flex items-center justify-center"
          initial={false}
          animate={{ left: `${percent}%` }}
          transition={springTransition}
        >
          {/* Floating Live Value Readout on Drag / Keyboard Focus */}
          <AnimatePresence>
            {showFloatingReadout && formatTooltip && (
              <motion.div
                key="slider-tooltip"
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 4, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 3, scale: 0.94 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[11px] font-medium tabular-nums whitespace-nowrap shadow-xs"
              >
                {formatTooltip(value)}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Subtle Tactile Ring on Hover / Drag / Focus */}
          <motion.span
            className="absolute w-7 h-7 rounded-full"
            style={{ backgroundColor: accentColor }}
            initial={false}
            animate={{
              scale: isActive ? 1.1 : isFocused ? 1.0 : isHovered ? 0.85 : 0.4,
              opacity: isActive ? 0.2 : isFocused ? 0.18 : isHovered ? 0.12 : 0,
            }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Core Thumb Knob */}
          <motion.span
            className="relative w-4 h-4 rounded-full border-2 border-white shadow-sm"
            style={{ backgroundColor: accentColor }}
            initial={false}
            animate={{
              scale: isActive ? 1.2 : isHovered || isFocused ? 1.1 : 1,
            }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          />
        </motion.div>
      </div>

      {/* Native Accessible Range Input overlaid for keyboard, touch, mouse & screen readers */}
      <input
        id={id}
        aria-label={ariaLabel}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => setIsActive(true)}
        onPointerUp={() => setIsActive(false)}
        onPointerCancel={() => setIsActive(false)}
        onBlur={() => {
          setIsActive(false);
          setIsFocused(false);
        }}
        onFocus={() => setIsFocused(true)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0"
      />
    </div>
  );
};
