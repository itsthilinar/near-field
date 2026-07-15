import { useCallback, useEffect, useRef } from "react";
import type * as React from "react";
import { createDriver, type Driver } from "../internal/driver";
import { usePrefersReducedMotion } from "../reduced-motion";
import type { Feel } from "../spring";
import { useNearField } from "../use-near-field";

export interface TiltProps extends React.HTMLAttributes<HTMLElement> {
  /** Maximum tilt in degrees. Default 6. */
  max?: number;
  /** Perspective depth in px. Default 800. */
  perspective?: number;
  /** Field radius in px. Default 140. */
  radius?: number;
  /** Spring preset. Default "gentle". */
  feel?: Feel;
  /** Element to render. Default "div". */
  as?: React.ElementType;
}

const PRESS_SCALE = 0.98;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Tilts its content toward the cursor, eased in by proximity so the tilt
 * fades in before the pointer arrives. Collapses to rest under
 * prefers-reduced-motion; degrades to a press scale on touch.
 */
export function Tilt(props: TiltProps) {
  const {
    as: Component = "div",
    max = 6,
    perspective = 800,
    radius = 140,
    feel = "gentle",
    style,
    children,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    ...rest
  } = props;

  const reduced = usePrefersReducedMotion();
  const elRef = useRef<HTMLElement | null>(null);
  const driverRef = useRef<Driver | null>(null);
  const feelRef = useRef(feel);
  const perspectiveRef = useRef(perspective);
  perspectiveRef.current = perspective;
  const pressedRef = useRef(false);
  const restingRef = useRef({ rx: 0, ry: 0 });

  const driver = useCallback(() => {
    if (driverRef.current === null) {
      driverRef.current = createDriver(
        feelRef.current,
        [0, 0, 1],
        ([rx = 0, ry = 0, scale = 1]) => {
          const el = elRef.current;
          if (el === null) return;
          el.style.transform = `perspective(${perspectiveRef.current}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
        },
      );
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
    if (reduced) driverRef.current?.snap([0, 0, 1]);
  }, [reduced]);

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
    disabled: reduced,
    onFrame(frame) {
      const nx =
        frame.width > 0 ? clamp(frame.localX / frame.width - 0.5, -0.5, 0.5) * 2 : 0;
      const ny =
        frame.height > 0 ? clamp(frame.localY / frame.height - 0.5, -0.5, 0.5) * 2 : 0;
      const rx = -ny * max * frame.proximity;
      const ry = nx * max * frame.proximity;
      restingRef.current = { rx, ry };
      driver().set([rx, ry, pressedRef.current ? PRESS_SCALE : 1]);
    },
  });

  const setRef = useCallback(
    (el: HTMLElement | null) => {
      elRef.current = el;
      fieldRef(el);
    },
    [fieldRef],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    onPointerDown?.(event);
    if (reduced || event.pointerType === "mouse") return;
    pressedRef.current = true;
    const { rx, ry } = restingRef.current;
    driver().set([rx, ry, PRESS_SCALE]);
  };

  const release = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    const { rx, ry } = restingRef.current;
    driver().set([rx, ry, 1]);
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
      ref={setRef}
      style={{ willChange: "transform", ...style }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      {...rest}
    >
      {children}
    </Component>
  );
}
