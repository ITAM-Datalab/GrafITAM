import ExcelJS from 'exceljs'
import type { SavedSchedule, ScheduleData } from '../../types/schedule'
import { parseDias, parseHorario, groupSessions } from '../../algorithms/scheduleOverlap'
import { getCourseColor } from './coursePalette'

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA']
const DIA_LABELS: Record<string, string> = {
  LU: 'LUNES',
  MA: 'MARTES',
  MI: 'MIERCOLES',
  JU: 'JUEVES',
  VI: 'VIERNES',
  SA: 'SABADO',
}
const START_HOUR = 7
const END_HOUR = 22
const SLOT_MINUTES = 30
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES

const HEADER_ROW = 1
const FIRST_TIME_ROW = 2
const GRID_FIRST_COL = 2 // A = horas, B.. = días

const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } }

function hexToArgb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`
}

function formatMin(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeToSlot(minutes: number): number {
  return Math.round((minutes - START_HOUR * 60) / SLOT_MINUTES)
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, '-').slice(0, 31) || 'Horario'
}

function buildScheduleSheet(
  sheet: ExcelJS.Worksheet,
  schedule: SavedSchedule,
  groupsByCourse: ScheduleData,
  courseNames: Record<string, string>,
  orderedCourseIds: string[],
) {
  sheet.getColumn(1).width = 16
  for (let i = 0; i < DIAS.length; i++) {
    sheet.getColumn(GRID_FIRST_COL + i).width = 20
  }

  DIAS.forEach((dia, i) => {
    const cell = sheet.getCell(HEADER_ROW, GRID_FIRST_COL + i)
    cell.value = DIA_LABELS[dia]
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = HEADER_FILL
  })

  for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
    const row = FIRST_TIME_ROW + slot
    const startMin = START_HOUR * 60 + slot * SLOT_MINUTES
    const cell = sheet.getCell(row, 1)
    cell.value = `${formatMin(startMin)} - ${formatMin(startMin + SLOT_MINUTES)}`
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(row).height = 18
  }

  const selected = Object.entries(schedule.selectedGroups)
  const filledCells = new Set<string>()

  for (const [courseId, crn] of selected) {
    // Un CRN puede traer varias filas (teoría + laboratorio) -- dibujar todas.
    const rows = groupsByCourse[courseId]?.filter((g) => g.crn === crn) ?? []
    if (rows.length === 0) continue

    const nombre = courseNames[courseId] ?? rows[0].nombre
    const color = getCourseColor(courseId, orderedCourseIds)

    for (const session of groupSessions(rows)) {
      const dias = parseDias(session.dias)
      const { inicio, fin } = parseHorario(session.horario)
      const startSlot = Math.max(0, timeToSlot(inicio))
      const endSlot = Math.min(TOTAL_SLOTS, timeToSlot(fin))
      if (endSlot <= startSlot) continue

      for (const dia of dias) {
        const dayIndex = DIAS.indexOf(dia)
        if (dayIndex === -1) continue
        const col = GRID_FIRST_COL + dayIndex
        const topRow = FIRST_TIME_ROW + startSlot
        const bottomRow = FIRST_TIME_ROW + endSlot - 1

        // Si ya hay algo en ese rango (traslape sin resolver), se deja el primero que llegó.
        if (filledCells.has(`${topRow}-${col}`)) continue
        for (let r = topRow; r <= bottomRow; r++) filledCells.add(`${r}-${col}`)

        if (bottomRow > topRow) sheet.mergeCells(topRow, col, bottomRow, col)

        const cell = sheet.getCell(topRow, col)
        cell.value = `${courseId} ${nombre}\n${session.profesores.join(' / ')}\n${session.salon}`
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(color.bg) } }
        cell.font = { color: { argb: hexToArgb(color.text) } }
      }
    }
  }

  // Tabla lateral "Materia | CRNs | 2da Opción" (2da Opción se deja vacía, para llenar a mano).
  const tableCol = GRID_FIRST_COL + DIAS.length + 1
  ;['Materia', 'CRNs', '2da Opción'].forEach((label, i) => {
    const cell = sheet.getCell(HEADER_ROW, tableCol + i)
    cell.value = label
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = HEADER_FILL
  })
  sheet.getColumn(tableCol).width = 22
  sheet.getColumn(tableCol + 1).width = 12
  sheet.getColumn(tableCol + 2).width = 14

  selected.forEach(([courseId, crn], i) => {
    const row = FIRST_TIME_ROW + i
    sheet.getCell(row, tableCol).value = courseId
    sheet.getCell(row, tableCol + 1).value = crn
  })
}

export async function downloadScheduleWorkbook(
  schedules: SavedSchedule[],
  groupsByCourse: ScheduleData,
  courseNames: Record<string, string>,
  orderedCourseIds: string[],
  fileNameBase: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const usedNames = new Set<string>()

  for (const schedule of schedules) {
    let name = sanitizeSheetName(schedule.name)
    let suffix = 2
    while (usedNames.has(name)) {
      name = sanitizeSheetName(`${schedule.name} (${suffix})`)
      suffix++
    }
    usedNames.add(name)

    const sheet = workbook.addWorksheet(name)
    buildScheduleSheet(sheet, schedule, groupsByCourse, courseNames, orderedCourseIds)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileNameBase}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
