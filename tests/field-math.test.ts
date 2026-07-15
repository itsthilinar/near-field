import { describe, expect, it } from "vitest";
import { computeFrame } from "../src/field";

const rect = { left: 100, top: 100, width: 200, height: 100 };
const radius = 140;

describe("computeFrame", () => {
  it("reports full proximity and zero distance inside the element", () => {
    const frame = computeFrame(rect, radius, 150, 150);
    expect(frame.distance).toBe(0);
    expect(frame.proximity).toBe(1);
  });

  it("reports zero proximity at and beyond the radius", () => {
    const atRadius = computeFrame(rect, radius, 300 + radius, 150);
    expect(atRadius.distance).toBe(radius);
    expect(atRadius.proximity).toBe(0);
    const beyond = computeFrame(rect, radius, 300 + radius + 50, 150);
    expect(beyond.proximity).toBe(0);
  });

  it("eases through 0.5 at the halfway point", () => {
    const frame = computeFrame(rect, radius, 300 + radius / 2, 150);
    expect(frame.distance).toBe(radius / 2);
    expect(frame.proximity).toBeCloseTo(0.5, 6);
  });

  it("increases monotonically as the pointer approaches", () => {
    let previous = -1;
    for (let d = radius; d >= 0; d -= 10) {
      const frame = computeFrame(rect, radius, 300 + d, 150);
      expect(frame.proximity).toBeGreaterThanOrEqual(previous);
      previous = frame.proximity;
    }
    expect(previous).toBe(1);
  });

  it("measures distance from the nearest edge, including corners", () => {
    const corner = computeFrame(rect, radius, 300 + 30, 200 + 40);
    expect(corner.distance).toBe(50);
  });

  it("returns a unit vector from center toward the pointer", () => {
    const east = computeFrame(rect, radius, 400, 150);
    expect(east.vector).toEqual({ x: 1, y: 0 });
    const diagonal = computeFrame(rect, radius, 300, 250);
    expect(Math.hypot(diagonal.vector.x, diagonal.vector.y)).toBeCloseTo(1, 9);
    expect(diagonal.vector.x).toBeGreaterThan(0);
    expect(diagonal.vector.y).toBeGreaterThan(0);
  });

  it("returns a zero vector at dead center", () => {
    const frame = computeFrame(rect, radius, 200, 150);
    expect(frame.vector).toEqual({ x: 0, y: 0 });
  });

  it("reports pointer position relative to the element", () => {
    const frame = computeFrame(rect, radius, 130, 190);
    expect(frame.localX).toBe(30);
    expect(frame.localY).toBe(90);
    expect(frame.width).toBe(200);
    expect(frame.height).toBe(100);
  });

  it("guards a zero radius", () => {
    expect(computeFrame(rect, 0, 150, 150).proximity).toBe(1);
    expect(computeFrame(rect, 0, 500, 150).proximity).toBe(0);
  });
});
