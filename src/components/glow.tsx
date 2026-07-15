import { useCallback, useEffect, useRef } from "react";
import type * as React from "react";
import { createDriver, type Driver } from "../internal/driver";
import { usePrefersReducedMotion } from "../reduced-motion";
import type { Feel } from "../spring";
import { useNearField } from "../use-near-field";

export interface GlowProps extends React.HTMLAttributes<HTMLElement> {
  /** Glow color. Default "rgba(255, 255, 255, 0.25)". */
  color?: string;
  /** Gradient radius in px. Default 160. */
  size?: number;
  /** Field radius in px. Default 140. */
  radius?: number;
  /** Spring preset for the fade. Default "gentle". */
  feel?: Feel;
  /**
   * Glow is opacity-only, so it may opt in to remain under
   * prefers-reduced-motion by setting this to false. Default true (hidden).
   */
  respectReducedMotion?: boolean;
  /** Element to render. Default "span". */
  as?: React.ElementType;
}

const PRESS_OPACITY = 0.7;

/**
 * A soft light that tracks the cursor across the element and brightens with
 * proximity. On touch, shows a centered glow while pressed.
 */
export function Glow(props: GlowProps) {
  const {
    as: Component = "span",
    color = "rgba(255, 255, 255, 0.25)",
    size = 160,
    radius = 140,
    feel = "gentle",
    respectReducedMotion = true,
    style,
    children,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    ...rest
  } = props;

  const reduced = usePrefersReducedMotion();
  const off = respectReducedMotion && reduced;
  const overlayRef = useRef<HTMLSpanElement | null>(null);
  const driverRef = useRef<Driver | null>(null);
  const feelRef = useRef(feel);
  const pressedRef = useRef(false);

  const driver = useCallback(() => {
    if (driverRef.current === null) {
      driverRef.current = createDriver(feelRef.current, [0], ([opacity = 0]) => {
        const overlay = overlayRef.current;
        if (overlay === null) return;
        overlay.style.opacity = Math.min(Math.max(opacity, 0), 1).toFixed(4);
      });
    }
    return driverRef.current;
  }, []);

  useEffect(() => {
    if (feelRef.current === feel) return;
    feelRef.current = feel;
    driverRef.current?.destroy();
    driverRef.current = null;
  }, [feel]);

  useEffect(() => {
    if (off) driverRef.current?.snap([0]);
  }, [off]);

  useEffect(
    () => () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    },
    [],
  );

  const fieldRef = useNearField<HTMLElement>({
    radius,
    cssVars: false,
    disabled: off,
    onFrame(frame) {
      const overlay = overlayRef.current;
      if (overlay === null) return;
      if (frame.proximity > 0) {
        overlay.style.setProperty("--nf-gx", `${frame.localX.toFixed(1)}px`);
        overlay.style.setProperty("--nf-gy", `${frame.localY.toFixed(1)}px`);
      }
      driver().set([frame.proximity]);
    },
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    onPointerDown?.(event);
    if (off || event.pointerType === "mouse") return;
    pressedRef.current = true;
    const overlay = overlayRef.current;
    if (overlay !== null) {
      overlay.style.setProperty("--nf-gx", "50%");
      overlay.style.setProperty("--nf-gy", "50%");
    }
    driver().set([PRESS_OPACITY]);
  };

  const release = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    driver().set([0]);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    onPointerUp?.(event);
    release();
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLElement>) => {
    onPointerCancel?.(event);
    release();
  };

  return (
    <Component
      ref={fieldRef}
      style={{ position: "relative", ...style }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      {...rest}
    >
      {children}
      <span
        ref={overlayRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          pointerEvents: "none",
          opacity: 0,
          background: `radial-gradient(${size}px circle at var(--nf-gx, 50%) var(--nf-gy, 50%), ${color}, transparent 70%)`,
        }}
      />
    </Component>
  );
}
