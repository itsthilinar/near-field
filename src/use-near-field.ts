import { useCallback, useRef } from "react";
import { registerElement, type FieldFrame } from "./field";

export interface UseNearFieldOptions {
  /** Distance in px at which proximity begins. Default 140. */
  radius?: number;
  /** Called on each field update with the raw frame data. */
  onFrame?: (frame: FieldFrame) => void;
  /** Write --nf, --nf-x, --nf-y custom properties on the element. Default true. */
  cssVars?: boolean;
  /** Pause the field for this element. */
  disabled?: boolean;
}

const VAR_NAMES = ["--nf", "--nf-x", "--nf-y"] as const;

/**
 * Expose cursor proximity on an element. Returns a callback ref; attach it
 * and the element carries --nf (eased 0..1 proximity) plus --nf-x / --nf-y
 * (unit vector from center toward the pointer) as CSS custom properties.
 * Zero re-renders: everything happens outside React's render cycle.
 */
export function useNearField<T extends HTMLElement = HTMLElement>(
  options: UseNearFieldOptions = {},
): (el: T | null) => void {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (el === null) return;

    let varsWritten = false;
    const clearVars = () => {
      if (!varsWritten) return;
      varsWritten = false;
      for (const name of VAR_NAMES) el.style.removeProperty(name);
    };

    const unregister = registerElement(el, {
      getRadius: () => optionsRef.current.radius ?? 140,
      onFrame(frame) {
        const current = optionsRef.current;
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

    cleanupRef.current = () => {
      unregister();
      clearVars();
    };
  }, []);
}
