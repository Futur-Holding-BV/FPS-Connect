export const MIN_DATUM_JAAR = 1900
export const MAX_DATUM_JAAR = 2100

export function parseYmd(value: string | null | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined

  const [jaarTekst, maandTekst, dagTekst] = value.split("-")
  const jaar = Number(jaarTekst)
  const maand = Number(maandTekst)
  const dag = Number(dagTekst)
  if (jaar < MIN_DATUM_JAAR || jaar > MAX_DATUM_JAAR) return undefined

  // setFullYear voorkomt de speciale JavaScript-betekenis van jaartallen 0–99.
  const datum = new Date(0)
  datum.setHours(0, 0, 0, 0)
  datum.setFullYear(jaar, maand - 1, dag)

  if (
    datum.getFullYear() !== jaar ||
    datum.getMonth() !== maand - 1 ||
    datum.getDate() !== dag
  ) {
    return undefined
  }

  return datum
}

export function formatYmd(datum: Date): string {
  if (!Number.isFinite(datum.getTime())) return ""

  const jaar = datum.getFullYear()
  if (jaar < MIN_DATUM_JAAR || jaar > MAX_DATUM_JAAR) return ""

  const maand = String(datum.getMonth() + 1).padStart(2, "0")
  const dag = String(datum.getDate()).padStart(2, "0")
  return `${String(jaar).padStart(4, "0")}-${maand}-${dag}`
}

export function isGeldigeYmd(value: unknown): value is string {
  return typeof value === "string" && parseYmd(value) !== undefined
}