// The vanilla adapter: the same field, springs, and effects with no React.
// Every function takes an element and returns a cleanup. Import from
// "near-field/vanilla" so React never enters the bundle.

export {
  glow,
  magnetic,
  nearField,
  tilt,
  type GlowOptions,
  type MagneticOptions,
  type NearFieldOptions,
  type TiltOptions,
} from "./internal/effects";
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
