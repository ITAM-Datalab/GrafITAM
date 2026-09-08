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

export default function PlanSearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const groups = splitGroups(query)
    if (groups.length === 0) return []

    const matchesGroup = (meta: PlanMeta, tokens: string[]) =>
      tokens.every((t) => haystackFor(meta).includes(t))

    // allPlanMetas ya viene ordenado por programa→letra→área (loader.ts),
    // así que filtrar directo sobre él preserva ese orden por código de plan
    // — sin él hay que reordenar (round-robin, diversificación por
    // programa, etc.), lo cual esconde variantes del mismo programa
    // (ej. CDA-A/B/C) entre sí en vez de mostrarlas juntas.
    if (groups.length === 1) {
      return allPlanMetas.filter((m) => matchesGroup(m, groups[0]))
    }

    // Con más de un grupo (query compuesta, ej. "Economía y Relaciones
    // Internacionales"), los planes que matchean TODOS los grupos van
    // primero (por código); después los que matchean solo parte, también
    // por código.
    const fullMatches = allPlanMetas.filter((m) => groups.every((tokens) => matchesGroup(m, tokens)))
    const partialMatches = allPlanMetas.filter(
      (m) =>
        !groups.every((tokens) => matchesGroup(m, tokens)) &&
        groups.some((tokens) => matchesGroup(m, tokens)),
    )
    return [...fullMatches, ...partialMatches]
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
