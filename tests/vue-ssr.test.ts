import { describe, expect, it } from "vitest";
import { createSSRApp, defineComponent, h, ref, withDirectives } from "vue";
import { renderToString } from "vue/server-renderer";
import { Glow, Magnetic, Tilt, useNearField, vGlow, vMagnetic, vNearField } from "../src/vue";

describe("vue adapter on the server", () => {
  it("imports and renders without a window", async () => {
    expect(typeof window).toBe("undefined");
    const App = defineComponent({
      setup() {
        const el = ref<HTMLElement | null>(null);
        useNearField(el);
        return () =>
          h("main", { ref: el }, [
            withDirectives(h("div"), [[vNearField, {}]]),
            withDirectives(h("button"), [[vMagnetic, {}]]),
            withDirectives(h("button"), [[vGlow, {}]]),
            h(Magnetic, null, () => "m"),
            h(Tilt, null, () => "t"),
            h(Glow, null, () => "g"),
          ]);
      },
    });
    const html = await renderToString(createSSRApp(App));
    expect(html).toContain("display:inline-block");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("opacity:0");
  });
});
