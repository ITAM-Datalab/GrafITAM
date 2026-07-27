import { useState } from 'react'

const MAKE_WEBHOOK_URL = import.meta.env.VITE_MAKE_WEBHOOK_URL as string | undefined
const MAKE_WEBHOOK_API_KEY = import.meta.env.VITE_MAKE_WEBHOOK_API_KEY as string | undefined

// Form "Reportar Problema - GrafItam" (https://forms.gle/kG7GuWgdZoAYrye3A). No
// requiere inicio de sesión — es la opción por default para reportar sin cuenta
// de GitHub. Entry IDs sacados de FB_PUBLIC_LOAD_DATA_ del HTML público del form;
// si se edita el form (agregar/quitar pregunta), hay que volver a sacarlos.
const GOOGLE_FORM_ID = '1FAIpQLSeJbtKxLvnWrrWk8mE_O-ncBoJedsG1Zzq1BeBZmkicj5O6xw'
const GOOGLE_FORM_ENTRIES = {
  tipo: '1970869378',
  clave: '1561787857',
  nombre: '621577110',
  grupo: '373217162',
  carrera: '1057271016',
  comentario: '1981201194',
}

type TipoProblema = 'materia_faltante' | 'grupo_incorrecto' | 'plan_faltante' | 'otro'

const TIPO_LABELS: Record<TipoProblema, string> = {
  materia_faltante: 'Materia no aparece en horarios',
  grupo_incorrecto: 'Grupo/CRN incorrecto o faltante',
  plan_faltante: 'Plan de estudios no encontrado',
  otro: 'Otro problema',
}

