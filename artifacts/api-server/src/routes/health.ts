import { execSync } from "node:child_process";
import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Versie-informatie wordt bij de productie-build in het image gebakken via de
// omgevingsvariabelen GIT_COMMIT en BUILD_TIJD (zie deploy/Dockerfile.api en
// scripts/deploy-production.sh). In dev vallen we terug op de lokale git.
function bepaalCommit(): string {
  if (process.env.GIT_COMMIT && process.env.GIT_COMMIT !== "onbekend") {
    return process.env.GIT_COMMIT;
  }
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "onbekend";
  }
}

const COMMIT = bepaalCommit();
const GEBOUWD_OP = process.env.BUILD_TIJD ?? "";
const VERSIE = `${
  GEBOUWD_OP ? GEBOUWD_OP.slice(0, 10).replaceAll("-", ".") : "dev"
}-${COMMIT}`;

router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/versie", (_req, res) => {
  res.json({ versie: VERSIE, commit: COMMIT, gebouwd_op: GEBOUWD_OP });
});

export default router;
