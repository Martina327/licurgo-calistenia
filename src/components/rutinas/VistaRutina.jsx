import { BLOQUES_EJERCICIO } from '../../lib/utils'
import { cadenas, descansoASeg, llevaDescanso, nombreCadena, textoDescanso } from '../../lib/rutinas'

// Vista de solo lectura de la rutina (coach): lo mismo que arma el editor pero limpio,
// para mirar rápido en el gimnasio sin los menús ni los campos de edición.
//   value:      estado del editor ({ nombre, objetivo, dias: [{ nombre, items }] })
//   ejercicios: catálogo, para mostrar el nombre de cada ejercicio
//   diasHechos: Set con los días que el alumno completó esta semana
export default function VistaRutina({ value, ejercicios, diasHechos = new Set() }) {
  const nombres = new Map(ejercicios.map((e) => [e.id, e.nombre]))

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-lg font-semibold">{value.nombre || 'Rutina sin nombre'}</p>
        {value.objetivo && <p className="mt-0.5 text-sm text-neutral-400">🎯 {value.objetivo}</p>}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {value.dias.map((d, n) => (
          <Dia key={d.key} numero={n + 1} dia={d} nombres={nombres} hecho={diasHechos.has(n + 1)} />
        ))}
      </div>
    </div>
  )
}

function Dia({ numero, dia, nombres, hecho }) {
  const bloques = BLOQUES_EJERCICIO.filter((b) => dia.items.some((i) => i.bloque === b))
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${hecho ? 'bg-emerald-900/60 text-emerald-300' : 'bg-neutral-800 text-neutral-300'}`}>
          {hecho ? '✓' : numero}
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-semibold">Día {numero}{dia.nombre && ` · ${dia.nombre}`}</h2>
          {hecho && <p className="text-xs text-emerald-400">Hecho esta semana</p>}
        </div>
      </header>

      {bloques.length === 0 ? (
        <p className="px-4 py-4 text-sm text-neutral-500">Sin ejercicios cargados.</p>
      ) : (
        <div className="divide-y divide-neutral-800">
          {bloques.map((b) => (
            <Bloque key={b} bloque={b} items={dia.items.filter((i) => i.bloque === b)} nombres={nombres} />
          ))}
        </div>
      )}
    </section>
  )
}

function Bloque({ bloque, items, nombres }) {
  const conDescanso = llevaDescanso(bloque)
  const grupos = conDescanso ? cadenas(items) : items.map((i) => [i])
  return (
    <div className="px-4 py-3">
      <h3 className="mb-2 text-xs font-medium text-neutral-400">{bloque}</h3>
      <ul className="space-y-2">
        {grupos.map((g) => (
          <li key={g[0].key}
            className={g.length > 1 ? 'rounded-lg border-l-2 border-sky-700 bg-sky-950/20 py-1.5 pl-3 pr-2' : ''}>
            {g.length > 1 && <p className="mb-1 text-xs font-medium text-sky-300">{nombreCadena(g.length)} · sin descanso entre ejercicios</p>}
            <ul className="space-y-1.5">
              {g.map((it) => <Ejercicio key={it.key} it={it} nombre={nombres.get(it.ejercicio_id)} />)}
            </ul>
            {conDescanso && <Descanso it={g[g.length - 1]} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Ejercicio({ it, nombre }) {
  const dosis = it.repeticiones ? `${it.series} × ${it.repeticiones}` : `${it.series} series`
  return (
    <li className="text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-medium">{nombre ?? 'Ejercicio sin elegir'}</span>
        <span className="shrink-0 tabular-nums text-neutral-300">{dosis}</span>
      </div>
      {it.nota && <p className="text-xs text-neutral-400">{it.nota}</p>}
    </li>
  )
}

function Descanso({ it }) {
  const texto = textoDescanso(descansoASeg(it.descanso, it.unidad))
  return <p className="mt-1 text-xs text-neutral-500">Descanso: {texto ?? 'a gusto (¡VAMOS!)'}</p>
}
