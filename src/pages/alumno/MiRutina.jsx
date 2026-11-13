import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatearFecha, hoyAR, mensajeError } from '../../lib/utils'
import { TEXTO_VAMOS, agruparPorDia, nombreCadena, tareasDelDia, textoDescanso } from '../../lib/rutinas'
import { alternarMarca, diaEmpezadoAntes, guardarChecklist, leerChecklist, sinMarcas } from '../../lib/checklist'
import { completadosEnSemana, diaQueToca, lunesDe } from '../../lib/semana'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import { CADENA, estiloSeccion as estilo } from '../../lib/secciones'


// CU11 – El alumno consulta su rutina activa y va tildando lo que hace en el día.
// Un tilde por ejercicio, salvo:
//   · Entrada en calor y Estiramientos → un tilde para toda la sección (se hacen de corrido)
//   · Bi-series / tri-series           → un tilde para todo el bloque de ejercicios
// Dos pantallas:
//   · /alumno/rutina             → los días de la rutina uno debajo del otro
//   · /alumno/rutina/dia/:numero → la pantalla del día con su checklist (se vuelve con "‹")
// La barra de progreso del día queda fija arriba al hacer scroll.
// El checklist se reinicia todos los días; al completar un día queda registrado en la semana
// (tabla dias_completados) y al día siguiente se abre el próximo día pendiente.
// Tocando ⓘ se ve la descripción del ejercicio y la observación del coach.
// Las observaciones privadas del coach (lesiones, etc.) NO se muestran: son otra tabla.
export default function MiRutina() {
  const { numero } = useParams()
  const navegar = useNavigate()
  const [confirmarFin, setConfirmarFin] = useState(false)
  const diaUrl = numero ? Number(numero) : null      // null = lista de días
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [check, setCheck] = useState({ marcados: [], dia: null })
  const [completados, setCompletados] = useState([]) // [{ numero_dia, fecha, creado }] desde el lunes
  const [diaVista, setDiaVista] = useState(null)     // día que se muestra en esta visita
  const cola = useRef(Promise.resolve())              // los cambios en la base salen de a uno, en orden
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
          const empezado = diaEmpezadoAntes(data[0].rutina_id, hoy) // a medias de otro día: no traba
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
            : diaQueToca({ dias: diasRutina.map((d) => d.numero), completados: empezado ? [...comp, empezado] : comp, hoy, elegidoHoy: guardado.dia })
          diaVistaInicial.current = inicial
          setDiaVista(inicial)
        }
        setCargando(false)
      })
  }, [])

  const dias = useMemo(() => agruparPorDia(filas), [filas])
  const rutina = filas[0]
  const hoy = hoyAR()
  const diaActual = dias.find((d) => d.numero === (diaUrl ?? diaVista)) ?? dias[0]
  const tareas = useMemo(() => (diaActual ? tareasDelDia(diaActual.items) : []), [diaActual])
  const hechosSemana = completadosEnSemana(completados, hoy)
  const completo = tareas.length > 0 && tareas.every((t) => check.marcados.includes(t.id))
  const registradoHoy = (n) => completados.some((c) => c.numero_dia === n && c.fecha === hoy)
  // Un solo día de la rutina por fecha: si hoy ya hizo uno, los demás quedan para otro día
  const diaDeHoy = completados.find((c) => c.fecha === hoy)?.numero_dia ?? null
  const bloqueado = (n) => diaDeHoy !== null && diaDeHoy !== n

  // Día completo → queda hecho en la semana. Se revisa siempre (no solo al tildar), así no se pierde
  // si el pedido falló o si las marcas ya estaban.
  const registrar = (n) => {
    if (registradoHoy(n) || bloqueado(n)) return
    setCompletados((cs) => [...cs, { numero_dia: n, fecha: hoy, creado: new Date().toISOString() }])
    cola.current = cola.current.then(async () => {
      const { error } = await supabase.from('dias_completados').insert({ rutina_id: rutina.rutina_id, numero_dia: n })
      if (error?.code === '23505') {
        // Otro día ya quedó registrado hoy (por ejemplo, desde otro celular): se vuelve a leer la semana
        const { data } = await supabase.from('dias_completados').select('numero_dia, fecha, creado')
          .eq('rutina_id', rutina.rutina_id).gte('fecha', lunesDe(hoy)).order('creado')
        if (data) setCompletados(data)
      } else if (error) setError(mensajeError(error))
    })
  }
  useEffect(() => {
    if (!rutina || !diaActual || !completo) return
    registrar(diaActual.numero)
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
  // Al abrir la pantalla de un día, ese pasa a ser el día del checklist de hoy
  useEffect(() => {
    if (!rutina || !diaUrl || check.dia === diaUrl || !dias.some((d) => d.numero === diaUrl) || bloqueado(diaUrl)) return
    setDiaVista(diaUrl)
    actualizar({ ...check, fecha: hoyAR(), dia: diaUrl })
  }, [diaUrl, rutina?.rutina_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const marcar = (id) => {
    if (bloqueado(diaActual.numero)) return
    const quitando = check.marcados.includes(id)
    actualizar(alternarMarca({ ...check, fecha: hoyAR(), dia: diaActual.numero }, id))
    if (quitando) desregistrar(diaActual.numero)
  }
  // Finalizar a medias (se tiene que ir): el día queda hecho en la semana y mañana sigue el próximo
  const finalizar = () => {
    registrar(diaActual.numero)
    actualizar({ ...check, fecha: hoyAR(), dia: null, marcados: check.marcados.filter((id) => !tareas.some((t) => t.id === id)) })
    setConfirmarFin(false)
    navegar('/alumno/rutina')
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
  const paraOtroDia = bloqueado(diaActual.numero)
  const bloques = [...new Set(tareas.map((t) => t.bloque))]

  // ----- Pantalla del día -----
  if (diaUrl) {
    if (!dias.some((d) => d.numero === diaUrl)) return <Navigate to="/alumno/rutina" replace />
    return (
      <div className="mx-auto max-w-md pb-10">
        <header className="mb-3">
          <p className="text-sm text-neutral-400">{rutina.rutina}</p>
          <h1 className="text-2xl font-bold leading-tight text-white">Día {diaActual.numero}{diaActual.nombre && ` · ${diaActual.nombre}`}</h1>
        </header>
        <div className="sticky top-[57px] z-[5] -mx-4 mb-4 space-y-1.5 border-b border-neutral-800 bg-neutral-950/95 px-4 pb-3 pt-2.5 backdrop-blur">
          {paraOtroDia ? (
            <p className="text-sm text-neutral-300">
              Hoy ya entrenaste el Día {diaDeHoy}. Este lo podés mirar, pero lo marcás otro día.
            </p>
          ) : (
            <BarraProgreso tareas={tareas} hecha={hecha} hechos={hechos} onReiniciar={reiniciar} />
          )}
          {yaHechoEstaSemana && !paraOtroDia && <p className="text-xs text-neutral-400">✓ Este día ya lo hiciste esta semana.</p>}
        </div>
        <div className={paraOtroDia ? 'opacity-70' : ''}>
          <ContenidoDia tareas={tareas} bloques={bloques} hecha={paraOtroDia ? () => false : hecha} marcar={marcar} />
        </div>
        {!paraOtroDia && !completo && hechos > 0 && !hechosSemana.has(diaActual.numero) && (
          <div className="mt-6">
            {confirmarFin ? (
              <div className="space-y-3 rounded-2xl border border-neutral-700 bg-neutral-900 p-4">
                <p className="font-semibold">¿Finalizar con {hechos} de {tareas.length}?</p>
                <p className="text-sm text-neutral-400">El día queda registrado en tu semana y la próxima vez seguís con el día siguiente.</p>
                <div className="flex gap-2">
                  <button onClick={finalizar} className="flex-1 rounded-xl bg-white py-3 font-semibold text-neutral-950">Finalizar</button>
                  <button onClick={() => setConfirmarFin(false)} className="flex-1 rounded-xl bg-neutral-800 py-3 font-semibold">Seguir entrenando</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmarFin(true)}
                className="w-full rounded-xl border border-neutral-700 py-3 font-semibold text-neutral-200 active:bg-neutral-800">
                Finalizar entrenamiento
              </button>
            )}
          </div>
        )}
        {completo && (
          <div className="mt-6 space-y-3 rounded-2xl bg-emerald-500/10 p-4 text-center">
            <p className="text-lg font-bold text-emerald-200">¡Día completo! 💪</p>
            <p className="text-sm text-emerald-100/80">Quedó registrado en tu semana.</p>
            <Link to="/alumno/rutina" className="block rounded-xl bg-white py-3 font-semibold text-neutral-950">Volver a la rutina</Link>
          </div>
        )}
      </div>
    )
  }

  // ----- Lista de días -----
  const marcadosDe = (d) => {
    const ids = tareasDelDia(d.items).map((t) => t.id)
    return { total: ids.length, hechas: check.dia === d.numero ? ids.filter((id) => check.marcados.includes(id)).length : 0 }
  }
  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="mb-4">
        <h1 className="text-2xl font-bold leading-tight text-white">{rutina.rutina}</h1>
        {rutina.objetivo && <p className="mt-1 text-[15px] text-neutral-200">🎯 {rutina.objetivo}</p>}
        <p className="mt-1 text-xs text-neutral-400">Actualizada el {formatearFecha(rutina.fecha_actualizacion)}</p>
        {dias.length > 1 && (
          <p className="mt-2 text-sm text-neutral-200">
            {hechosSemana.size >= dias.length
              ? '🎉 Completaste todos los días de esta semana.'
              : `Esta semana: ${hechosSemana.size} de ${dias.length} días hechos.`}
            {diaDeHoy !== null && hechosSemana.size < dias.length && ' Hoy ya entrenaste: mañana seguís con el próximo.'}
          </p>
        )}
      </header>

      <ul className="space-y-3">
        {dias.map((d) => {
          const hecho = hechosSemana.has(d.numero)
          const { total, hechas } = marcadosDe(d)
          const enCurso = hechas > 0 && hechas < total
          const toca = !hecho && diaDeHoy === null && d.numero === diaVistaInicial.current
          return (
            <li key={d.numero}>
              <Link to={`/alumno/rutina/dia/${d.numero}`}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-4 active:bg-neutral-800 ${
                  toca || enCurso ? 'border-neutral-600 bg-neutral-900' : 'border-neutral-800 bg-neutral-900/60'}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  hecho ? 'bg-emerald-500/15 text-emerald-300' : toca || enCurso ? 'bg-white text-neutral-950' : 'bg-neutral-800 text-neutral-200'}`}>
                  {hecho ? '✓' : d.numero}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">Día {d.numero}{d.nombre && ` · ${d.nombre}`}</span>
                  <span className="block text-sm text-neutral-400">
                    {total} {total === 1 ? 'tarea' : 'tareas'}
                    {hecho ? ' · hecho esta semana' : enCurso ? ` · en curso ${hechas}/${total}` : toca ? ' · hoy te toca' : ''}
                  </span>
                </span>
                {toca && !enCurso && <span className="shrink-0 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">Hoy</span>}
                <span aria-hidden className="shrink-0 text-xl text-neutral-500">›</span>
              </Link>
            </li>
          )
        })}
      </ul>
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
