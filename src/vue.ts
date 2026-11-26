// The Vue 3 adapter: a composable, four directives, and the three effects as
// components, all thin wrappers over the framework-free core. Import from
// "near-field/vue" so React never enters the bundle.

import {
  computed,
  defineComponent,
  getCurrentScope,
  h,
  onScopeDispose,
  shallowReadonly,
  shallowRef,
  toValue,
  watch,
  withDirectives,
  type Component,
  type ComponentPublicInstance,
  type DefineComponent,
  type Directive,
  type MaybeRefOrGetter,
  type PropType,
  type Ref,
  type VNodeArrayChildren,
} from "vue";
import { registerElement, type FieldFrame } from "./field";
import {
  attachGlow,
  glow,
  glowOverlayStyle,
  magnetic,
  tilt,
  type GlowOptions,
  type MagneticOptions,
  type TiltOptions,
} from "./internal/effects";
import { prefersReducedMotion, subscribeReducedMotion } from "./reduced-motion";
import type { Feel } from "./spring";

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
export type { GlowOptions, MagneticOptions, TiltOptions } from "./internal/effects";

export type NearFieldTarget = HTMLElement | ComponentPublicInstance | null | undefined;

export interface UseNearFieldOptions {
  /** Distance in px at which proximity begins. Default 140. */
  radius?: MaybeRefOrGetter<number>;
  /** Called on each field update with the raw frame data. */
  onFrame?: (frame: FieldFrame) => void;
  /** Write --nf, --nf-x, --nf-y custom properties on the element. Default true. */
  cssVars?: MaybeRefOrGetter<boolean>;
  /** Pause the field for this element. */
  disabled?: MaybeRefOrGetter<boolean>;
}

export interface NearFieldDirectiveOptions {
  radius?: number;
  onFrame?: (frame: FieldFrame) => void;
  cssVars?: boolean;
  disabled?: boolean;
}

const VAR_NAMES = ["--nf", "--nf-x", "--nf-y"] as const;

function resolveElement(target: MaybeRefOrGetter<NearFieldTarget>): HTMLElement | null {
  const value = toValue(target);
  if (value == null) return null;
  const node = ("$el" in value ? value.$el : value) as Node | null;
  return node != null && node.nodeType === 1 ? (node as HTMLElement) : null;
}

function bindField(el: HTMLElement, read: () => NearFieldDirectiveOptions): () => void {
  let varsWritten = false;
  const clearVars = () => {
    if (!varsWritten) return;
    varsWritten = false;
    for (const name of VAR_NAMES) el.style.removeProperty(name);
  };

  const unregister = registerElement(el, {
    getRadius: () => read().radius ?? 140,
    onFrame(frame) {
      const current = read();
      if (current.disabled) {
        clearVars();
        return;
      }
      if (current.cssVars !== false) {
        varsWritten = true;
        el.style.setProperty("--nf", frame.proximity.toFixed(4));
        el.style.setProperty("--nf-x", frame.vector.x.toFixed(4));
        el.style.setProperty("--nf-y", frame.vector.y.toFixed(4));
      }
      current.onFrame?.(frame);
    },
  });

  return () => {
    unregister();
    clearVars();
  };
}

/**
 * Expose cursor proximity on an element. Pass a template ref (an element or
 * a component instance) and the element carries --nf (eased 0..1 proximity)
 * plus --nf-x / --nf-y (unit vector from center toward the pointer) as CSS
 * custom properties. Options may be refs or getters and stay live. Nothing
 * is reactive per frame, so components never re-render. Returns a stop
 * function; it also stops when the calling scope is disposed.
 */
export function useNearField(
  target: MaybeRefOrGetter<NearFieldTarget>,
  options: UseNearFieldOptions = {},
): () => void {
  const read = (): NearFieldDirectiveOptions => ({
    radius: toValue(options.radius),
    cssVars: toValue(options.cssVars),
    disabled: toValue(options.disabled),
    onFrame: options.onFrame,
  });

  let cleanup: (() => void) | null = null;
  const stopWatch = watch(
    () => resolveElement(target),
    (el) => {
      cleanup?.();
      cleanup = el === null ? null : bindField(el, read);
    },
    { immediate: true, flush: "post" },
  );

  const stop = () => {
    stopWatch();
    cleanup?.();
    cleanup = null;
  };
  if (getCurrentScope()) onScopeDispose(stop);
  return stop;
}

