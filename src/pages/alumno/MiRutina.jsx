import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, hoyAR, mensajeError } from '../../lib/utils'
import { TEXTO_VAMOS, agruparPorDia, nombreCadena, tareasDelDia, textoDescanso } from '../../lib/rutinas'
import { alternarMarca, guardarChecklist, leerChecklist, sinMarcas } from '../../lib/checklist'
import { completadosEnSemana, diaQueToca, lunesDe } from '../../lib/semana'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import { CADENA, estiloSeccion as estilo } from '../../lib/secciones'


// La vista elegida (días en horizontal o lista desplegable) se recuerda en este celular
const CLAVE_VISTA = 'licurgo.rutina.vista'
const leerVista = () => { try { return localStorage.getItem(CLAVE_VISTA) === 'lista' ? 'lista' : 'dias' } catch { return 'dias' } }
const guardarVista = (v) => { try { localStorage.setItem(CLAVE_VISTA, v) } catch { /* sin almacenamiento */ } }

// CU11 – El alumno consulta su rutina activa y va tildando lo que hace en el día.
// Un tilde por ejercicio, salvo:
//   · Entrada en calor y Estiramientos → un tilde para toda la sección (se hacen de corrido)
//   · Bi-series / tri-series           → un tilde para todo el bloque de ejercicios
// La barra de progreso queda fija arriba al hacer scroll.
// Dos vistas (botón arriba a la derecha): por días (chips horizontales, un día por vez)
// o lista (los días uno debajo del otro; tocar uno lo despliega y tocarlo de nuevo lo minimiza).
// El checklist se reinicia todos los días; al completar un día queda registrado en la semana
// (tabla dias_completados) y al día siguiente se abre el próximo día pendiente.
// Tocando ⓘ se ve la descripción del ejercicio y la observación del coach.
// Las observaciones privadas del coach (lesiones, etc.) NO se muestran: son otra tabla.
export default function MiRutina() {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [check, setCheck] = useState({ marcados: [], dia: null })
  const [completados, setCompletados] = useState([]) // [{ numero_dia, fecha, creado }] desde el lunes
  const [diaVista, setDiaVista] = useState(null)     // día que se muestra en esta visita
  const cola = useRef(Promise.resolve())              // los cambios en la base salen de a uno, en orden
  const [vista, setVista] = useState(leerVista)        // 'dias' (horizontal) o 'lista' (vertical, desplegable)
  const [abierto, setAbierto] = useState(undefined)    // en la lista: día desplegado (undefined = el que toca hoy)
  const diaVistaInicial = useRef(null)                 // el día que tocaba al entrar

  useEffect(() => {
    // El RLS hace que el alumno solo reciba su propia rutina
    supabase
      .from('v_rutina_alumno')
      .select('*')
      .then(async ({ data, error }) => {
        if (error) setError(mensajeError(error))
        setFilas(data ?? [])
        if (data?.length) {
          const hoy = hoyAR()
          const sem = await supabase.from('dias_completados').select('numero_dia, fecha, creado')
            .eq('rutina_id', data[0].rutina_id).gte('fecha', lunesDe(hoy)).order('creado')
          const comp = sem.data ?? []
          // Un día que quedó completo arranca sin tildes la próxima vez que se entra.
          // Si un día está a medio hacer (recargó en pleno entrenamiento), se conserva y se vuelve a abrir.
          const diasRutina = agruparPorDia(data)
          const guardado = leerChecklist(data[0].rutina_id, hoy)
          const tareasDe = (d) => tareasDelDia(d.items).map((t) => t.id)
          const completos = diasRutina.filter((d) => tareasDe(d).every((id) => guardado.marcados.includes(id)))
          const limpio = sinMarcas(guardado, new Set(completos.flatMap(tareasDe)))
          if (limpio.marcados.length !== guardado.marcados.length) guardarChecklist(data[0].rutina_id, limpio)
          const elegido = diasRutina.find((d) => d.numero === guardado.dia)
          const aMedias = elegido && tareasDe(elegido).some((id) => limpio.marcados.includes(id))
          setCheck(limpio)
          setCompletados(comp)
          const inicial = aMedias
            ? elegido.numero
            : diaQueToca({ dias: diasRutina.map((d) => d.numero), completados: comp, hoy, elegidoHoy: guardado.dia })
          diaVistaInicial.current = inicial
          setDiaVista(inicial)
        }
        setCargando(false)
      })
  }, [])

  const dias = useMemo(() => agruparPorDia(filas), [filas])
  const rutina = filas[0]
  const hoy = hoyAR()
  const diaActual = dias.find((d) => d.numero === diaVista) ?? dias[0]
  const tareas = useMemo(() => (diaActual ? tareasDelDia(diaActual.items) : []), [diaActual])
  const hechosSemana = completadosEnSemana(completados, hoy)
  const completo = tareas.length > 0 && tareas.every((t) => check.marcados.includes(t.id))
  const registradoHoy = (n) => completados.some((c) => c.numero_dia === n && c.fecha === hoy)

  // Día completo → queda hecho en la semana. Se revisa siempre (no solo al tildar), así no se pierde
  // si el pedido falló o si las marcas ya estaban.
  useEffect(() => {
    if (!rutina || !diaActual || !completo || registradoHoy(diaActual.numero)) return
    const n = diaActual.numero
    setCompletados((cs) => [...cs, { numero_dia: n, fecha: hoy, creado: new Date().toISOString() }])
    cola.current = cola.current.then(async () => {
      const { error } = await supabase.from('dias_completados').insert({ rutina_id: rutina.rutina_id, numero_dia: n })
      if (error && error.code !== '23505') setError(mensajeError(error))
    })
  }, [completo, diaActual?.numero]) // eslint-disable-line react-hooks/exhaustive-deps

  // Si destilda algo de un día que se registró hoy, se borra el registro de hoy
  const desregistrar = (n) => {
    if (!registradoHoy(n)) return
    setCompletados((cs) => cs.filter((c) => !(c.numero_dia === n && c.fecha === hoy)))
    cola.current = cola.current.then(() =>
      supabase.from('dias_completados').delete().eq('rutina_id', rutina.rutina_id).eq('numero_dia', n).eq('fecha', hoy))
  }

  const actualizar = (nuevo) => {
    setCheck(nuevo)
    guardarChecklist(rutina.rutina_id, nuevo)
  }
  const elegirDia = (numero, subir = true) => {
    setDiaVista(numero)
    actualizar({ ...check, fecha: hoyAR(), dia: numero })
    if (subir) window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const cambiarVista = (v) => { setVista(v); guardarVista(v) }
  // Lista: tocar un día lo despliega (y pasa a ser el día del checklist); tocarlo de nuevo lo minimiza
  const alternarDia = (numero) => {
    const abiertoAhora = abierto === undefined ? diaActual?.numero : abierto
    if (abiertoAhora === numero) return setAbierto(null)
    setAbierto(numero)
    elegirDia(numero, false)
    requestAnimationFrame(() => document.getElementById(`dia-${numero}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const marcar = (id) => {
    const quitando = check.marcados.includes(id)
    actualizar(alternarMarca({ ...check, fecha: hoyAR(), dia: diaActual.numero }, id))
    if (quitando) desregistrar(diaActual.numero)
  }
  const reiniciar = () => {
    actualizar({ ...check, fecha: hoyAR(), dia: diaActual.numero, marcados: check.marcados.filter((id) => !tareas.some((t) => t.id === id)) })
    desregistrar(diaActual.numero)
  }

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
  const yaHechoEstaSemana = hechosSemana.has(diaActual.numero) && !completo
  const bloques = [...new Set(tareas.map((t) => t.bloque))]

  const barra = <BarraProgreso tareas={tareas} hecha={hecha} hechos={hechos} onReiniciar={reiniciar} />
  const contenido = <ContenidoDia tareas={tareas} bloques={bloques} hecha={hecha} marcar={marcar} />
  const diaAbierto = abierto === undefined ? diaActual.numero : abierto

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold leading-tight text-white">{rutina.rutina}</h1>
          {dias.length > 1 && <SelectorVista vista={vista} onCambiar={cambiarVista} />}
        </div>
        {rutina.objetivo && <p className="mt-1 text-[15px] text-neutral-200">🎯 {rutina.objetivo}</p>}
        <p className="mt-1 text-xs text-neutral-400">Actualizada el {formatearFecha(rutina.fecha_actualizacion)}</p>
        {dias.length > 1 && (
          <p className="mt-2 text-sm text-neutral-200">
            {hechosSemana.size >= dias.length
              ? '🎉 Completaste todos los días de esta semana.'
              : `Esta semana: ${hechosSemana.size} de ${dias.length} días hechos.`}
          </p>
        )}
      </header>

      {vista === 'lista' && dias.length > 1 ? (
        // Vista vertical: los días uno debajo del otro; tocar despliega o minimiza
        <div className="space-y-3">
          {dias.map((d) => {
            const desplegado = diaAbierto === d.numero
            const hecho = hechosSemana.has(d.numero)
            const cantidad = tareasDelDia(d.items).length
            return (
              <section key={d.numero} id={`dia-${d.numero}`} className="scroll-mt-16 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/60">
                <button onClick={() => alternarDia(d.numero)} aria-expanded={desplegado}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-neutral-800">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    hecho ? 'bg-emerald-500/15 text-emerald-300' : desplegado ? 'bg-white text-neutral-950' : 'bg-neutral-800 text-neutral-200'}`}>
                    {hecho ? '✓' : d.numero}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">Día {d.numero}{d.nombre && ` · ${d.nombre}`}</span>
                    <span className="block text-sm text-neutral-400">
                      {cantidad} {cantidad === 1 ? 'tarea' : 'tareas'}
                      {hecho ? ' · hecho esta semana' : d.numero === diaVistaInicial.current ? ' · hoy te toca' : ''}
                    </span>
                  </span>
                  <span aria-hidden className={`text-neutral-500 transition-transform ${desplegado ? 'rotate-90' : ''}`}>›</span>
                </button>
                {desplegado && (
                  <div className="border-t border-neutral-800 px-3 pb-3">
                    <div className="sticky top-[57px] z-[5] -mx-3 mb-3 border-b border-neutral-800 bg-neutral-950/95 px-3 pb-2.5 pt-2.5 backdrop-blur">
                      {barra}
                      {yaHechoEstaSemana && <p className="mt-1.5 text-xs text-neutral-400">✓ Este día ya lo hiciste esta semana.</p>}
                    </div>
                    {contenido}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <>
          {/* Vista por días: fija debajo del menú, días + progreso siempre a la vista */}
          <div className="sticky top-[57px] z-[5] -mx-4 mb-4 space-y-2.5 border-b border-neutral-800 bg-neutral-950/95 px-4 pb-3 pt-2 backdrop-blur">
            {dias.length > 1 && (
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
                {dias.map((d) => {
                  const activo = d.numero === diaActual.numero
                  const hecho = hechosSemana.has(d.numero)
                  return (
                    <button key={d.numero} onClick={() => elegirDia(d.numero)} aria-pressed={activo}
                      title={hecho ? 'Ya lo hiciste esta semana' : undefined}
                      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        activo ? 'bg-white text-neutral-950' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                      }`}>
                      {hecho && <span aria-label="hecho esta semana" className={activo ? 'text-emerald-600' : 'text-emerald-400'}>✓ </span>}
                      Día {d.numero}{d.nombre && ` · ${d.nombre}`}
                    </button>
                  )
                })}
              </div>
            )}
            {barra}
            {yaHechoEstaSemana && <p className="text-xs text-neutral-400">✓ Este día ya lo hiciste esta semana.</p>}
          </div>
          {contenido}
        </>
      )}
    </div>
  )
}

// Botón para cambiar la vista: días en horizontal (uno por vez) o en lista desplegable
function SelectorVista({ vista, onCambiar }) {
  const op = [
    { id: 'dias', texto: 'Ver por días', icono: <><rect x="3" y="7" width="5" height="10" rx="1.5" /><rect x="10" y="7" width="5" height="10" rx="1.5" /><rect x="17" y="7" width="4" height="10" rx="1.5" /></> },
    { id: 'lista', texto: 'Ver como lista', icono: <><rect x="3" y="4" width="18" height="4" rx="1.5" /><rect x="3" y="10" width="18" height="4" rx="1.5" /><rect x="3" y="16" width="18" height="4" rx="1.5" /></> },
  ]
  return (
    <div className="flex shrink-0 rounded-full bg-neutral-800 p-1" role="group" aria-label="Vista de la rutina">
      {op.map((o) => (
        <button key={o.id} onClick={() => onCambiar(o.id)} aria-pressed={vista === o.id} aria-label={o.texto} title={o.texto}
          className={`flex h-8 w-9 items-center justify-center rounded-full transition-colors ${vista === o.id ? 'bg-white text-neutral-950' : 'text-neutral-400'}`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>{o.icono}</svg>
        </button>
      ))}
    </div>
  )
}

// Progreso solo visual: un tramo por tilde, del color de su sección
function BarraProgreso({ tareas, hecha, hechos, onReiniciar }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1" role="progressbar" aria-valuenow={hechos} aria-valuemin={0} aria-valuemax={tareas.length}
        aria-label={`${hechos} de ${tareas.length} hechos`}>
        {tareas.map((t) => (
          <div key={t.id} className={`h-2.5 flex-1 rounded-full transition-colors duration-300 ${
            hecha(t) ? (t.tipo === 'cadena' ? CADENA.tramo : estilo(t.bloque).tramo) : 'bg-neutral-800'}`} />
        ))}
      </div>
      {hechos > 0 && (
        <button onClick={onReiniciar} aria-label="Reiniciar este día" title="Reiniciar este día"
          className="-my-1 rounded-full px-1.5 text-lg leading-none text-neutral-400 hover:text-white">↺</button>
      )}
    </div>
  )
}

// Las secciones del día con sus tildes
function ContenidoDia({ tareas, bloques, hecha, marcar }) {
  return (
    <div className="space-y-4">
      {bloques.map((bloque) => {
        const st = estilo(bloque)
        const delBloque = tareas.filter((t) => t.bloque === bloque)
        const seccion = delBloque[0].tipo === 'seccion' ? delBloque[0] : null
        const terminada = seccion && hecha(seccion)
        return (
          <section key={bloque} aria-label={st.titulo}
            className={`rounded-2xl border p-3 ${st.panel}`}>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${st.chip}`}>
                <span aria-hidden>{st.icono}</span>{st.titulo}
              </h2>
              {seccion && <span className="text-xs text-neutral-300">De corrido, sin descanso</span>}
            </div>

            {seccion ? (
              <>
                <ul className={`divide-y divide-white/5 transition-opacity ${terminada ? 'opacity-50' : ''}`}>
                  {seccion.items.map((it) => (
                    <li key={it.item_id}><FilaEjercicio item={it} st={st} hecho={terminada} /></li>
                  ))}
                </ul>
                <BotonTilde hecho={terminada} st={st} onClick={() => marcar(seccion.id)}
                  etiqueta={`${st.titulo} completado`} />
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
  )
}

// Un tilde redondo grande, fácil de tocar con la mano transpirada
// Al tildar se pinta del color de su sección (o fucsia en una bi-serie)
function Tilde({ hecho, onClick, etiqueta, color }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={hecho} aria-label={etiqueta}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-lg font-bold transition-colors ${
        hecho ? color : 'border-neutral-500 bg-neutral-950/40 text-transparent hover:border-neutral-300'
      }`}>
      ✓
    </button>
  )
}

function BotonTilde({ hecho, st, onClick, etiqueta }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={hecho} aria-label={etiqueta}
      className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 py-3 text-[15px] font-semibold transition-colors ${
        hecho ? st.tilde : 'border-dashed border-neutral-500 text-neutral-100 hover:border-neutral-300'
      }`}>
      <span aria-hidden>{hecho ? '✓' : '○'}</span>Completado
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
    <div className="rounded-xl border border-white/10 bg-neutral-900 p-3">
      <div className="flex items-start gap-3">
        <Tilde hecho={hecho} color={st.tilde} onClick={onMarcar} etiqueta={`${hecho ? 'Desmarcar' : 'Marcar'} ${it.ejercicio}`} />
        <div className={`min-w-0 flex-1 transition-opacity ${hecho ? 'opacity-50' : ''}`}>
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
    <div className={`rounded-xl border-2 p-3 ${CADENA.caja}`}>
      <div className="flex items-start gap-3">
        <Tilde hecho={hecho} color={CADENA.tilde} onClick={onMarcar} etiqueta={`${hecho ? 'Desmarcar' : 'Marcar'} ${nombreCadena(nombres.length).toLowerCase()}`} />
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-full bg-fuchsia-500 px-2.5 py-0.5 text-xs font-bold text-white">
            {nombreCadena(nombres.length)}
          </span>
          <p className="mt-1.5 text-sm leading-snug text-fuchsia-100">
            Hacé {nombres.slice(0, -1).join(', ')} y {nombres[nombres.length - 1]} seguidos, sin descanso entre ellos.
          </p>
        </div>
      </div>
      <ol className={`mt-2 divide-y divide-white/5 rounded-lg bg-neutral-950/40 px-3 transition-opacity ${hecho ? 'opacity-50' : ''}`}>
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
          <div className="text-[15px] font-semibold leading-snug text-white">
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
