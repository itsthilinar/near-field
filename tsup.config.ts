import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/vanilla.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  treeshake: true,
  external: ["react", "react/jsx-runtime"],
});
