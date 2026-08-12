import { describe, expect, it } from 'vitest'
import { parseHorario, parseDias, groupsOverlap, groupByCrn, groupSessions } from './scheduleOverlap'
import type { ScheduleGroup } from '../types/schedule'

function group(overrides: Partial<ScheduleGroup>): ScheduleGroup {
  return {
    courseId: 'MAT-14101',
    crn: '2341',
    grupo: '001',
    nombre: 'CALCULO DIF. E INT., II',
    profesor: 'Prof.',
    horario: '09:00-10:30',
    dias: 'LU MI VI',
    salon: 'RH302',
    campus: 'RIO HONDO',
    ...overrides,
  }
}

describe('parseHorario', () => {
  it('convierte "09:00-10:30" a minutos desde medianoche', () => {
    expect(parseHorario('09:00-10:30')).toEqual({ inicio: 540, fin: 630 })
  })
})

describe('parseDias', () => {
  it('separa "LU MI VI" en tokens', () => {
    expect(parseDias('LU MI VI')).toEqual(['LU', 'MI', 'VI'])
  })
})

describe('groupsOverlap', () => {
  it('detecta traslape en el mismo día con rango de horas cruzado', () => {
    const a = group({ dias: 'LU MI VI', horario: '09:00-10:30' })
    const b = group({ courseId: 'COM-11302', crn: '9999', dias: 'LU', horario: '10:00-11:00' })
    expect(groupsOverlap(a, b)).toBe(true)
  })

  it('no hay traslape si los días no coinciden', () => {
    const a = group({ dias: 'LU MI VI', horario: '09:00-10:30' })
    const b = group({ courseId: 'COM-11302', crn: '9999', dias: 'MA JU', horario: '09:00-10:30' })
    expect(groupsOverlap(a, b)).toBe(false)
  })

  it('no hay traslape cuando un horario termina justo cuando empieza el otro', () => {
    const a = group({ dias: 'LU', horario: '09:00-10:30' })
    const b = group({ courseId: 'COM-11302', crn: '9999', dias: 'LU', horario: '10:30-12:00' })
    expect(groupsOverlap(a, b)).toBe(false)
  })
})

describe('groupByCrn', () => {
  it('agrupa varias filas con el mismo CRN (ej. teoría + laboratorio)', () => {
    const teoria = group({ crn: '2753', dias: 'LU MI', horario: '10:00-12:00' })
    const lab = group({ crn: '2753', dias: 'JU', horario: '07:00-09:00' })
    const otra = group({ courseId: 'COM-11302', crn: '9999' })

    const result = groupByCrn([teoria, lab, otra])

    expect(result.get('2753')).toEqual([teoria, lab])
    expect(result.get('9999')).toEqual([otra])
  })
})

describe('groupSessions', () => {
  it('junta varias filas con mismo horario/días en una sola sesión con todos los profesores', () => {
    const rows = [
      group({ crn: '2574', profesor: 'CECILIA MARIA ORTIZ AHLF' }),
      group({ crn: '2574', profesor: 'CLAUDIA NOEMI GONZALEZ BRAMBILA' }),
      group({ crn: '2574', profesor: 'MARIA DE LA CRUZ TORRES MANTECON' }),
    ]

    const sessions = groupSessions(rows)

    expect(sessions).toHaveLength(1)
    expect(sessions[0].profesores).toEqual([
      'CECILIA MARIA ORTIZ AHLF',
      'CLAUDIA NOEMI GONZALEZ BRAMBILA',
      'MARIA DE LA CRUZ TORRES MANTECON',
    ])
  })

  it('mantiene teoría y laboratorio como sesiones separadas (no regresiona #24)', () => {
    const teoria = group({ crn: '2753', dias: 'LU MI', horario: '10:00-12:00' })
    const lab = group({ crn: '2753', dias: 'JU', horario: '07:00-09:00' })

    const sessions = groupSessions([teoria, lab])

    expect(sessions).toHaveLength(2)
    expect(sessions[0].dias).toBe('LU MI')
    expect(sessions[1].dias).toBe('JU')
  })

  it('deduplica un profesor repetido en la misma sesión', () => {
    const rows = [group({ profesor: 'Prof. X' }), group({ profesor: 'Prof. X' })]

    expect(groupSessions(rows)[0].profesores).toEqual(['Prof. X'])
  })
})
