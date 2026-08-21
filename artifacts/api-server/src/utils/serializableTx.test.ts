/**
 * Focused tests voor de serializable-transactiehelper: conflictclassificatie
 * en begrensd retrygedrag zonder echte database (geïnjecteerde runner).
 */
import { describe, it, expect } from "vitest";
import { isSerialisatieConflict, metSerializableTransactie, type Tx } from "./serializableTx";

const nepTx = {} as Tx;

describe("isSerialisatieConflict", () => {
  it("true voor 40001 (serialization_failure)", () => {
    expect(isSerialisatieConflict({ code: "40001" })).toBe(true);
  });

  it("true voor 40P01 (deadlock_detected)", () => {
    expect(isSerialisatieConflict({ code: "40P01" })).toBe(true);
  });

  it("false voor andere SQLSTATE-codes", () => {
    expect(isSerialisatieConflict({ code: "23505" })).toBe(false);
    expect(isSerialisatieConflict({ code: "42P01" })).toBe(false);
  });

  it("false voor niet-object / zonder code", () => {
    expect(isSerialisatieConflict(null)).toBe(false);
    expect(isSerialisatieConflict(undefined)).toBe(false);
    expect(isSerialisatieConflict(new Error("boom"))).toBe(false);
    expect(isSerialisatieConflict("40001")).toBe(false);
  });
});

describe("metSerializableTransactie — retrygedrag", () => {
  it("gebruikt altijd isolationLevel serializable", async () => {
    let gezien: string | null = null;
    const runner = async (cb: (tx: Tx) => Promise<number>, opts: { isolationLevel: "serializable" }) => {
      gezien = opts.isolationLevel;
      return cb(nepTx);
    };
    await metSerializableTransactie(async () => 1, 3, runner);
    expect(gezien).toBe("serializable");
  });

  it("succes bij eerste poging → geen retry", async () => {
    let pogingen = 0;
    const runner = async (cb: (tx: Tx) => Promise<string>) => {
      pogingen++;
      return cb(nepTx);
    };
    const r = await metSerializableTransactie(async () => "ok", 3, runner);
    expect(r).toBe("ok");
    expect(pogingen).toBe(1);
  });

  it("retry op 40001 en slaagt op tweede poging", async () => {
    let pogingen = 0;
    const runner = async (cb: (tx: Tx) => Promise<string>) => {
      pogingen++;
      if (pogingen === 1) {
        throw { code: "40001" };
      }
      return cb(nepTx);
    };
    const r = await metSerializableTransactie(async () => "ok", 3, runner);
    expect(r).toBe("ok");
    expect(pogingen).toBe(2);
  });

  it("retry op 40P01 tot maxPogingen, gooit daarna de laatste fout", async () => {
    let pogingen = 0;
    const runner = async () => {
      pogingen++;
      throw { code: "40P01" };
    };
    await expect(
      metSerializableTransactie(async () => "x", 3, runner),
    ).rejects.toMatchObject({ code: "40P01" });
    expect(pogingen).toBe(3);
  });

  it("gooit niet-conflictfouten meteen door zonder retry", async () => {
    let pogingen = 0;
    const runner = async () => {
      pogingen++;
      throw { code: "23505" };
    };
    await expect(
      metSerializableTransactie(async () => "x", 3, runner),
    ).rejects.toMatchObject({ code: "23505" });
    expect(pogingen).toBe(1);
  });
});
