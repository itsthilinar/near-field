import { useSyncExternalStore } from "react";
import { prefersReducedMotion, subscribeReducedMotion } from "./reduced-motion";

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}
