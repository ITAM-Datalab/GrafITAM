export const CORNER_RADIUS = 8
export const STATION_RADIUS = 3
export const TICK_LENGTH = 8
export const TICK_MARGIN = 10
export const MIN_TICKS = 2
export const MAX_TICKS = 9
export const RAIL_OFFSET = 3
export const SLEEPER_SPACING = 14

const MAX_OPACITY = 0.85
const MIN_OPACITY = 0.35
const LENGTH_SCALE = 3000

export interface Tick {
  x: number
  y1: number
  y2: number
}

export interface PrereqEdgeGeometry {
  path: string
  stationX: number
  stationY: number
  ticks: Tick[]
  length: number
}

/** Ruteo tipo "vía de tren": recto con ticks de crédito cuando source/target comparten
 * fila; H-V-H con esquinas redondeadas por el gutter de semestre (troncal fijo a la
 * mitad del primer gutter) cuando cruzan filas. Los ticks siempre viven en el primer
 * tramo horizontal, nunca sobre columnas intermedias en saltos de varios semestres. */
export function computePrereqEdgeGeometry(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  creditosOrigen: number,
  columnGap: number,
): PrereqEdgeGeometry {
  const length = Math.abs(targetX - sourceX) + Math.abs(targetY - sourceY)
  const sameRow = Math.abs(targetY - sourceY) < 0.5

  if (sameRow) {
    const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
    const tickZoneEnd = Math.min(sourceX + columnGap, targetX)
    return {
      path,
      stationX: sourceX,
      stationY: sourceY,
      ticks: buildTicks(sourceX, sourceY, tickZoneEnd, creditosOrigen),
      length,
    }
  }

  const dir = targetY > sourceY ? 1 : -1
  const trunkX = sourceX + columnGap / 2
  const r = Math.max(0, Math.min(CORNER_RADIUS, trunkX - sourceX, Math.abs(targetY - sourceY) / 2))

  const path = [
    `M ${sourceX} ${sourceY}`,
    `L ${trunkX - r} ${sourceY}`,
    `Q ${trunkX} ${sourceY} ${trunkX} ${sourceY + r * dir}`,
    `L ${trunkX} ${targetY - r * dir}`,
    `Q ${trunkX} ${targetY} ${trunkX + r} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(' ')

  return {
    path,
    stationX: sourceX,
    stationY: sourceY,
    ticks: buildTicks(sourceX, sourceY, trunkX - r, creditosOrigen),
    length,
  }
}

function buildTicks(startX: number, y: number, endX: number, creditos: number): Tick[] {
  const n = Math.min(MAX_TICKS, Math.max(MIN_TICKS, creditos))
  const zoneStart = startX + TICK_MARGIN
  const zoneEnd = endX - TICK_MARGIN
  if (zoneEnd <= zoneStart) return []

  const ticks: Tick[] = []
  for (let i = 0; i < n; i++) {
    const x = zoneStart + (i + 1) * ((zoneEnd - zoneStart) / (n + 1))
    ticks.push({ x, y1: y - TICK_LENGTH / 2, y2: y + TICK_LENGTH / 2 })
  }
  return ticks
}

/** Aristas más largas (más semestres de distancia) quedan más tenues, sin desaparecer del todo. */
export function computeLengthOpacity(length: number): number {
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, MAX_OPACITY - length / LENGTH_SCALE))
}

export interface CoreqRails {
  railA: string
  railB: string
  sleepers: string
}

/** "Riel doble + durmientes": dos líneas paralelas offset perpendicular al segmento
 * source→target, con travesaños entre ellas a intervalos regulares. */
export function computeCoreqRails(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): CoreqRails {
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * RAIL_OFFSET
  const ny = (dx / len) * RAIL_OFFSET

  const railA = `M ${sourceX + nx} ${sourceY + ny} L ${targetX + nx} ${targetY + ny}`
  const railB = `M ${sourceX - nx} ${sourceY - ny} L ${targetX - nx} ${targetY - ny}`

  const count = Math.max(2, Math.floor(len / SLEEPER_SPACING))
  const sleeperSegments: string[] = []
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1)
    const mx = sourceX + dx * t
    const my = sourceY + dy * t
    sleeperSegments.push(`M ${mx + nx} ${my + ny} L ${mx - nx} ${my - ny}`)
  }

  return { railA, railB, sleepers: sleeperSegments.join(' ') }
}
