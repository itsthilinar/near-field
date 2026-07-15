// The pointer field: a module-level singleton with one passive pointermove
// listener and one shared rAF flush. Elements register on mount; distances
// are computed against cached rects, refreshed via ResizeObserver and on
// scroll end, never per frame. Framework-free so a vanilla or Vue adapter
// stays possible without a rewrite.

import { addTick, removeTick } from "./loop";

export interface FieldVector {
  x: number;
  y: number;
}

export interface FieldFrame {
  /** Eased proximity: 0 outside the radius, 1 touching or inside the element. */
  proximity: number;
  /** Distance in px from the pointer to the nearest edge of the element (0 inside). */
  distance: number;
  /** Unit vector from the element center toward the pointer ({0,0} at dead center). */
  vector: FieldVector;
  /** Pointer position relative to the element's top-left corner, in px. */
  localX: number;
  localY: number;
  /** Cached element size in px. */
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function computeFrame(
  rect: Rect,
  radius: number,
  pointerX: number,
  pointerY: number,
): FieldFrame {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const dx = Math.max(rect.left - pointerX, 0, pointerX - right);
  const dy = Math.max(rect.top - pointerY, 0, pointerY - bottom);
  const distance = Math.hypot(dx, dy);
  const t =
    radius > 0 ? 1 - Math.min(distance / radius, 1) : distance === 0 ? 1 : 0;
  const proximity = t * t * (3 - 2 * t);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const vx = pointerX - cx;
  const vy = pointerY - cy;
  const length = Math.hypot(vx, vy);
  return {
    proximity,
    distance,
    vector: length > 0 ? { x: vx / length, y: vy / length } : { x: 0, y: 0 },
    localX: pointerX - rect.left,
    localY: pointerY - rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function restFrame(rect: Rect): FieldFrame {
  return {
    proximity: 0,
    distance: Infinity,
    vector: { x: 0, y: 0 },
    localX: rect.width / 2,
    localY: rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

const EMIT_EPSILON = 1e-4;

function frameChanged(a: FieldFrame | null, b: FieldFrame): boolean {
  if (a === null) return true;
  return (
    Math.abs(a.proximity - b.proximity) > EMIT_EPSILON ||
    Math.abs(a.vector.x - b.vector.x) > EMIT_EPSILON ||
    Math.abs(a.vector.y - b.vector.y) > EMIT_EPSILON ||
    Math.abs(a.localX - b.localX) > EMIT_EPSILON ||
    Math.abs(a.localY - b.localY) > EMIT_EPSILON
  );
}

export interface FieldEntryOptions {
  getRadius(): number;
  onFrame(frame: FieldFrame): void;
}

interface Entry extends FieldEntryOptions {
  el: HTMLElement;
  rect: Rect | null;
  last: FieldFrame | null;
}

const entries = new Set<Entry>();

let installed = false;
let pointerX = 0;
let pointerY = 0;
let pointerActive = false;
let dirty = false;
let resizeObserver: ResizeObserver | null = null;
let scrollTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * True when the device has a hover-capable fine pointer. There is no "near"
 * on a touchscreen, so the field never activates on coarse pointers.
 */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function markDirty(): void {
  if (dirty) return;
  dirty = true;
  addTick(flush);
}

function flush(): void {
  removeTick(flush);
  if (!dirty) return;
  dirty = false;
  for (const entry of entries) {
    if (entry.rect === null) {
      const r = entry.el.getBoundingClientRect();
      entry.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    const frame = pointerActive
      ? computeFrame(entry.rect, entry.getRadius(), pointerX, pointerY)
      : restFrame(entry.rect);
    if (frameChanged(entry.last, frame)) {
      entry.last = frame;
      entry.onFrame(frame);
    }
  }
}

function onPointerMove(event: PointerEvent): void {
  pointerX = event.clientX;
  pointerY = event.clientY;
  pointerActive = true;
  markDirty();
}

function onPointerGone(): void {
  pointerActive = false;
  markDirty();
}

function invalidateRects(): void {
  for (const entry of entries) entry.rect = null;
  markDirty();
}

function onScroll(): void {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(invalidateRects, 150);
}

function onScrollEnd(): void {
  clearTimeout(scrollTimer);
  invalidateRects();
}

function install(): void {
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointercancel", onPointerGone);
  window.addEventListener("blur", onPointerGone);
  document.addEventListener("pointerleave", onPointerGone);
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("scrollend", onScrollEnd, { capture: true });
  window.addEventListener("resize", onScroll);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver((observed) => {
      for (const item of observed) {
        for (const entry of entries) {
          if (entry.el === item.target) entry.rect = null;
        }
      }
      markDirty();
    });
  }
}

function uninstall(): void {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointercancel", onPointerGone);
  window.removeEventListener("blur", onPointerGone);
  document.removeEventListener("pointerleave", onPointerGone);
  window.removeEventListener("scroll", onScroll, { capture: true });
  window.removeEventListener("scrollend", onScrollEnd, { capture: true });
  window.removeEventListener("resize", onScroll);
  resizeObserver?.disconnect();
  resizeObserver = null;
  clearTimeout(scrollTimer);
  removeTick(flush);
  dirty = false;
}

/**
 * Register an element with the pointer field. Returns an unsubscribe
 * function. No-op (returns a noop) on the server and on coarse pointers.
 */
export function registerElement(
  el: HTMLElement,
  options: FieldEntryOptions,
): () => void {
  if (typeof window === "undefined" || !hasFinePointer()) return () => {};
  if (!installed) {
    install();
    installed = true;
  }
  const entry: Entry = {
    el,
    rect: null,
    last: null,
    getRadius: options.getRadius,
    onFrame: options.onFrame,
  };
  entries.add(entry);
  resizeObserver?.observe(el);
  markDirty();
  return () => {
    if (!entries.delete(entry)) return;
    let stillObserved = false;
    for (const other of entries) {
      if (other.el === el) stillObserved = true;
    }
    if (!stillObserved) resizeObserver?.unobserve(el);
    if (entries.size === 0 && installed) {
      uninstall();
      installed = false;
    }
  };
}
