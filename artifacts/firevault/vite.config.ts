import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const pkg = _require("./package.json") as { version: string };

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

  // In de Replit-omgeving (REPL_ID aanwezig) injecteert deze plugin een
  // <meta http-equiv="refresh"> als harde statische fallback.
  // Dit werkt ook als de JS-bundle niet laadt (kapotte build, netwerk).
  // In de VPS Docker-build is REPL_ID niet aanwezig → geen meta-tag → geen redirect.
  const injectReplitRedirectPlugin = process.env.REPL_ID !== undefined
    ? [{
        name: "inject-replit-redirect",
        transformIndexHtml(html: string) {
          return html.replace(
            "<head>",
            '<head>\n    <meta http-equiv="refresh" content="0; url=https://connect.fps-one.nl">',
          );
        },
      }]
    : [];

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...injectReplitRedirectPlugin,
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