// Texto exacto de la opción correspondiente en el Google Form — 'otro' no tiene
// texto fijo, usa el mecanismo de "Otro" (__other_option__) del form en su lugar.
const TIPO_FORM_OPTION: Record<TipoProblema, string | null> = {
  materia_faltante: 'Materia no aparece en horarios',
  grupo_incorrecto: 'Grupo/CRN incorrecto o faltante',
  plan_faltante: 'Plan de estudios no encontrado',
  otro: null,
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error'

function buildIssueContent(
  tipo: TipoProblema,
  clave: string,
  nombre: string,
  grupo: string,
  carrera: string,
  comentario: string,
) {
  const title = `[Reporte] ${TIPO_LABELS[tipo]}${clave ? ` — ${clave}` : ''}`
  const body = [
    `**Tipo de problema:** ${TIPO_LABELS[tipo]}`,
    `**Clave de materia:** ${clave || '(no especificada)'}`,
    `**Nombre de materia:** ${nombre || '(no especificado)'}`,
    `**Grupo/CRN:** ${grupo || '(no especificado)'}`,
    `**Carrera o plan de estudios:** ${carrera || '(no especificado)'}`,
    '',
    '**Comentario:**',
    comentario || '(sin comentario)',
  ].join('\n')
  return { title, body }
}

export default function ReportIssueModal() {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoProblema>('materia_faltante')
  const [clave, setClave] = useState('')
  const [nombre, setNombre] = useState('')
  const [grupo, setGrupo] = useState('')
  const [carrera, setCarrera] = useState('')
  const [comentario, setComentario] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')

  // Qué campo es obligatorio cambia según el tipo de problema: para "Plan de
  // estudios no encontrado" no aplica pedir una clave de materia (se pide la
  // carrera/plan en su lugar), y "Otro problema" solo necesita el comentario.
  const isValid =
    tipo === 'plan_faltante'
      ? carrera.trim() !== ''
      : tipo === 'otro'
        ? comentario.trim() !== ''
        : clave.trim() !== ''

  const resetForm = () => {
    setOpen(false)
    setClave('')
    setNombre('')
    setGrupo('')
    setCarrera('')
    setComentario('')
    setSubmitState('idle')
  }

  const handleSubmitGoogleForm = () => {
    const e = GOOGLE_FORM_ENTRIES
    const params = new URLSearchParams({
      usp: 'pp_url',
      [`entry.${e.clave}`]: clave,
      [`entry.${e.nombre}`]: nombre,
      [`entry.${e.grupo}`]: grupo,
      [`entry.${e.carrera}`]: carrera,
      [`entry.${e.comentario}`]: comentario,
    })
    const tipoOpcion = TIPO_FORM_OPTION[tipo]
    if (tipoOpcion) {
      params.set(`entry.${e.tipo}`, tipoOpcion)
    } else {
      params.set(`entry.${e.tipo}`, '__other_option__')
      params.set(`entry.${e.tipo}.other_option_response`, TIPO_LABELS[tipo])
    }

    const url = `https://docs.google.com/forms/d/e/${GOOGLE_FORM_ID}/viewform?${params.toString()}`
    window.open(url, '_blank', 'noopener,noreferrer')
    resetForm()
  }

  const handleSubmit = async () => {
    const { title, body } = buildIssueContent(tipo, clave, nombre, grupo, carrera, comentario)
    setSubmitState('submitting')
    try {
      const response = await fetch(MAKE_WEBHOOK_URL ?? '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-make-apikey': MAKE_WEBHOOK_API_KEY ?? '',
        },
        body: JSON.stringify({ title, body, tipo, clave }),
      })
      if (!response.ok) throw new Error(`Webhook respondió ${response.status}`)
      setSubmitState('success')
      setTimeout(resetForm, 1500)
    } catch {
      setSubmitState('error')
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold rounded px-3 py-1.5 whitespace-nowrap shadow-sm"
        style={{ background: '#8C5E58', color: '#FCFAF8' }}
      >
        ¿No encuentras tu materia, grupo o plan?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-base-bone rounded-lg shadow-lg w-full max-w-md p-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-bold mb-3" style={{ color: '#0D3B2E' }}>
              Reportar problema
            </h2>

            <label className="block text-xs font-semibold mb-1">Tipo de problema</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoProblema)}
              className="w-full text-xs border border-itam-muted/50 rounded p-2 mb-3"
            >
              {Object.entries(TIPO_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold mb-1">
              Clave de materia{tipo === 'materia_faltante' || tipo === 'grupo_incorrecto' ? '' : ' (opcional)'}
            </label>
            <input
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="ej. MAT-14100"
              className="w-full text-xs border border-itam-muted/50 rounded p-2 mb-3"
            />

            <label className="block text-xs font-semibold mb-1">Nombre de materia (opcional)</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full text-xs border border-itam-muted/50 rounded p-2 mb-3"
            />

            <label className="block text-xs font-semibold mb-1">Grupo / CRN (opcional)</label>
            <input
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              className="w-full text-xs border border-itam-muted/50 rounded p-2 mb-3"
            />

            <label className="block text-xs font-semibold mb-1">
              Carrera o plan de estudios{tipo === 'plan_faltante' ? '' : ' (opcional)'}
            </label>
            <input
              value={carrera}
              onChange={(e) => setCarrera(e.target.value)}
              placeholder="ej. CDA-A, generación 2025"
              className="w-full text-xs border border-itam-muted/50 rounded p-2 mb-3"
            />

            <label className="block text-xs font-semibold mb-1">Comentario</label>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              placeholder="Describe el problema (si tienes el PDF del plan, menciónalo aquí)"
              className="w-full text-xs border border-itam-muted/50 rounded p-2 mb-3"
            />

            <p className="text-[10px] opacity-60 mb-3">
              Al enviar se crea el reporte directamente — no necesitas cuenta de Google ni de GitHub.
            </p>

            {submitState === 'success' && (
              <p className="text-xs mb-3 font-semibold" style={{ color: '#1E5E4B' }}>
                ¡Reporte enviado! Gracias por avisar.
              </p>
            )}

            {submitState === 'error' && (
              <div className="mb-3">
                <p className="text-xs mb-2" style={{ color: '#8C5E58' }}>
                  No se pudo enviar automáticamente. Intenta reportarlo por Google Form.
                </p>
                <button
                  onClick={handleSubmitGoogleForm}
                  disabled={!isValid}
                  className="text-[10px] underline opacity-70 hover:opacity-100 disabled:opacity-30"
                >
                  Reportar por Google Form
                </button>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="text-xs px-3 py-1.5 rounded border border-itam-muted/50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isValid || submitState === 'submitting'}
                className="text-xs px-3 py-1.5 rounded font-semibold disabled:opacity-40"
                style={{ background: '#1E5E4B', color: '#FCFAF8' }}
              >
                {submitState === 'submitting' ? 'Enviando...' : 'Enviar reporte'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
