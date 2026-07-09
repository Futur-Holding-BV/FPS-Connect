# ─── Stage 1: Build ───────────────────────────────────────────────────────────
# node:24-slim (glibc): de workspace-overrides sluiten musl-natives uit (rollup/oxide),
# dus alpine (musl) kan de vite-build niet draaien; deploy/Dockerfile.* gebruikt ook slim
FROM node:24-slim AS builder
# Pin pnpm 10 (corepack zonder pin haalt pnpm 11 binnen, die faalt op ERR_PNPM_IGNORED_BUILDS)
RUN npm install -g pnpm@10.26.1
WORKDIR /workspace

# Kopieer workspace-configuratie
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.json tsconfig.base.json ./

# Kopieer gedeelde libraries (api-spec, api-client-react, permissies etc.)
COPY lib/ lib/

# Kopieer de firevault artifact
COPY artifacts/firevault/ artifacts/firevault/

# Installeer alle dependencies
RUN pnpm install --frozen-lockfile

# Bouw de frontend (statische bestanden naar dist/public/)
# PORT is vereist door vite.config.ts maar alleen voor de dev server
# BASE_PATH=/ voor een zelfstandige productie-deployment
RUN PORT=3000 BASE_PATH=/ NODE_ENV=production \
    pnpm --filter @workspace/firevault run build

# ─── Stage 2: Finale image (nginx) ────────────────────────────────────────────
FROM nginx:1.27-alpine
LABEL org.opencontainers.image.description="FPS Connect — webfrontend"

# Kopieer de statische bestanden
COPY --from=builder /workspace/artifacts/firevault/dist/public /usr/share/nginx/html

# Kopieer de nginx-configuratie
COPY artifacts/firevault/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1
