import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { limit } = vi.hoisted(() => ({
  limit: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const keten = {
    from: vi.fn(() => keten),
    where: vi.fn(() => keten),
    orderBy: vi.fn(() => keten),
    limit,
  };
  return {
    backupRecordsTable: {
      status: "backup-status",
      voltooidOp: "backup-voltooid-op",
    },
    mailLogboekTable: {
      status: "mail-status",
      aangemaaktOp: "mail-aangemaakt-op",
    },
    db: {
      select: vi.fn(() => keten),
      execute: vi.fn(),
    },
  };
});

vi.mock("@workspace/api-zod", () => ({
  HealthCheckResponse: { parse: vi.fn((waarde) => waarde) },
}));

import healthRouter from "./health.js";

const app = express();
app.use("/api", healthRouter);

let nasDir: string | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  process.env["GIT_COMMIT"] = "1234567890abcdef";
  process.env["BUILD_TIJD"] = "2026-08-21T10:00:00.000Z";
});

afterEach(async () => {
  delete process.env["OFFSITE_NAS_DIR"];
  if (nasDir) await rm(nasDir, { recursive: true, force: true });
  nasDir = null;
});

describe("GET /api/beheerstatus", () => {
  it("geeft uitsluitend allowlisted versie- en succesmomenten terug", async () => {
    const backupAt = new Date("2026-08-21T03:00:00.000Z");
    const mailAt = new Date("2026-08-21T09:30:00.000Z");
    const nasAt = "2026-08-21T04:15:00.000Z";
    limit
      .mockResolvedValueOnce([{ lastSuccessAt: backupAt }])
      .mockResolvedValueOnce([{ lastSuccessAt: mailAt }]);
    nasDir = await mkdtemp(join(tmpdir(), "fps-beheerstatus-"));
    process.env["OFFSITE_NAS_DIR"] = nasDir;
    await writeFile(join(nasDir, "laatste-verbinding"), `${nasAt}\n`);

    const response = await request(app).get("/api/beheerstatus").expect(200);

    expect(Object.keys(response.body).sort()).toEqual([
      "commit",
      "database_backup",
      "measured_at",
      "nas_pull",
      "outgoing_mail",
      "version",
    ]);
    expect(response.body.database_backup).toEqual({
      status: "ok",
      last_success_at: backupAt.toISOString(),
    });
    expect(response.body.nas_pull).toEqual({
      status: "ok",
      last_success_at: nasAt,
    });
    expect(response.body.outgoing_mail).toEqual({
      status: "ok",
      last_success_at: mailAt.toISOString(),
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /ontvanger|naar_email|onderwerp|inhoud|pad|secret|token|sleutel|foutdetail/i,
    );
  });

  it("meldt onbekende en foutieve bronnen zonder technische details", async () => {
    limit
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("database bevat gevoelige fouttekst"));
    nasDir = await mkdtemp(join(tmpdir(), "fps-beheerstatus-"));
    process.env["OFFSITE_NAS_DIR"] = nasDir;

    const response = await request(app).get("/api/beheerstatus").expect(200);

    expect(response.body.database_backup).toEqual({
      status: "unknown",
      last_success_at: null,
    });
    expect(response.body.nas_pull).toEqual({
      status: "error",
      last_success_at: null,
    });
    expect(response.body.outgoing_mail).toEqual({
      status: "error",
      last_success_at: null,
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "database bevat gevoelige fouttekst",
    );
  });
});