// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerElement, type FieldFrame } from "../src/field";

let rafCallbacks: FrameRequestCallback[] = [];

function flushRaf() {
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  for (const callback of callbacks) callback(performance.now());
}

function stubRect(el: HTMLElement, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function movePointer(x: number, y: number) {
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));
}

beforeEach(() => {
  rafCallbacks = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

describe("registerElement", () => {
  it("emits an initial rest frame on registration", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const frames: FieldFrame[] = [];
    const unregister = registerElement(el, {
      getRadius: () => 100,
      onFrame: (frame) => frames.push(frame),
    });
    flushRaf();
    expect(frames).toHaveLength(1);
    expect(frames[0]?.proximity).toBe(0);
    unregister();
  });

  it("emits frames on pointer movement and dedupes unchanged ones", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const frames: FieldFrame[] = [];
    const unregister = registerElement(el, {
      getRadius: () => 100,
      onFrame: (frame) => frames.push(frame),
    });
    flushRaf();

    movePointer(90, 90);
    flushRaf();
    expect(frames).toHaveLength(2);
    expect(frames[1]?.proximity).toBeGreaterThan(0);
    expect(frames[1]?.distance).toBeCloseTo(Math.hypot(10, 10), 6);

    movePointer(90, 90);
    flushRaf();
    expect(frames).toHaveLength(2);

    movePointer(500, 500, );
    flushRaf();
    expect(frames).toHaveLength(3);
    expect(frames[2]?.proximity).toBe(0);
    unregister();
  });

  it("coalesces multiple pointer moves into one frame per flush", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const frames: FieldFrame[] = [];
    const unregister = registerElement(el, {
      getRadius: () => 100,
      onFrame: (frame) => frames.push(frame),
    });
    flushRaf();

    movePointer(90, 90);
    movePointer(95, 95);
    movePointer(99, 99);
    flushRaf();
    expect(frames).toHaveLength(2);
    expect(frames[1]?.localX).toBe(-1);
    unregister();
  });

  it("emits a rest frame when the pointer leaves the document", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const frames: FieldFrame[] = [];
    const unregister = registerElement(el, {
      getRadius: () => 100,
      onFrame: (frame) => frames.push(frame),
    });
    flushRaf();
    movePointer(110, 110);
    flushRaf();
    expect(frames[1]?.proximity).toBe(1);

    document.dispatchEvent(new Event("pointerleave"));
    flushRaf();
    expect(frames).toHaveLength(3);
    expect(frames[2]?.proximity).toBe(0);
    unregister();
  });

  it("stops emitting after unregistering and tears down cleanly", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const frames: FieldFrame[] = [];
    const unregister = registerElement(el, {
      getRadius: () => 100,
      onFrame: (frame) => frames.push(frame),
    });
    flushRaf();
    unregister();

    movePointer(110, 110);
    flushRaf();
    expect(frames).toHaveLength(1);

    const el2 = document.createElement("div");
    stubRect(el2, 0, 0, 10, 10);
    const frames2: FieldFrame[] = [];
    const unregister2 = registerElement(el2, {
      getRadius: () => 100,
      onFrame: (frame) => frames2.push(frame),
    });
    movePointer(5, 5);
    flushRaf();
    expect(frames2.at(-1)?.proximity).toBe(1);
    expect(frames).toHaveLength(1);
    unregister2();
  });

  it("supports multiple subscribers on one shared field", () => {
    const near = document.createElement("div");
    const far = document.createElement("div");
    stubRect(near, 0, 0, 10, 10);
    stubRect(far, 1000, 1000, 10, 10);
    const nearFrames: FieldFrame[] = [];
    const farFrames: FieldFrame[] = [];
    const unregisterNear = registerElement(near, {
      getRadius: () => 100,
      onFrame: (frame) => nearFrames.push(frame),
    });
    const unregisterFar = registerElement(far, {
      getRadius: () => 100,
      onFrame: (frame) => farFrames.push(frame),
    });
    movePointer(20, 20);
    flushRaf();
    expect(nearFrames.at(-1)?.proximity).toBeGreaterThan(0);
    expect(farFrames.at(-1)?.proximity).toBe(0);
    unregisterNear();
    unregisterFar();
  });
});
