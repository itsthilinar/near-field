# near-field

Cursor proximity as a CSS input.

[Demo site](https://project-near-field.vercel.app/) · [Lab](https://project-near-field.vercel.app/lab) · [npm](https://www.npmjs.com/package/near-field)

Hover is binary. CSS has nothing between "not hovering" and "hovering", so every effect either snaps on or stays off. near-field provides the continuum: one tiny import exposes how close the pointer is to an element as CSS custom properties, and ships three pre-tuned effects built on that primitive.

- `--nf`: eased proximity, 0 far away to 1 touching the element
- `--nf-x`, `--nf-y`: unit vector from the element center toward the pointer
- Zero re-renders. The field writes styles outside React's render cycle.
- One pointer listener and one rAF loop total, no matter how many elements subscribe.
- Core is about 1.5KB min+gzip; the whole package with all three components is about 3.5KB. No dependencies.

```bash
npm install near-field
```

## The primitive

`useNearField` returns a callback ref. Attach it, and the element carries the custom properties. Your CSS decides what proximity means.

```tsx
import { useNearField } from "near-field";

function Card() {
  const ref = useNearField({ radius: 140 });
  return <div ref={ref} className="card">...</div>;
}
```

```css
.card {
  /* drift 8px toward the cursor as it approaches */
  transform: translate(
    calc(var(--nf-x) * var(--nf) * 8px),
    calc(var(--nf-y) * var(--nf) * 8px)
  );
}

.card .accent {
  /* or fade something in with proximity */
  opacity: var(--nf);
}
```

### Callback mode

For effects CSS can't express, read the raw frame instead:

```tsx
const ref = useNearField({
  radius: 200,
  onFrame: ({ proximity, vector, distance, localX, localY }) => {
    // drive a canvas, WebGL uniform, SVG filter, whatever
  },
});
```

### `useNearField(options)`

| Option     | Type                          | Default | Meaning                                              |
| ---------- | ----------------------------- | ------- | ---------------------------------------------------- |
| `radius`   | `number`                      | `140`   | Distance in px at which proximity begins             |
| `onFrame`  | `(frame: FieldFrame) => void` |         | Called on each field update                          |
| `cssVars`  | `boolean`                     | `true`  | Write `--nf`, `--nf-x`, `--nf-y` on the element      |
| `disabled` | `boolean`                     | `false` | Pause the field for this element                     |

The frame: `proximity` (eased 0..1), `distance` (px from the nearest edge, 0 inside), `vector` (unit vector from center toward the pointer), `localX` / `localY` (pointer position relative to the element), `width` / `height` (cached element size).

## Packaged components

Three effects with the feel already tuned. Pick a preset instead of turning physics knobs: `feel="gentle" | "snappy" | "instant"`.

```tsx
import { Magnetic, Tilt, Glow } from "near-field";

<Magnetic strength={0.3}>
  <button>Get started</button>
</Magnetic>

<Tilt max={6}>
  <img src="/cover.png" alt="" />
</Tilt>

<Glow color="rgba(120, 170, 255, 0.3)">
  <div className="card">...</div>
</Glow>
```

**`<Magnetic>`** pulls its content toward the cursor inside the field and springs back when it leaves. Props: `strength` (0..1, default `0.3`), `radius`, `feel`, `as`.

**`<Tilt>`** tilts toward the cursor, eased in by proximity so the tilt fades in before the pointer arrives. Props: `max` (degrees, default `6`), `perspective` (default `800`), `radius`, `feel`, `as`.

**`<Glow>`** is a soft light that tracks the cursor across the element and brightens with proximity. Props: `color`, `size` (gradient radius, default `160`), `radius`, `feel`, `respectReducedMotion`, `as`.

All three render a wrapper element (`span` for Magnetic and Glow, `div` for Tilt; change it with `as`) and pass through arbitrary HTML attributes.

## Input handling, by design

- **Reduced motion**: positional effects (Magnetic, Tilt) collapse to rest under `prefers-reduced-motion`. Glow is opacity-only, so it may opt in to remain with `respectReducedMotion={false}`.
- **Touch and coarse pointers**: there is no "near" on a touchscreen, so the field never activates. The packaged components degrade to a tuned press state instead.
- **SSR-safe**: nothing touches `window` at import time. Works with React 18 and 19.

## How it works

One module-level pointer field: a single passive `pointermove` listener and a single shared `requestAnimationFrame` loop, shared by every subscribed element and every animating spring. Elements register on mount; distances are computed against cached rects, refreshed via `ResizeObserver` and on scroll end, never per frame. Proximity is measured from the nearest edge of the element (not the center), smoothstep-eased over the radius.

Springs are a ~30 line semi-implicit Euler integrator running at a fixed 120Hz substep, so the feel is identical across display refresh rates. No animation library dependency.

The field and spring are framework-free internally; the React layer is a thin adapter, which leaves room for vanilla or Vue adapters later.

## License

MIT
