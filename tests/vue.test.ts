// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, withDirectives } from "vue";
import {
  Glow,
  Magnetic,
  Tilt,
  useNearField,
  usePrefersReducedMotion,
  vGlow,
  vMagnetic,
  vNearField,
} from "../src/vue";
import type { FieldFrame } from "../src/field";

let rafCallbacks: FrameRequestCallback[] = [];
let reducedMotion = false;
let wrappers: VueWrapper[] = [];

function flushRaf() {
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  for (const callback of callbacks) callback(performance.now());
}

function stubRects() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        left: 100,
        top: 100,
        width: 50,
        height: 50,
        right: 150,
        bottom: 150,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect,
  );
}

function movePointer(x: number, y: number) {
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));
}

function press(el: Element, pointerType: string) {
  const event = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  el.dispatchEvent(event);
}

function mountIt(component: Parameters<typeof mount>[0], options: Parameters<typeof mount>[1] = {}) {
  const wrapper = mount(component, { attachTo: document.body, ...options });
  wrappers.push(wrapper as VueWrapper);
  return wrapper;
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
  stubRects();
});

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers = [];
  vi.restoreAllMocks();
});

describe("useNearField", () => {
  it("writes --nf vars, survives re-renders, and cleans up on unmount", async () => {
    const count = ref(0);
    const wrapper = mountIt(
      defineComponent({
        setup() {
          const el = ref<HTMLElement | null>(null);
          useNearField(el, { radius: 100 });
          return () => h("div", { ref: el, style: { color: "red" } }, String(count.value));
        },
      }),
    );
    await nextTick();
    const el = wrapper.element as HTMLElement;
    movePointer(90, 90);
    flushRaf();
    expect(Number(el.style.getPropertyValue("--nf"))).toBeGreaterThan(0);
    const nf = el.style.getPropertyValue("--nf");

    count.value++;
    await nextTick();
    expect(el.textContent).toBe("1");
    expect(el.style.getPropertyValue("--nf")).toBe(nf);

    wrapper.unmount();
    wrappers = [];
    expect(el.style.getPropertyValue("--nf")).toBe("");
    movePointer(120, 120);
    flushRaf();
    expect(el.style.getPropertyValue("--nf")).toBe("");
  });

  it("reads ref options live and clears vars when disabled", async () => {
    const disabled = ref(false);
    const cssVars = ref(true);
    const frames: FieldFrame[] = [];
    const wrapper = mountIt(
      defineComponent({
        setup() {
          const el = ref<HTMLElement | null>(null);
          useNearField(el, { radius: 100, disabled, cssVars, onFrame: (f) => frames.push(f) });
          return () => h("div", { ref: el });
        },
      }),
    );
    await nextTick();
    const el = wrapper.element as HTMLElement;
    movePointer(110, 110);
    flushRaf();
    expect(el.style.getPropertyValue("--nf")).toBe("1.0000");
    expect(frames.at(-1)?.proximity).toBe(1);

    disabled.value = true;
    movePointer(120, 120);
    flushRaf();
    expect(el.style.getPropertyValue("--nf")).toBe("");
    const seen = frames.length;

    disabled.value = false;
    cssVars.value = false;
    movePointer(115, 115);
    flushRaf();
    expect(frames.length).toBe(seen + 1);
    expect(el.style.getPropertyValue("--nf")).toBe("");
  });

  it("follows the target through v-if and component refs", async () => {
    const show = ref(true);
    const Child = defineComponent({ setup: () => () => h("section") });
    const wrapper = mountIt(
      defineComponent({
        setup() {
          const child = ref(null);
          useNearField(child, { radius: 100 });
          return () => h("div", [show.value ? h(Child, { ref: child }) : null]);
        },
      }),
    );
    await nextTick();
    movePointer(110, 110);
    flushRaf();
    const first = wrapper.find("section").element as HTMLElement;
    expect(first.style.getPropertyValue("--nf")).toBe("1.0000");

    show.value = false;
    await nextTick();
    show.value = true;
    await nextTick();
    const second = wrapper.find("section").element as HTMLElement;
    expect(second).not.toBe(first);
    movePointer(111, 111);
    flushRaf();
    expect(second.style.getPropertyValue("--nf")).toBe("1.0000");
  });

  it("stops early when the returned stop is called", async () => {
    let stop = () => {};
    const wrapper = mountIt(
      defineComponent({
        setup() {
          const el = ref<HTMLElement | null>(null);
          stop = useNearField(el, { radius: 100 });
          return () => h("div", { ref: el });
        },
      }),
    );
    await nextTick();
    movePointer(110, 110);
    flushRaf();
    const el = wrapper.element as HTMLElement;
    expect(el.style.getPropertyValue("--nf")).not.toBe("");
    stop();
    expect(el.style.getPropertyValue("--nf")).toBe("");
  });
});

