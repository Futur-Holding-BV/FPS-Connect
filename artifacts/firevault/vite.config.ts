import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const pkg = _require("./package.json") as { version: string };

// Vervangt de __SW_VERSIE__-placeholder in de serviceworker automatisch door
// een hash van de gebouwde bundel. Zo krijgt elke release vanzelf een nieuwe
// cachenaam (en ruimt de serviceworker oude caches op) zonder dat iemand het
// versienummer met de hand hoeft op te hogen.
function swVersiePlugin(): Plugin {
  let bundelHash = "";
  return {
    name: "sw-versie",
    apply: "build",
    generateBundle(_opts, bundle) {
      // De bestandsnamen van de chunks bevatten al content-hashes van Vite;
      // een hash over de gesorteerde namen verandert dus bij elke wijziging
      // in de gebouwde code en blijft gelijk bij een identieke build.
      bundelHash = createHash("sha256")
        .update(Object.keys(bundle).sort().join("|"))
        .digest("hex")
        .slice(0, 12);
    },
    closeBundle() {
      const swPad = path.resolve(
        import.meta.dirname,
        "dist/public/sw.js",
      );
      if (!existsSync(swPad)) {
        throw new Error(
          "sw-versie plugin: dist/public/sw.js niet gevonden na build.",
        );
      }
      const inhoud = readFileSync(swPad, "utf8");
      if (!inhoud.includes("__SW_VERSIE__")) {
        throw new Error(
          "sw-versie plugin: placeholder __SW_VERSIE__ ontbreekt in sw.js.",
        );
      }
      const versie = bundelHash || Date.now().toString(36);
      writeFileSync(swPad, inhoud.replaceAll("__SW_VERSIE__", versie));
    },
  };
}

export default defineConfig(async ({ command }) => {
  const isBuild = command === "build";

  // PORT is alleen nodig voor de dev-server en preview — niet tijdens build.
  let port = 3000;
  if (!isBuild) {
    const rawPort = process.env.PORT;
    if (!rawPort) {
      throw new Error(
        "PORT environment variable is required but was not provided.",
      );
    }
    const parsed = Number(rawPort);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
    port = parsed;
  }

  // BASE_PATH: in productie serveert Caddy de frontend vanaf root (/),
  // dus een lege of ontbrekende variabele valt terug op "/".
  const basePath = process.env.BASE_PATH ?? "/";

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      swVersiePlugin(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(
          import.meta.dirname,
          "..",
          "..",
          "attached_assets",
        ),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_DATE__: JSON.stringify(
        new Date().toLocaleDateString("nl-NL", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      ),
    },
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
      // Lokale ontwikkeling (bv. Windows) heeft geen gedeelde reverse proxy
      // die /api naar de API-server doorstuurt zoals in Replit. Zonder deze
      // proxy valt Vite's dev-server terug op de SPA-fallback (200 + HTML)
      // voor /api-verzoeken, wat stroomafwaarts tot rare runtime-fouten leidt.
      ...(process.env.REPL_ID === undefined
        ? {
            proxy: {
              "/api": {
                target: "http://localhost:8080",
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
