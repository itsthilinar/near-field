import { describe, expect, it } from "vitest";
import { createSpring, springPresets } from "../src/spring";

describe("createSpring", () => {
  it("converges to the target and settles exactly on it", () => {
    const spring = createSpring(springPresets.gentle);
    spring.setTarget(100);
    let settled = false;
    for (let i = 0; i < 600 && !settled; i++) {
      settled = spring.step(1000 / 60);
    }
    expect(settled).toBe(true);
    expect(spring.value).toBe(100);
    expect(spring.velocity).toBe(0);
  });

  it("moves toward the target from the first frames", () => {
    const spring = createSpring(springPresets.snappy);
    spring.setTarget(50);
    spring.step(16);
    const first = spring.value;
    spring.step(16);
    expect(first).toBeGreaterThan(0);
    expect(spring.value).toBeGreaterThan(first);
    expect(spring.value).toBeLessThanOrEqual(50 * 1.05);
  });

  it("keeps overshoot small for both presets", () => {
    for (const preset of [springPresets.gentle, springPresets.snappy]) {
      const spring = createSpring(preset);
      spring.setTarget(100);
      let peak = 0;
      for (let i = 0; i < 600; i++) {
        spring.step(1000 / 60);
        peak = Math.max(peak, spring.value);
        if (spring.settled()) break;
      }
      expect(peak).toBeLessThan(105);
    }
  });

  it("snap jumps immediately and zeroes velocity", () => {
    const spring = createSpring(springPresets.gentle);
    spring.setTarget(100);
    spring.step(16);
    spring.snap(5);
    expect(spring.value).toBe(5);
    expect(spring.target).toBe(5);
    expect(spring.velocity).toBe(0);
    expect(spring.step(16)).toBe(true);
  });

  it("clamps huge frame deltas instead of exploding", () => {
    const spring = createSpring(springPresets.snappy);
    spring.setTarget(10);
    spring.step(5000);
    expect(Number.isFinite(spring.value)).toBe(true);
    expect(spring.value).toBeLessThan(20);
  });

  it("retargets mid-flight without discontinuity", () => {
    const spring = createSpring(springPresets.gentle);
    spring.setTarget(100);
    for (let i = 0; i < 5; i++) spring.step(16);
    const before = spring.value;
    spring.setTarget(0);
    spring.step(16);
    expect(Math.abs(spring.value - before)).toBeLessThan(20);
  });
});
