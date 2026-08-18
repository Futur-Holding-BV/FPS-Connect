import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["workspace"],
  },
  test: {
    include: [
      "lib/**/src/**/*.test.ts",
      "artifacts/**/src/**/*.test.ts",
    ],
    exclude: [
      // Dit bestand is een standalone tsx-script (geen vitest-suite).
      // Het heeft geen describe/it-blokken en is bedoeld om te draaien met:
      //   pnpm --filter @workspace/api-server exec tsx src/lib/wagenparkAfstootBeleid.test.ts
      "artifacts/api-server/src/lib/wagenparkAfstootBeleid.test.ts",
      // Standaard vitest-uitsluitingen
      "**/node_modules/**",
      "**/dist/**",
    ],
    // DATABASE_URL moet gezet zijn zodat lib/db/src/index.ts niet gooit bij
    // importeren. pg.Pool maakt pas een echte verbinding bij de eerste query;
    // alle tests die de database raken mocken db.insert/db.select via vi.spyOn,
    // dus er is nooit een echte verbinding nodig.
    env: {
      DATABASE_URL: "postgresql://localhost/test",
    },
  },
});
