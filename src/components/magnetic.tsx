import { useCallback, useEffect, useRef } from "react";
import type * as React from "react";
import { createDriver, type Driver } from "../internal/driver";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import type { Feel } from "../spring";
import { useNearField } from "../use-near-field";

export interface MagneticProps extends React.HTMLAttributes<HTMLElement> {
  /** Pull toward the cursor as a fraction of its offset. Default 0.3. */
  strength?: number;
  /** Field radius in px. Default 140. */
  radius?: number;
  /** Spring preset. Default "gentle". */
  feel?: Feel;
  /** Element to render. Default "span". */
  as?: React.ElementType;
}

const PRESS_SCALE = 0.97;

/**
 * Pulls its content toward the cursor while it is within the field, and
 * springs back to rest when it leaves. Collapses to rest under
 * prefers-reduced-motion; degrades to a press scale on touch.
 */
export function Magnetic(props: MagneticProps) {
  const {
    as: Component = "span",
    strength = 0.3,
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
  const pressedRef = useRef(false);
  const restingRef = useRef({ x: 0, y: 0 });

  const driver = useCallback(() => {
    if (driverRef.current === null) {
      driverRef.current = createDriver(
        feelRef.current,
        [0, 0, 1],
        ([x = 0, y = 0, scale = 1]) => {
          const el = elRef.current;
          if (el === null) return;
          el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
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
      const dx = frame.localX - frame.width / 2;
      const dy = frame.localY - frame.height / 2;
      const distance = Math.hypot(dx, dy);
      const pull = frame.proximity * strength * Math.min(distance, radius);
      const x = distance > 0 ? (dx / distance) * pull : 0;
      const y = distance > 0 ? (dy / distance) * pull : 0;
      restingRef.current = { x, y };
      driver().set([x, y, pressedRef.current ? PRESS_SCALE : 1]);
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
    const { x, y } = restingRef.current;
    driver().set([x, y, PRESS_SCALE]);
  };

  const release = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    const { x, y } = restingRef.current;
    driver().set([x, y, 1]);
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
      style={{ display: "inline-block", willChange: "transform", ...style }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      {...rest}
    >
      {children}
    </Component>
  );
}
