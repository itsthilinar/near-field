// The vanilla adapter: the same field, springs, and effects with no React.
// Every function takes an element and returns a cleanup. Import from
// "near-field/vanilla" so React never enters the bundle.

import { registerElement, type FieldFrame } from "./field";
import { createDriver } from "./internal/driver";
import { prefersReducedMotion, subscribeReducedMotion } from "./reduced-motion";
import type { Feel } from "./spring";

export {
  computeFrame,
  hasFinePointer,
  registerElement,
  type FieldEntryOptions,
  type FieldFrame,
  type FieldVector,
  type Rect,
} from "./field";
export { createSpring, springPresets, type Feel, type Spring, type SpringConfig } from "./spring";
export { prefersReducedMotion, subscribeReducedMotion } from "./reduced-motion";

export interface NearFieldOptions {
  /** Distance in px at which proximity begins. Default 140. */
  radius?: number;
  /** Called on each field update with the raw frame data. */
  onFrame?: (frame: FieldFrame) => void;
  /** Write --nf, --nf-x, --nf-y custom properties on the element. Default true. */
  cssVars?: boolean;
}

const VAR_NAMES = ["--nf", "--nf-x", "--nf-y"] as const;

/**
 * Expose cursor proximity on an element. The element carries --nf (eased
 * 0..1 proximity) plus --nf-x / --nf-y (unit vector from center toward the
 * pointer) as CSS custom properties. Returns a cleanup that unregisters the
 * element and removes the properties.
 */
