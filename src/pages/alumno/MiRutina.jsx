import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, hoyAR, mensajeError } from '../../lib/utils'
import { TEXTO_VAMOS, agruparPorDia, nombreCadena, tareasDelDia, textoDescanso } from '../../lib/rutinas'
import { alternarMarca, guardarChecklist, leerChecklist } from '../../lib/checklist'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'

// Color e ícono de cada sección del día. Las clases van completas (Tailwind no arma nombres dinámicos).
const SECCION = {
  'Entrada en calor': {
    icono: '🔥', titulo: 'Entrada en calor', panel: 'border-orange-500/30 bg-orange-500/[0.07]',
    chip: 'bg-orange-500/20 text-orange-200', numero: 'text-orange-300', tramo: 'bg-orange-400',
  },
  Fuerza: {
    icono: '💪', titulo: 'Fuerza', panel: 'border-sky-500/30 bg-sky-500/[0.07]',
    chip: 'bg-sky-500/20 text-sky-200', numero: 'text-sky-300', tramo: 'bg-sky-400',
  },
  Accesorios: {
    icono: '🎯', titulo: 'Accesorios', panel: 'border-indigo-500/30 bg-indigo-500/[0.07]',
    chip: 'bg-indigo-500/20 text-indigo-200', numero: 'text-indigo-300', tramo: 'bg-indigo-400',
  },
  Estiramientos: {
    icono: '🧘', titulo: 'Estiramientos', panel: 'border-teal-500/30 bg-teal-500/[0.07]',
    chip: 'bg-teal-500/20 text-teal-200', numero: 'text-teal-300', tramo: 'bg-teal-400',
  },
}
const estilo = (bloque) => SECCION[bloque] ?? SECCION.Fuerza

