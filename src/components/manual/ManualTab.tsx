import type { CSSProperties, ReactNode } from 'react'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-base-bone shadow-sm p-4">
      <h2 className="text-sm font-semibold mb-2" style={{ color: '#0D3B2E' }}>
        {title}
      </h2>
      <div className="text-xs leading-relaxed space-y-2" style={{ color: '#0D3B2E' }}>
        {children}
      </div>
    </section>
  )
}

function StateRow({ swatch, label, description }: { swatch: CSSProperties; label: string; description: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex-shrink-0 rounded" style={{ width: 14, height: 14, ...swatch }} />
      <span>
        <strong className="font-semibold">{label}:</strong> {description}
      </span>
    </div>
  )
}

export default function ManualTab() {
  return (
    <div className="h-full overflow-y-auto bg-base-cream">
      <div className="max-w-2xl mx-auto p-4 space-y-3">
        <Section title="¿Qué es GrafItam?">
          <p>
            El plan de estudios de tu carrera, como un grafo: cada materia es una tarjeta y las flechas muestran
            qué prerrequisitos necesita. Marca lo que ya cursaste, planea semestres futuros, y arma tu horario con
            los grupos reales de cada periodo.
          </p>
        </Section>

        <Section title="¿Cómo elijo mi plan de estudios?">
          <p>
            Arriba, selecciona tu <strong className="font-semibold">programa</strong> y{' '}
            <strong className="font-semibold">generación</strong> (letra). Si tu programa tiene{' '}
            <strong className="font-semibold">áreas de concentración</strong> (ej. Actuaría, Economía), un tercer
            selector aparece para elegirla.
          </p>
          <p>La barra de progreso muestra tus créditos aprobados sobre el total del plan.</p>
        </Section>

        <Section title="¿Cómo marco una materia como aprobada o planeada?">
          <p>
            Cada tarjeta tiene dos botones: <strong className="font-semibold">✓ Aprobada</strong> (ya la
            cursaste) y <strong className="font-semibold">→ Planeada</strong> (la vas a cursar en un semestre
            futuro). El color de la tarjeta cambia según su estado:
          </p>
          <div className="space-y-1.5 pl-1">
            <StateRow
              swatch={{ background: '#FCFAF8', border: '1px solid #8CA699' }}
              label="Normal"
              description="todavía no la marcaste."
            />
            <StateRow
              swatch={{ background: '#FCFAF8', border: '2px solid #22C55E' }}
              label="Disponible"
              description='con el toggle "Disponibles" activado: ya puedes cursarla (sus prerrequisitos están aprobados).'
            />
            <StateRow
              swatch={{ background: '#FCFAF8', border: '2px solid #8C5E58' }}
              label="Planeada"
              description="la vas a cursar más adelante."
            />
            <StateRow
              swatch={{ background: '#1E5E4B', border: 'none' }}
              label="Aprobada"
              description="ya la cursaste."
            />
            <StateRow
              swatch={{ background: '#FCFAF8', border: '2px dashed #8C5E58' }}
              label="Error"
              description="hay un problema con su planeación — ver siguiente sección."
            />
          </div>
        </Section>

        <Section title="¿Cómo veo los prerrequisitos de una materia?">
          <p>
            Pasa el mouse sobre una tarjeta: se resalta toda su cadena (los prerrequisitos que la preceden y lo
            que desbloquea) y se atenúa el resto del grafo.
          </p>
          <p>
            Dos líneas paralelas ("riel doble") en vez de una flecha significan{' '}
            <strong className="font-semibold">correquisito</strong>: esas dos materias se cursan juntas, en el
            mismo semestre.
          </p>
        </Section>

        <Section title="¿Por qué una flecha se ve punteada?">
          <p>
            Una flecha punteada color rust avisa que planeaste una materia en un semestre igual o anterior al de
            uno de sus prerrequisitos. Corrige el semestre de alguna de las dos materias para resolverlo.
          </p>
        </Section>

        <Section title="¿Cómo armo mi horario de clases?">
          <p>
            En la pestaña <strong className="font-semibold">Planear Horario</strong>, elige el periodo: se cargan
            los grupos reales (scrapeados de ITACA) de tus materias marcadas como Planeada. Si buscas una materia
            fuera de tu plan (ej. una optativa libre), agrégala con el buscador del sidebar.
          </p>
          <p>
            "Auto-asignar horario sin traslapes" arma una combinación válida por ti. Puedes guardar varias
            opciones ("Opción A", "Opción B"...) y exportar cualquiera a Excel.
          </p>
        </Section>

        <Section title="No encuentro mi materia, grupo o plan — ¿qué hago?">
          <p>
            Usa el botón "¿No encuentras tu materia, grupo o plan?" (junto a las pestañas, arriba) y da clic en
            "Enviar reporte": abre un formulario prellenado que revisamos directamente — no necesitas cuenta de
            Google ni de GitHub. Si prefieres, el link "o repórtalo en GitHub" abre el reporte ahí en su lugar.
          </p>
          <p>
            Los datos se extraen automáticamente de los PDFs oficiales del ITAM, así que ocasionalmente puede
            faltar alguna materia o prerrequisito — repórtalo y lo corregimos.
          </p>
        </Section>
      </div>
    </div>
  )
}
