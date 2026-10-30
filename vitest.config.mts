import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": here("./src"),
      // Next.js guards server modules with this package; it is a no-op in tests.
      "server-only": here("./tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/server/services/**", "src/integration/**", "src/server/repo/memory.ts"],
      thresholds: { lines: 85, functions: 85, branches: 75 },
    },
  },
});