describe("directives", () => {
  it("v-near-field writes vars with live options", async () => {
    const cssVars = ref(true);
    const wrapper = mountIt(
      defineComponent({
        setup: () => () =>
          withDirectives(h("div"), [[vNearField, { radius: 100, cssVars: cssVars.value }]]),
      }),
    );
    const el = wrapper.element as HTMLElement;
    movePointer(110, 110);
    flushRaf();
    expect(el.style.getPropertyValue("--nf")).toBe("1.0000");

    wrapper.unmount();
    wrappers = [];
    expect(el.style.getPropertyValue("--nf")).toBe("");
  });

  it("v-magnetic keeps its spring across re-renders and re-attaches on option change", async () => {
    const count = ref(0);
    const strength = ref(0.3);
    const wrapper = mountIt(
      defineComponent({
        setup: () => () =>
          withDirectives(h("button", String(count.value)), [
            [vMagnetic, { strength: strength.value, radius: 100, feel: "instant" }],
          ]),
      }),
    );
    const el = wrapper.element as HTMLElement;
    movePointer(160, 125);
    flushRaf();
    const pulled = el.style.transform;
    expect(pulled).toContain("translate3d");

    count.value++;
    await nextTick();
    expect(el.style.transform).toBe(pulled);

    strength.value = 0.6;
    await nextTick();
    flushRaf();
    expect(el.style.transform).toContain("translate3d");
    expect(el.style.transform).not.toBe(pulled);

    wrapper.unmount();
    wrappers = [];
    expect(el.style.transform).toBe("");
  });

  it("v-glow puts its overlay back after Vue replaces the text", async () => {
    const label = ref("one");
    const wrapper = mountIt(
      defineComponent({
        setup: () => () =>
          withDirectives(h("button", label.value), [[vGlow, { radius: 100, feel: "instant" }]]),
      }),
    );
    const el = wrapper.element as HTMLElement;
    expect(el.querySelector("span")).not.toBeNull();

    label.value = "two";
    await nextTick();
    expect(el.textContent).toBe("two");
    const overlay = el.querySelector("span");
    expect(overlay).not.toBeNull();

    movePointer(125, 125);
    flushRaf();
    expect(Number(overlay?.style.opacity)).toBe(1);

    wrapper.unmount();
    wrappers = [];
    expect(el.querySelector("span")).toBeNull();
  });
});

