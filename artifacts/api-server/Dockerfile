# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
# Pin pnpm 10 (corepack zonder pin haalt pnpm 11 binnen, die faalt op ERR_PNPM_IGNORED_BUILDS)
RUN npm install -g pnpm@10.26.1
WORKDIR /workspace

# Kopieer workspace-configuratie
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.json tsconfig.base.json ./

# Kopieer gedeelde libraries
COPY lib/ lib/

# Kopieer de api-server artifact
COPY artifacts/api-server/ artifacts/api-server/

# Installeer alle dependencies (inclusief devDependencies voor de build)
RUN pnpm install --frozen-lockfile

# Bouw de api-server (esbuild bundelt alles behalve externals)
RUN pnpm --filter @workspace/api-server run build

# ─── Stage 2: Productie-dependencies ──────────────────────────────────────────
FROM node:24-alpine AS prod-deps
RUN npm install -g pnpm@10.26.1
WORKDIR /workspace

COPY --from=builder /workspace .

# Maak een standalone deployment met alleen runtime-dependencies
# --legacy: pnpm 10 vereist anders inject-workspace-packages=true (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE)
RUN pnpm --filter @workspace/api-server --prod deploy --legacy /deploy/api-server

# ─── Stage 3: Finale image ────────────────────────────────────────────────────
FROM node:24-alpine
# poppler-utils levert pdftoppm: nodig voor AI-vision op gescande PDF's.
RUN apk add --no-cache poppler-utils
WORKDIR /app

# Kopieer runtime-dependencies (sharp, @aws-sdk/*, nodemailer, etc.)
COPY --from=prod-deps /deploy/api-server/node_modules ./node_modules

# Kopieer de gebundelde applicatie
COPY --from=builder /workspace/artifacts/api-server/dist ./dist

ENV NODE_ENV=production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "dist/index.mjs"]
