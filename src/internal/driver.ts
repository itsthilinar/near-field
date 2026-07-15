// Drives a small set of spring values toward targets on the shared rAF
// loop, calling apply() with the current values each frame. The "instant"
// feel skips springs entirely and applies targets synchronously.

import { addTick, removeTick } from "../loop";
import { createSpring, springPresets, type Feel, type Spring } from "../spring";

export interface Driver {
  set(targets: number[]): void;
  snap(values: number[]): void;
  destroy(): void;
}

export function createDriver(
  feel: Feel,
  initial: number[],
  apply: (values: number[]) => void,
): Driver {
  if (feel === "instant") {
    const values = [...initial];
    const write = (next: number[]) => {
      next.forEach((value, i) => {
        values[i] = value;
      });
      apply([...values]);
    };
    return { set: write, snap: write, destroy: () => {} };
  }

  const springs: Spring[] = initial.map((value) =>
    createSpring(springPresets[feel], value),
  );
  let ticking = false;

  const tick = (dtMs: number) => {
    let allSettled = true;
    for (const spring of springs) {
      if (!spring.step(dtMs)) allSettled = false;
    }
    apply(springs.map((spring) => spring.value));
    if (allSettled) stop();
  };

  const start = () => {
    if (ticking) return;
    ticking = true;
    addTick(tick);
  };

  const stop = () => {
    if (!ticking) return;
    ticking = false;
    removeTick(tick);
  };

  return {
    set(targets) {
      targets.forEach((target, i) => springs[i]?.setTarget(target));
      if (springs.some((spring) => !spring.settled())) start();
    },
    snap(values) {
      values.forEach((value, i) => springs[i]?.snap(value));
      stop();
      apply(springs.map((spring) => spring.value));
    },
    destroy: () => stop(),
  };
}
