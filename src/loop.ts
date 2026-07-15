// One shared requestAnimationFrame loop for the whole library. The pointer
// field and every animating spring subscribe here, so N effects never mean
// N rAF loops. The loop stops itself when nothing is subscribed.

export type Tick = (dtMs: number, now: number) => void;

const ticks = new Set<Tick>();
let rafId = 0;
let last = 0;

function frame(now: number) {
  rafId = 0;
  const dt = last > 0 ? Math.min(now - last, 64) : 1000 / 60;
  last = now;
  for (const tick of [...ticks]) tick(dt, now);
  if (ticks.size > 0) {
    rafId = requestAnimationFrame(frame);
  } else {
    last = 0;
  }
}

export function addTick(tick: Tick): void {
  ticks.add(tick);
  if (rafId === 0 && typeof requestAnimationFrame === "function") {
    last = 0;
    rafId = requestAnimationFrame(frame);
  }
}

export function removeTick(tick: Tick): void {
  ticks.delete(tick);
  if (ticks.size === 0 && rafId !== 0) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    last = 0;
  }
}