// CU11 – El alumno consulta su rutina activa y va tildando lo que hace en el día.
// Un tilde por ejercicio, salvo:
//   · Entrada en calor y Estiramientos → un tilde para toda la sección (se hacen de corrido)
//   · Bi-series / tri-series           → un tilde para todo el bloque de ejercicios
// La barra de progreso queda fija arriba al hacer scroll.
// Tocando ⓘ se ve la descripción del ejercicio y la observación del coach.
// Las observaciones privadas del coach (lesiones, etc.) NO se muestran: son otra tabla.
export default function MiRutina() {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [check, setCheck] = useState({ marcados: [], dia: null })

  useEffect(() => {
    // El RLS hace que el alumno solo reciba su propia rutina
    supabase
      .from('v_rutina_alumno')
      .select('*')
      .then(({ data, error }) => {
        if (error) setError(mensajeError(error))
        setFilas(data ?? [])
        if (data?.length) setCheck(leerChecklist(data[0].rutina_id, hoyAR()))
        setCargando(false)
      })
  }, [])

  const dias = useMemo(() => agruparPorDia(filas), [filas])
  const rutina = filas[0]
  const diaActual = dias.find((d) => d.numero === check.dia) ?? dias[0]
  const tareas = useMemo(() => (diaActual ? tareasDelDia(diaActual.items) : []), [diaActual])

  const actualizar = (nuevo) => {
    setCheck(nuevo)
    guardarChecklist(rutina.rutina_id, nuevo)
  }
  const elegirDia = (numero) => {
    actualizar({ ...check, dia: numero })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const marcar = (id) => actualizar(alternarMarca({ ...check, fecha: hoyAR() }, id))
  const reiniciar = () =>
    actualizar({ ...check, fecha: hoyAR(), marcados: check.marcados.filter((id) => !tareas.some((t) => t.id === id)) })

  if (cargando) return <Cargando />
  if (error) return <div className="mx-auto max-w-md"><Aviso tipo="error" texto={error} /></div>
  if (!rutina) {
    return (
      <div className="mx-auto max-w-md space-y-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center">
        <h1 className="text-xl font-semibold">Mi rutina</h1>
        <p className="text-neutral-300">Todavía no tenés una rutina asignada. Consultá con tu coach.</p>
      </div>
    )
  }

  const hecha = (t) => check.marcados.includes(t.id)
  const hechos = tareas.filter(hecha).length
  const completo = tareas.length > 0 && hechos === tareas.length
  const bloques = [...new Set(tareas.map((t) => t.bloque))]

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="mb-3">
        <h1 className="text-2xl font-bold leading-tight text-white">{rutina.rutina}</h1>
        {rutina.objetivo && <p className="mt-1 text-[15px] text-neutral-200">🎯 {rutina.objetivo}</p>}
        <p className="mt-1 text-xs text-neutral-400">Actualizada el {formatearFecha(rutina.fecha_actualizacion)}</p>
      </header>

      {/* Fija debajo del menú de la app: días + progreso siempre a la vista */}
      <div className="sticky top-[57px] z-[5] -mx-4 mb-4 space-y-2.5 border-b border-neutral-800 bg-neutral-950/95 px-4 pb-3 pt-2 backdrop-blur">
        {dias.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {dias.map((d) => {
              const activo = d.numero === diaActual.numero
              return (
                <button key={d.numero} onClick={() => elegirDia(d.numero)} aria-pressed={activo}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    activo ? 'bg-white text-neutral-950' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                  }`}>
                  Día {d.numero}{d.nombre && ` · ${d.nombre}`}
                </button>
              )
            })}
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-neutral-200">
            <span className="text-lg font-bold tabular-nums text-white">{hechos}</span>
            <span className="text-neutral-400"> de {tareas.length}</span>
            {completo ? <span className="ml-2 font-semibold text-emerald-300">¡Día completado! 💪</span> : ' hechos'}
          </span>
          {hechos > 0 && <button onClick={reiniciar} className="text-sm text-neutral-400 hover:text-white">Reiniciar</button>}
        </div>
        {/* Un tramo por tilde, del color de su sección */}
        <div className="flex gap-1" role="progressbar" aria-valuenow={hechos} aria-valuemin={0} aria-valuemax={tareas.length}
          aria-label={`${hechos} de ${tareas.length} hechos`}>
          {tareas.map((t) => (
            <div key={t.id} className={`h-2.5 flex-1 rounded-full transition-colors duration-300 ${
              hecha(t) ? estilo(t.bloque).tramo : 'bg-neutral-800'}`} />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {bloques.map((bloque) => {
          const st = estilo(bloque)
          const delBloque = tareas.filter((t) => t.bloque === bloque)
          const seccion = delBloque[0].tipo === 'seccion' ? delBloque[0] : null
          const terminada = seccion && hecha(seccion)
          return (
            <section key={bloque} aria-label={st.titulo}
              className={`rounded-2xl border p-3 transition-colors ${terminada ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : st.panel}`}>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <h2 className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${st.chip}`}>
                  <span aria-hidden>{st.icono}</span>{st.titulo}
                </h2>
                {seccion && <span className="text-xs text-neutral-300">De corrido, sin descanso</span>}
              </div>

              {seccion ? (
                <>
                  <ul className="divide-y divide-white/5">
                    {seccion.items.map((it) => (
                      <li key={it.item_id}><FilaEjercicio item={it} st={st} hecho={terminada} /></li>
                    ))}
                  </ul>
                  <BotonTilde hecho={terminada} onClick={() => marcar(seccion.id)}
                    texto={`Terminé ${bloque === 'Entrada en calor' ? 'la entrada en calor' : 'los estiramientos'}`}
                    textoHecho={`${st.titulo}: hecho`} />
                </>
              ) : (
                <ul className="space-y-2.5">
                  {delBloque.map((t) => (
                    <li key={t.id}>
                      {t.tipo === 'cadena'
                        ? <Cadena tarea={t} st={st} hecho={hecha(t)} onMarcar={() => marcar(t.id)} />
                        : <TarjetaEjercicio item={t.items[0]} st={st} hecho={hecha(t)} onMarcar={() => marcar(t.id)} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

// Un tilde redondo grande, fácil de tocar con la mano transpirada
function Tilde({ hecho, onClick, etiqueta }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={hecho} aria-label={etiqueta}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-lg font-bold transition-colors ${
        hecho ? 'border-emerald-400 bg-emerald-400 text-neutral-950' : 'border-neutral-500 bg-neutral-950/40 text-transparent hover:border-neutral-300'
      }`}>
      ✓
    </button>
  )
}

function BotonTilde({ hecho, onClick, texto, textoHecho }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={hecho}
      className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold transition-colors ${
        hecho ? 'bg-emerald-400 text-neutral-950' : 'border-2 border-dashed border-neutral-500 text-neutral-100 hover:border-neutral-300'
      }`}>
      <span aria-hidden>{hecho ? '✓' : '○'}</span>{hecho ? textoHecho : texto}
    </button>
  )
}

// Series × reps en grande, que es lo que el alumno mira entre serie y serie
function Volumen({ it, st }) {
  return (
    <span className={`whitespace-nowrap text-lg font-bold tabular-nums ${st.numero}`}>
      {it.series}<span className="mx-0.5 text-sm font-semibold text-neutral-400">×</span>{it.repeticiones}
    </span>
  )
}

function Descanso({ seg }) {
  const txt = textoDescanso(seg)
  return txt
    ? <span className="inline-flex items-center gap-1 rounded-md bg-neutral-800 px-2 py-0.5 text-sm text-neutral-100">⏱ Descanso {txt}</span>
    : <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/15 px-2 py-0.5 text-sm font-semibold text-amber-200">🔔 {TEXTO_VAMOS}</span>
}

// Ejercicio suelto (Fuerza / Accesorios): tilde propio
function TarjetaEjercicio({ item: it, st, hecho, onMarcar }) {
  return (
    <div className={`rounded-xl border p-3 transition-colors ${
      hecho ? 'border-emerald-500/40 bg-emerald-500/[0.08]' : 'border-white/10 bg-neutral-900'}`}>
      <div className="flex items-start gap-3">
        <Tilde hecho={hecho} onClick={onMarcar} etiqueta={`${hecho ? 'Desmarcar' : 'Marcar'} ${it.ejercicio}`} />
        <div className="min-w-0 flex-1">
          <FilaEjercicio item={it} st={st} hecho={hecho} compacta />
          <div className="mt-1.5"><Descanso seg={it.descanso_seg} /></div>
        </div>
      </div>
    </div>
  )
}

// Bi-serie / tri-serie: un tilde para todos; el descanso es el del último ejercicio
function Cadena({ tarea, st, hecho, onMarcar }) {
  const nombres = tarea.items.map((i) => i.ejercicio)
  const ultimo = tarea.items[tarea.items.length - 1]
  return (
    <div className={`rounded-xl border-2 p-3 transition-colors ${
      hecho ? 'border-emerald-500/50 bg-emerald-500/[0.08]' : 'border-fuchsia-500/50 bg-fuchsia-500/[0.08]'}`}>
      <div className="flex items-start gap-3">
        <Tilde hecho={hecho} onClick={onMarcar} etiqueta={`${hecho ? 'Desmarcar' : 'Marcar'} ${nombreCadena(nombres.length).toLowerCase()}`} />
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-full bg-fuchsia-500 px-2.5 py-0.5 text-xs font-bold text-white">
            {nombreCadena(nombres.length)}
          </span>
          <p className="mt-1.5 text-sm leading-snug text-fuchsia-100">
            Hacé {nombres.slice(0, -1).join(', ')} y {nombres[nombres.length - 1]} seguidos, sin descanso entre ellos.
          </p>
        </div>
      </div>
      <ol className="mt-2 divide-y divide-white/5 rounded-lg bg-neutral-950/40 px-3">
        {tarea.items.map((it, n) => (
          <li key={it.item_id} className="flex gap-2">
            <span className="pt-3 text-sm font-bold tabular-nums text-fuchsia-300">{n + 1}</span>
            <div className="min-w-0 flex-1"><FilaEjercicio item={it} st={st} hecho={hecho} /></div>
          </li>
        ))}
      </ol>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-neutral-200">
        Al terminar la vuelta: <Descanso seg={ultimo.descanso_seg} />
      </div>
    </div>
  )
}

// Nombre + series × reps + ⓘ (descripción del ejercicio y observación del coach)
function FilaEjercicio({ item: it, st, hecho, compacta = false }) {
  const [verInfo, setVerInfo] = useState(false)
  const tieneInfo = Boolean(it.descripcion || it.nota)
  return (
    <div className={compacta ? '' : 'py-2.5'}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className={`text-[15px] font-semibold leading-snug ${hecho ? 'text-neutral-400 line-through decoration-emerald-400/70' : 'text-white'}`}>
            {it.ejercicio}
          </div>
          <Volumen it={it} st={st} />
        </div>
        {tieneInfo && (
          <button type="button" onClick={() => setVerInfo((v) => !v)} aria-expanded={verInfo}
            aria-label={`Información de ${it.ejercicio}`} title="Información"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-serif text-sm font-bold italic transition-colors ${
              verInfo ? 'border-white bg-white text-neutral-950' : 'border-neutral-500 text-neutral-200 hover:border-neutral-300'
            }`}>
            i
          </button>
        )}
      </div>
      {verInfo && (
        <div className="mt-2 space-y-2 rounded-lg bg-neutral-950/60 p-3 text-sm">
          {it.descripcion && (
            <div>
              <div className="text-xs font-semibold text-neutral-400">Cómo se hace</div>
              <p className="whitespace-pre-line text-neutral-100">{it.descripcion}</p>
            </div>
          )}
          {it.nota && (
            <div>
              <div className="text-xs font-semibold text-neutral-400">Observación del coach</div>
              <p className="whitespace-pre-line font-medium text-amber-200">{it.nota}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
