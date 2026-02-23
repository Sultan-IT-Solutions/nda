export type GradeAverageMode = "journal" | "scale100"

export function formatAverage00(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const integer = value % 1 >= 0.5 ? Math.ceil(value) : Math.floor(value)
  return `${integer}.00`
}

export function formatAverage00OrEmpty(value: number | null | undefined): string {
  if (value === null || value === undefined) return ""
  return formatAverage00(value)
}

export function averageToInteger(value: number): number {
  return value % 1 >= 0.5 ? Math.ceil(value) : Math.floor(value)
}