/** Reactive prefers-reduced-motion. False on the server. */
export function usePrefersReducedMotion(): Readonly<Ref<boolean>> {
  const reduced = shallowRef(prefersReducedMotion());
  const unsubscribe = subscribeReducedMotion(() => {
    reduced.value = prefersReducedMotion();
  });
  if (getCurrentScope()) onScopeDispose(unsubscribe);
  return shallowReadonly(reduced);
}

/** v-near-field: the primitive as a directive. Options stay live. */
export const vNearField: Directive<HTMLElement, NearFieldDirectiveOptions | undefined> = (() => {
  const state = new WeakMap<HTMLElement, { options: NearFieldDirectiveOptions; stop(): void }>();
  return {
    mounted(el, { value }) {
      const entry = { options: value ?? {}, stop: () => {} };
      entry.stop = bindField(el, () => entry.options);
      state.set(el, entry);
    },
    updated(el, { value }) {
      const entry = state.get(el);
      if (entry) entry.options = value ?? {};
    },
    beforeUnmount(el) {
      state.get(el)?.stop();
      state.delete(el);
    },
  };
})();

interface EffectHandle {
  stop(): void;
  intact(): boolean;
}

function shallowEqual(a: object, b: object): boolean {
  const aKeys = Object.keys(a) as (keyof typeof a)[];
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => Object.is(a[key], b[key]));
}

function effectDirective<O extends object>(
  attach: (el: HTMLElement, options: O) => EffectHandle,
): Directive<HTMLElement, O | undefined> {
  const state = new WeakMap<HTMLElement, { options: O; handle: EffectHandle }>();
  const start = (el: HTMLElement, value: O | undefined) => {
    const options = { ...(value ?? {}) } as O;
    state.set(el, { options, handle: attach(el, options) });
  };
  return {
    mounted(el, { value }) {
      start(el, value);
    },
    updated(el, { value }) {
      const entry = state.get(el);
      if (entry && entry.handle.intact() && shallowEqual(entry.options, value ?? {})) return;
      entry?.handle.stop();
      start(el, value);
    },
    beforeUnmount(el) {
      state.get(el)?.handle.stop();
      state.delete(el);
    },
  };
}

const always = () => true;

/** v-magnetic: pulls the element toward the cursor. Same options as Magnetic. */
export const vMagnetic = effectDirective<MagneticOptions>((el, options) => ({
  stop: magnetic(el, options),
  intact: always,
}));

/** v-tilt: tilts the element toward the cursor. Same options as Tilt. */
export const vTilt = effectDirective<TiltOptions>((el, options) => ({
  stop: tilt(el, options),
  intact: always,
}));

/**
 * v-glow: appends a glow overlay to the element. Same options as Glow. If a
 * re-render replaces the element's children, the overlay is put back.
 */
export const vGlow = effectDirective<GlowOptions>((el, options) => {
  const stop = glow(el, options);
  const overlay = el.lastElementChild;
  return { stop, intact: () => overlay !== null && overlay.parentNode === el };
});

const asProp = {
  type: [String, Object, Function] as PropType<string | Component>,
};
const feelProp = {
  type: String as PropType<Feel>,
  default: "gentle" as Feel,
};

function render(
  as: string | Component,
  data: Record<string, unknown>,
  children: () => VNodeArrayChildren | undefined,
) {
  return typeof as === "string" ? h(as, data, children()) : h(as, data, { default: children });
}

export interface MagneticProps extends MagneticOptions {
  /** Element or component to render. Default "span". */
  as?: string | Component;
}

export interface TiltProps extends TiltOptions {
  /** Element or component to render. Default "div". */
  as?: string | Component;
}

export interface GlowProps extends GlowOptions {
  /** Element or component to render. Default "span". */
  as?: string | Component;
}

