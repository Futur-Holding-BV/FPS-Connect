import { describe, expect, it } from "vitest"
import { formatYmd, isGeldigeYmd, parseYmd } from "./date-picker-ymd"

describe("DatePicker JJJJ-MM-DD omzetting", () => {
  it("behoudt geboortejaar en indienstjaar exact", () => {
    const geboorte = parseYmd("1987-02-03")
    const inDienst = parseYmd("2014-07-14")

    expect(geboorte?.getFullYear()).toBe(1987)
    expect(inDienst?.getFullYear()).toBe(2014)
    expect(geboorte && formatYmd(geboorte)).toBe("1987-02-03")
    expect(inDienst && formatYmd(inDienst)).toBe("2014-07-14")
  })

  it("weigert onzinjaren en onmogelijke kalenderdatums", () => {
    expect(parseYmd("82026-07-14")).toBeUndefined()
    expect(parseYmd("26-07-14")).toBeUndefined()
    expect(parseYmd("2026-02-30")).toBeUndefined()
    expect(isGeldigeYmd("2000-02-29")).toBe(true)
    expect(isGeldigeYmd("2101-01-01")).toBe(false)
  })

  it("formatteert het geselecteerde kalenderjaar met vier cijfers", () => {
    const datum = new Date(0)
    datum.setHours(0, 0, 0, 0)
    datum.setFullYear(1994, 10, 9)

    expect(formatYmd(datum)).toBe("1994-11-09")
  })
})