import { useMemo, useState } from 'react'
import { allPlanMetas, buildPlanFilename, programNames, planGenerations } from '../data/planIndex'
import type { PlanMeta } from '../types/curriculum'
import { trackEvent } from '../lib/analytics'

interface Props {
  onSelect: (meta: PlanMeta) => void
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

const GROUP_SPLIT_RE = /\s*,\s*|\s+y\s+|\s+e\s+/i

function splitGroups(query: string): string[][] {
  return query
    .split(GROUP_SPLIT_RE)
    .map((part) => fold(part).trim().split(/\s+/).filter(Boolean))
    .filter((tokens) => tokens.length > 0)
}

function haystackFor(meta: PlanMeta): string {
  return fold(
    [
      meta.program,
      meta.letter,
      meta.area ?? '',
      programNames[meta.program] ?? '',
      planGenerations[`${meta.program}-${meta.letter}`] ?? '',
    ].join(' '),
  )
}

// Reordena para que generaciones/áreas del mismo programa (ej. las 23
// variantes letra×área de ECO) no acaparen el principio de la lista antes
// de que aparezca un programa distinto (ej. ERI) — una ronda por programa,
// preservando el orden relativo original dentro de cada uno.
function diversifyByProgram(metas: PlanMeta[]): PlanMeta[] {
  const byProgram = new Map<string, PlanMeta[]>()
  for (const m of metas) {
    const bucket = byProgram.get(m.program)
    if (bucket) bucket.push(m)
    else byProgram.set(m.program, [m])
  }
  const buckets = [...byProgram.values()]
  const out: PlanMeta[] = []
  for (let round = 0; out.length < metas.length; round++) {
    let progress = false
    for (const bucket of buckets) {
      if (round < bucket.length) {
        out.push(bucket[round])
        progress = true
      }
    }
    if (!progress) break
  }
  return out
}

export default function PlanSearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const groups = splitGroups(query)
    if (groups.length === 0) return []

    const groupLists = groups.map((tokens) =>
      diversifyByProgram(allPlanMetas.filter((m) => tokens.every((t) => haystackFor(m).includes(t)))),
    )

    const out: PlanMeta[] = []
    const seen = new Set<string>()

    // Con más de un grupo (query compuesta, ej. "Economía y Relaciones
    // Internacionales"), los planes que matchean TODOS los grupos van primero.
    if (groups.length > 1) {
      const fullMatches = diversifyByProgram(
        allPlanMetas.filter((meta) => groupLists.every((list) => list.includes(meta))),
      )
      for (const meta of fullMatches) {
        out.push(meta)
        seen.add(meta.filename)
      }
    }

    // Round-robin entre grupos (no sort-by-score): un plan que solo matchea
    // un grupo (ej. RI matcheando solo "Relaciones Internacionales") no debe
    // quedar enterrado detrás de decenas de planes que matchean el otro
    // grupo (ej. todos los que contienen "Economía"). Sin límite de
    // resultados — la lista completa se muestra, la `<ul>` ya hace scroll.
    const idx = groupLists.map(() => 0)
    let progress = true
    while (progress) {
      progress = false
      for (let gi = 0; gi < groupLists.length; gi++) {
        const list = groupLists[gi]
        while (idx[gi] < list.length && seen.has(list[idx[gi]].filename)) idx[gi]++
        if (idx[gi] < list.length) {
          out.push(list[idx[gi]])
          seen.add(list[idx[gi]].filename)
          idx[gi]++
          progress = true
        }
      }
    }
    return out
  }, [query])

  return (
    <div className="relative flex-1 min-w-[220px] max-w-sm">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por carrera, código o generación..."
        className="w-full border border-itam-muted/40 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-itam-core"
        style={{ color: '#0D3B2E' }}
      />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-80 overflow-y-auto bg-white border border-itam-muted/40 rounded shadow-lg">
          {results.map((meta) => {
            const filename = buildPlanFilename(meta.program, meta.letter, meta.area)
            return (
              <li key={filename} className="border-b border-itam-muted/20 last:border-b-0">
                <button
                  onClick={() => {
                    trackEvent('/plan/search-select', filename.replace('-plan-estudios.json', ''))
                    onSelect(meta)
                    setQuery('')
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-itam-muted/10 text-xs"
                  style={{ color: '#0D3B2E' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono opacity-60">
                      {meta.program}-{meta.letter}
                    </span>
                    <span className="font-semibold">{programNames[meta.program] ?? meta.program}</span>
                  </div>
                  {meta.area && <div className="opacity-70">{meta.area}</div>}
                  <div className="opacity-50">{planGenerations[`${meta.program}-${meta.letter}`]}</div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {query.trim() && results.length === 0 && (
        <p className="text-xs opacity-50 mt-1" style={{ color: '#0D3B2E' }}>
          Sin resultados.
        </p>
      )}
    </div>
  )
}