const MagneticImpl = defineComponent({
  name: "Magnetic",
  props: {
    /** Pull toward the cursor as a fraction of its offset. Default 0.3. */
    strength: { type: Number, default: 0.3 },
    /** Field radius in px. Default 140. */
    radius: { type: Number, default: 140 },
    /** Spring preset. Default "gentle". */
    feel: feelProp,
    /** Element or component to render. Default "span". */
    as: { ...asProp, default: "span" },
  },
  setup(props, { slots }) {
    return () =>
      withDirectives(
        render(props.as, { style: { display: "inline-block", willChange: "transform" } }, () =>
          slots.default?.(),
        ),
        [[vMagnetic, { strength: props.strength, radius: props.radius, feel: props.feel }]],
      );
  },
});

const TiltImpl = defineComponent({
  name: "Tilt",
  props: {
    /** Maximum tilt in degrees. Default 6. */
    max: { type: Number, default: 6 },
    /** Perspective depth in px. Default 800. */
    perspective: { type: Number, default: 800 },
    /** Field radius in px. Default 140. */
    radius: { type: Number, default: 140 },
    /** Spring preset. Default "gentle". */
    feel: feelProp,
    /** Element or component to render. Default "div". */
    as: { ...asProp, default: "div" },
  },
  setup(props, { slots }) {
    return () =>
      withDirectives(
        render(props.as, { style: { willChange: "transform" } }, () => slots.default?.()),
        [
          [
            vTilt,
            {
              max: props.max,
              perspective: props.perspective,
              radius: props.radius,
              feel: props.feel,
            },
          ],
        ],
      );
  },
});

const GlowImpl = defineComponent({
  name: "Glow",
  props: {
    /** Glow color. Default "rgba(255, 255, 255, 0.25)". */
    color: { type: String, default: "rgba(255, 255, 255, 0.25)" },
    /** Gradient radius in px. Default 160. */
    size: { type: Number, default: 160 },
    /** Field radius in px. Default 140. */
    radius: { type: Number, default: 140 },
    /** Spring preset for the fade. Default "gentle". */
    feel: feelProp,
    /**
     * Glow is opacity-only, so it may opt in to remain under
     * prefers-reduced-motion by setting this to false. Default true (hidden).
     */
    respectReducedMotion: { type: Boolean, default: true },
    /** Element or component to render. Default "span". */
    as: { ...asProp, default: "span" },
  },
  setup(props, { slots }) {
    const root = shallowRef<HTMLElement | ComponentPublicInstance | null>(null);
    const overlay = shallowRef<HTMLElement | null>(null);
    const overlayStyle = computed(() => glowOverlayStyle(props.color, props.size));

    watch(
      [
        () => resolveElement(root),
        overlay,
        overlayStyle,
        () => props.radius,
        () => props.feel,
        () => props.respectReducedMotion,
      ],
      ([el, overlayEl, , radius, feel, respectReducedMotion], _, onCleanup) => {
        if (el === null || overlayEl === null) return;
        onCleanup(attachGlow(el, overlayEl, { radius, feel, respectReducedMotion }));
      },
      { flush: "post" },
    );

    return () =>
      render(props.as, { ref: root, style: { position: "relative" } }, () => [
        slots.default?.(),
        h("span", { ref: overlay, "aria-hidden": "true", style: overlayStyle.value }),
      ]);
  },
});

/**
 * Pulls its content toward the cursor while it is within the field, and
 * springs back to rest when it leaves. Collapses to rest under
 * prefers-reduced-motion; degrades to a press scale on touch.
 */
export const Magnetic = MagneticImpl as DefineComponent<MagneticProps>;

/**
 * Tilts its content toward the cursor, eased in by proximity so the tilt
 * fades in before the pointer arrives. Collapses to rest under
 * prefers-reduced-motion; degrades to a press scale on touch.
 */
export const Tilt = TiltImpl as DefineComponent<TiltProps>;

/**
 * A soft light that tracks the cursor across the element and brightens with
 * proximity. On touch, shows a centered glow while pressed.
 */
export const Glow = GlowImpl as DefineComponent<GlowProps>;