export function nearField(el: HTMLElement, options: NearFieldOptions = {}): () => void {
  const { radius = 140, onFrame, cssVars = true } = options;

  let varsWritten = false;
  const unregister = registerElement(el, {
    getRadius: () => radius,
    onFrame(frame) {
      if (cssVars) {
        varsWritten = true;
        el.style.setProperty("--nf", frame.proximity.toFixed(4));
        el.style.setProperty("--nf-x", frame.vector.x.toFixed(4));
        el.style.setProperty("--nf-y", frame.vector.y.toFixed(4));
      }
      onFrame?.(frame);
    },
  });

  return () => {
    unregister();
    if (!varsWritten) return;
    varsWritten = false;
    for (const name of VAR_NAMES) el.style.removeProperty(name);
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Touch press: fires down/release for non-mouse pointers only. */
function addPressListeners(
  el: HTMLElement,
  onDown: () => void,
  onRelease: () => void,
): () => void {
  let pressed = false;
  const down = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    pressed = true;
    onDown();
  };
  const release = () => {
    if (!pressed) return;
    pressed = false;
    onRelease();
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointerup", release);
    el.removeEventListener("pointercancel", release);
  };
}

export interface MagneticOptions {
  /** Pull toward the cursor as a fraction of its offset. Default 0.3. */
  strength?: number;
  /** Field radius in px. Default 140. */
  radius?: number;
  /** Spring preset. Default "gentle". */
  feel?: Feel;
}

const MAGNETIC_PRESS_SCALE = 0.97;

/**
 * Pulls the element toward the cursor while it is within the field, and
 * springs back to rest when it leaves. Collapses to rest under
 * prefers-reduced-motion; degrades to a press scale on touch. Returns a
 * cleanup that restores the element's inline transform.
 */
export function magnetic(el: HTMLElement, options: MagneticOptions = {}): () => void {
  const { strength = 0.3, radius = 140, feel = "gentle" } = options;

  const previousTransform = el.style.transform;
  const previousWillChange = el.style.willChange;
  el.style.willChange = "transform";

  const driver = createDriver(feel, [0, 0, 1], ([x = 0, y = 0, scale = 1]) => {
    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  });

  let reduced = prefersReducedMotion();
  const unsubscribeReduced = subscribeReducedMotion(() => {
    reduced = prefersReducedMotion();
    if (reduced) driver.snap([0, 0, 1]);
  });

  let pressed = false;
  const resting = { x: 0, y: 0 };

  const unregister = registerElement(el, {
    getRadius: () => radius,
    onFrame(frame) {
      if (reduced) return;
      const dx = frame.localX - frame.width / 2;
      const dy = frame.localY - frame.height / 2;
      const distance = Math.hypot(dx, dy);
      const pull = frame.proximity * strength * Math.min(distance, radius);
      resting.x = distance > 0 ? (dx / distance) * pull : 0;
      resting.y = distance > 0 ? (dy / distance) * pull : 0;
      driver.set([resting.x, resting.y, pressed ? MAGNETIC_PRESS_SCALE : 1]);
    },
  });

  const removePress = addPressListeners(
    el,
    () => {
      if (reduced) return;
      pressed = true;
      driver.set([resting.x, resting.y, MAGNETIC_PRESS_SCALE]);
    },
    () => {
      pressed = false;
      driver.set([resting.x, resting.y, 1]);
    },
  );

  return () => {
    unregister();
    removePress();
    unsubscribeReduced();
    driver.destroy();
    el.style.transform = previousTransform;
    el.style.willChange = previousWillChange;
  };
}

export interface TiltOptions {
  /** Maximum tilt in degrees. Default 6. */
  max?: number;
  /** Perspective depth in px. Default 800. */
  perspective?: number;
  /** Field radius in px. Default 140. */
  radius?: number;
  /** Spring preset. Default "gentle". */
  feel?: Feel;
}

const TILT_PRESS_SCALE = 0.98;

/**
 * Tilts the element toward the cursor, eased in by proximity so the tilt
 * fades in before the pointer arrives. Collapses to rest under
 * prefers-reduced-motion; degrades to a press scale on touch. Returns a
 * cleanup that restores the element's inline transform.
 */
export function tilt(el: HTMLElement, options: TiltOptions = {}): () => void {
  const { max = 6, perspective = 800, radius = 140, feel = "gentle" } = options;

  const previousTransform = el.style.transform;
  const previousWillChange = el.style.willChange;
  el.style.willChange = "transform";

  const driver = createDriver(feel, [0, 0, 1], ([rx = 0, ry = 0, scale = 1]) => {
    el.style.transform = `perspective(${perspective}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
  });

  let reduced = prefersReducedMotion();
  const unsubscribeReduced = subscribeReducedMotion(() => {
    reduced = prefersReducedMotion();
    if (reduced) driver.snap([0, 0, 1]);
  });

  let pressed = false;
  const resting = { rx: 0, ry: 0 };

  const unregister = registerElement(el, {
    getRadius: () => radius,
    onFrame(frame) {
      if (reduced) return;
      const nx =
        frame.width > 0 ? clamp(frame.localX / frame.width - 0.5, -0.5, 0.5) * 2 : 0;
      const ny =
        frame.height > 0 ? clamp(frame.localY / frame.height - 0.5, -0.5, 0.5) * 2 : 0;
      resting.rx = -ny * max * frame.proximity;
      resting.ry = nx * max * frame.proximity;
      driver.set([resting.rx, resting.ry, pressed ? TILT_PRESS_SCALE : 1]);
    },
  });

  const removePress = addPressListeners(
    el,
    () => {
      if (reduced) return;
      pressed = true;
      driver.set([resting.rx, resting.ry, TILT_PRESS_SCALE]);
    },
    () => {
      pressed = false;
      driver.set([resting.rx, resting.ry, 1]);
    },
  );

  return () => {
    unregister();
    removePress();
    unsubscribeReduced();
    driver.destroy();
    el.style.transform = previousTransform;
    el.style.willChange = previousWillChange;
  };
}

export interface GlowOptions {
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
}

const GLOW_PRESS_OPACITY = 0.7;

/**
 * A soft light that tracks the cursor across the element and brightens with
 * proximity. On touch, shows a centered glow while pressed. Appends an
 * overlay to the element; the cleanup removes it and restores the element's
 * inline position.
 */
export function glow(el: HTMLElement, options: GlowOptions = {}): () => void {
  const {
    color = "rgba(255, 255, 255, 0.25)",
    size = 160,
    radius = 140,
    feel = "gentle",
    respectReducedMotion = true,
  } = options;

  const previousPosition = el.style.position;
  const computedPosition =
    typeof getComputedStyle === "function" ? getComputedStyle(el).position : "";
  if (computedPosition === "static" || computedPosition === "") {
    el.style.position = "relative";
  }

  const overlay = document.createElement("span");
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    borderRadius: "inherit",
    pointerEvents: "none",
    opacity: "0",
    background: `radial-gradient(${size}px circle at var(--nf-gx, 50%) var(--nf-gy, 50%), ${color}, transparent 70%)`,
  });
  el.appendChild(overlay);

  const driver = createDriver(feel, [0], ([opacity = 0]) => {
    overlay.style.opacity = clamp(opacity, 0, 1).toFixed(4);
  });

  let reduced = prefersReducedMotion();
  const off = () => respectReducedMotion && reduced;
  const unsubscribeReduced = subscribeReducedMotion(() => {
    reduced = prefersReducedMotion();
    if (off()) driver.snap([0]);
  });

  const unregister = registerElement(el, {
    getRadius: () => radius,
    onFrame(frame) {
      if (off()) return;
      if (frame.proximity > 0) {
        overlay.style.setProperty("--nf-gx", `${frame.localX.toFixed(1)}px`);
        overlay.style.setProperty("--nf-gy", `${frame.localY.toFixed(1)}px`);
      }
      driver.set([frame.proximity]);
    },
  });

  const removePress = addPressListeners(
    el,
    () => {
      if (off()) return;
      overlay.style.setProperty("--nf-gx", "50%");
      overlay.style.setProperty("--nf-gy", "50%");
      driver.set([GLOW_PRESS_OPACITY]);
    },
    () => driver.set([0]),
  );

  return () => {
    unregister();
    removePress();
    unsubscribeReduced();
    driver.destroy();
    overlay.remove();
    el.style.position = previousPosition;
  };
}
