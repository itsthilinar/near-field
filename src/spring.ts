// Semi-implicit Euler spring integrator. Framework-free, zero dependencies.
// Integrates at a fixed 120Hz substep so behavior is identical across
// display refresh rates.

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass?: number;
}

export type Feel = "gentle" | "snappy" | "instant";

export const springPresets: Record<Exclude<Feel, "instant">, SpringConfig> = {
  gentle: { stiffness: 170, damping: 24 },
  snappy: { stiffness: 340, damping: 30 },
};

const STEP_MS = 1000 / 120;
const MAX_DT_MS = 64;
const REST_DELTA = 0.01;
const REST_SPEED = 0.01;

export interface Spring {
  value: number;
  velocity: number;
  target: number;
  setTarget(target: number): void;
  /** Jump straight to a value, zeroing velocity. */
  snap(value: number): void;
  /** Advance by dtMs. Returns true once settled on the target. */
  step(dtMs: number): boolean;
  settled(): boolean;
}

export function createSpring(config: SpringConfig, initial = 0): Spring {
  const { stiffness, damping } = config;
  const mass = config.mass ?? 1;
  let carry = 0;

  const spring: Spring = {
    value: initial,
    velocity: 0,
    target: initial,
    setTarget(target) {
      spring.target = target;
    },
    snap(value) {
      spring.value = value;
      spring.target = value;
      spring.velocity = 0;
      carry = 0;
    },
    settled() {
      return (
        Math.abs(spring.value - spring.target) < REST_DELTA &&
        Math.abs(spring.velocity) < REST_SPEED
      );
    },
    step(dtMs) {
      if (spring.settled()) {
        spring.value = spring.target;
        spring.velocity = 0;
        carry = 0;
        return true;
      }
      carry += Math.min(dtMs, MAX_DT_MS);
      const h = STEP_MS / 1000;
      while (carry >= STEP_MS) {
        carry -= STEP_MS;
        const acceleration =
          (-stiffness * (spring.value - spring.target) - damping * spring.velocity) / mass;
        spring.velocity += acceleration * h;
        spring.value += spring.velocity * h;
      }
      if (spring.settled()) {
        spring.value = spring.target;
        spring.velocity = 0;
        carry = 0;
        return true;
      }
      return false;
    },
  };

  return spring;
}
