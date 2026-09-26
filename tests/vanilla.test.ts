// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { glow, magnetic, nearField, tilt } from "../src/vanilla";
import type { FieldFrame } from "../src/field";

let rafCallbacks: FrameRequestCallback[] = [];
let reducedMotion = false;

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

function press(el: HTMLElement, pointerType: string) {
  const event = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  el.dispatchEvent(event);
}

function release(el: HTMLElement) {
  el.dispatchEvent(new Event("pointerup", { bubbles: true }));
}

beforeEach(() => {
  rafCallbacks = [];
  reducedMotion = false;
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
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reducedMotion : true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

describe("nearField", () => {
  it("writes --nf custom properties and removes them on cleanup", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const cleanup = nearField(el, { radius: 100 });
    movePointer(90, 90);
    flushRaf();
    expect(el.style.getPropertyValue("--nf")).not.toBe("");
    expect(Number(el.style.getPropertyValue("--nf"))).toBeGreaterThan(0);
    expect(el.style.getPropertyValue("--nf-x")).not.toBe("");
    cleanup();
    expect(el.style.getPropertyValue("--nf")).toBe("");
    expect(el.style.getPropertyValue("--nf-x")).toBe("");
    expect(el.style.getPropertyValue("--nf-y")).toBe("");
  });

  it("skips vars with cssVars false but still calls onFrame", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const frames: FieldFrame[] = [];
    const cleanup = nearField(el, {
      radius: 100,
      cssVars: false,
      onFrame: (frame) => frames.push(frame),
    });
    movePointer(110, 110);
    flushRaf();
    expect(frames.at(-1)?.proximity).toBe(1);
    expect(el.style.getPropertyValue("--nf")).toBe("");
    cleanup();
  });

  it("stops emitting after cleanup", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const frames: FieldFrame[] = [];
    const cleanup = nearField(el, { radius: 100, onFrame: (frame) => frames.push(frame) });
    flushRaf();
    const count = frames.length;
    cleanup();
    movePointer(110, 110);
    flushRaf();
    expect(frames).toHaveLength(count);
  });
});

describe("magnetic", () => {
  it("pulls toward the pointer and restores the transform on cleanup", () => {
    const el = document.createElement("div");
    el.style.transform = "rotate(1deg)";
    stubRect(el, 100, 100, 50, 50);
    const cleanup = magnetic(el, { radius: 100, feel: "instant" });
    expect(el.style.willChange).toBe("transform");

    movePointer(160, 125);
    flushRaf();
    expect(el.style.transform).toContain("translate3d");
    expect(el.style.transform).not.toBe("rotate(1deg)");

    cleanup();
    expect(el.style.transform).toBe("rotate(1deg)");
    expect(el.style.willChange).toBe("");
  });

  it("degrades to a press scale for non-mouse pointers", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const cleanup = magnetic(el, { radius: 100, feel: "instant" });

    press(el, "touch");
    expect(el.style.transform).toContain("scale(0.9700)");
    release(el);
    expect(el.style.transform).toContain("scale(1.0000)");

    press(el, "mouse");
    expect(el.style.transform).toContain("scale(1.0000)");
    cleanup();
  });

  it("stays at rest under prefers-reduced-motion", () => {
    reducedMotion = true;
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const cleanup = magnetic(el, { radius: 100, feel: "instant" });
    movePointer(160, 125);
    flushRaf();
    expect(el.style.transform).toBe("");
    cleanup();
  });
});

describe("tilt", () => {
  it("rotates toward the pointer and restores the transform on cleanup", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const cleanup = tilt(el, { radius: 100, feel: "instant", perspective: 500 });

    movePointer(160, 125);
    flushRaf();
    expect(el.style.transform).toContain("perspective(500px)");
    expect(el.style.transform).toContain("rotateY(");

    cleanup();
    expect(el.style.transform).toBe("");
  });
});

describe("glow", () => {
  it("adds an overlay that brightens with proximity and removes it on cleanup", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const cleanup = glow(el, { radius: 100, feel: "instant" });

    const overlay = el.querySelector("span");
    expect(overlay).not.toBeNull();
    expect(el.style.position).toBe("relative");

    movePointer(125, 125);
    flushRaf();
    expect(Number(overlay?.style.opacity)).toBe(1);
    expect(overlay?.style.getPropertyValue("--nf-gx")).toBe("25.0px");

    movePointer(500, 500);
    flushRaf();
    expect(Number(overlay?.style.opacity)).toBe(0);

    cleanup();
    expect(el.querySelector("span")).toBeNull();
    expect(el.style.position).toBe("");
  });

  it("shows a centered glow while pressed on touch", () => {
    const el = document.createElement("div");
    stubRect(el, 100, 100, 50, 50);
    const cleanup = glow(el, { radius: 100, feel: "instant" });
    const overlay = el.querySelector("span");

    press(el, "touch");
    expect(overlay?.style.getPropertyValue("--nf-gx")).toBe("50%");
    expect(Number(overlay?.style.opacity)).toBeCloseTo(0.7, 4);
    release(el);
    expect(Number(overlay?.style.opacity)).toBe(0);
    cleanup();
  });
});