describe("components", () => {
  it("Magnetic renders an inline-block span, pulls, and survives re-renders", async () => {
    const count = ref(0);
    const wrapper = mountIt(
      defineComponent({
        setup: () => () =>
          h(
            Magnetic,
            { radius: 100, feel: "instant", style: { color: "red" } },
            () => h("button", String(count.value)),
          ),
      }),
    );
    const el = wrapper.element as HTMLElement;
    expect(el.tagName).toBe("SPAN");
    expect(el.style.display).toBe("inline-block");
    expect(el.style.color).toBe("red");

    movePointer(160, 125);
    flushRaf();
    const pulled = el.style.transform;
    expect(pulled).toContain("translate3d");

    count.value++;
    await nextTick();
    expect(el.textContent).toBe("1");
    expect(el.style.transform).toBe(pulled);
  });

  it("Magnetic degrades to a press scale on touch and renders the as element", () => {
    const wrapper = mountIt(Magnetic, {
      props: { as: "a", feel: "instant" },
      slots: { default: () => "link" },
    });
    const el = wrapper.element as HTMLElement;
    expect(el.tagName).toBe("A");
    press(el, "touch");
    expect(el.style.transform).toContain("scale(0.9700)");
  });

  it("Magnetic stays at rest under prefers-reduced-motion", () => {
    reducedMotion = true;
    const wrapper = mountIt(Magnetic, { props: { radius: 100, feel: "instant" } });
    movePointer(160, 125);
    flushRaf();
    expect((wrapper.element as HTMLElement).style.transform).toBe("");
  });

  it("Tilt rotates toward the pointer with the given perspective", () => {
    const wrapper = mountIt(Tilt, { props: { radius: 100, feel: "instant", perspective: 500 } });
    const el = wrapper.element as HTMLElement;
    expect(el.tagName).toBe("DIV");
    movePointer(160, 125);
    flushRaf();
    expect(el.style.transform).toContain("perspective(500px)");
    expect(el.style.transform).toContain("rotateY(");
  });

  it("Glow renders its overlay last and keeps its opacity across re-renders", async () => {
    const count = ref(0);
    const wrapper = mountIt(
      defineComponent({
        setup: () => () =>
          h(Glow, { radius: 100, feel: "instant", color: "red" }, () => [
            h("p", String(count.value)),
          ]),
      }),
    );
    await nextTick();
    const el = wrapper.element as HTMLElement;
    expect(el.style.position).toBe("relative");
    const overlay = el.lastElementChild as HTMLElement;
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.style.background).toContain("red");

    movePointer(125, 125);
    flushRaf();
    expect(Number(overlay.style.opacity)).toBe(1);
    expect(overlay.style.getPropertyValue("--nf-gx")).toBe("25.0px");

    count.value++;
    await nextTick();
    expect(el.lastElementChild).toBe(overlay);
    expect(Number(overlay.style.opacity)).toBe(1);

    press(el, "touch");
    expect(Number(overlay.style.opacity)).toBeCloseTo(0.7, 4);
  });
});

describe("usePrefersReducedMotion", () => {
  it("reflects the media query", () => {
    reducedMotion = true;
    let value: boolean | undefined;
    mountIt(
      defineComponent({
        setup() {
          value = usePrefersReducedMotion().value;
          return () => h("div");
        },
      }),
    );
    expect(value).toBe(true);
  });
});

describe("templates", () => {
  it("compiles the documented directive and component syntax", () => {
    const wrapper = mountIt({
      components: { Magnetic, Glow },
      directives: { magnetic: vMagnetic, nearField: vNearField },
      template: `
        <div>
          <p v-near-field="{ radius: 100 }">field</p>
          <button v-magnetic="{ strength: 0.3, radius: 100, feel: 'instant' }">go</button>
          <Magnetic :strength="0.3" :radius="100" feel="instant"><b>m</b></Magnetic>
          <Glow color="red" :radius="100" feel="instant">g</Glow>
        </div>`,
    });
    movePointer(160, 125);
    flushRaf();
    const p = wrapper.find("p").element as HTMLElement;
    const button = wrapper.find("button").element as HTMLElement;
    const magneticSpan = wrapper.find("b").element.parentElement as HTMLElement;
    expect(p.style.getPropertyValue("--nf")).not.toBe("");
    expect(button.style.transform).toContain("translate3d");
    expect(magneticSpan.style.transform).toContain("translate3d");
    expect(wrapper.findAll("span[aria-hidden='true']")).toHaveLength(1);
  });
});
