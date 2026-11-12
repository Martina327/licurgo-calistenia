import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { linkWhatsApp, MENSAJES_WHATSAPP } from '../../lib/utils'
import { useInicioAlumno } from '../../lib/useInicioAlumno'
import {
  fechasEntrenadas, fraseDelDia, mensajeSemana, mes, objetivoSemanal, rachaSemanas, semanaActual, semanas,
} from '../../lib/racha'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import { Chevron, IconoCheck, IconoFuego, IconoWhatsApp } from '../../components/Iconos'

// Fotos del gimnasio (public/img/gimnasio). Se muestra una por día y van pasando solas.
export const FOTOS_GIMNASIO = ['pared-logo', 'sala', 'anilla-logo', 'anilla', 'espalderas', 'paralelas', 'anillas']
  .map((n) => `/img/gimnasio/${n}.jpg`)

// Quién atiende el WhatsApp del gimnasio
const CONTACTO = { nombre: 'Gero', foto: '/img/gero.jpg' }

const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Inicio del alumno: motivación para entrenar.
//   · Foto de Licurgo con la frase del día
//   · Racha de semanas cumplidas y la semana en curso (meta = días de su rutina)
//   · Calendario del mes y las últimas 8 semanas
//   · Qué día de la rutina le toca hoy · Contacto con Gero por WhatsApp
export default function InicioAlumno() {
  const d = useInicioAlumno()

  const datos = useMemo(() => {
    if (d.cargando) return null
    const fechas = fechasEntrenadas(d.asistencias, d.completados)
    const objetivo = objetivoSemanal(d.diasRutina)
    const semana = semanaActual(fechas, d.hoy)
    const entrenados = semana.filter((x) => x.entrenado).length
    const racha = rachaSemanas(fechas, d.hoy, objetivo)
    return {
      objetivo, semana, entrenados, racha,
      mes: mes(fechas, d.hoy),
      historial: semanas(fechas, d.hoy, objetivo, 8),
      mensaje: mensajeSemana({ entrenados, objetivo, racha, entrenoHoy: fechas.has(d.hoy) }),
    }
  }, [d])

  if (d.cargando) return <Cargando />
  const m = d.membresia

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Hola{m?.nombre ? `, ${m.nombre}` : ''}</h1>
      {d.error && <Aviso tipo="error" texto={d.error} />}

      <FotoFrase hoy={d.hoy} />

      {(m?.estado_membresia === 'Vencida' || m?.estado_membresia === 'Por vencer') && (
        <Link to="/alumno/mensualidad"
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${m.estado_membresia === 'Vencida' ? 'bg-red-500/10 text-red-200' : 'bg-amber-500/10 text-amber-200'}`}>
          <span className="flex-1">
            {m.estado_membresia === 'Vencida'
              ? `Tu cuota venció hace ${Math.abs(m.dias_restantes)} día${Math.abs(m.dias_restantes) === 1 ? '' : 's'}.`
              : m.dias_restantes === 0 ? 'Tu cuota vence hoy.' : `Tu cuota vence en ${m.dias_restantes} día${m.dias_restantes === 1 ? '' : 's'}.`}
            <span className="font-semibold"> Ver mensualidad</span>
          </span>
          <Chevron className="h-5 w-5 shrink-0 opacity-60" />
        </Link>
      )}

      <Racha {...datos} />

      <EntrenarHoy dia={d.diaHoy} hechoHoy={d.hechoHoy} hayRutina={d.diasRutina > 0} />

      <Mes mes={datos.mes} hoy={d.hoy} />

      <Semanas historial={datos.historial} objetivo={datos.objetivo} />

      {d.whatsapp && (
        <a href={linkWhatsApp(d.whatsapp, MENSAJES_WHATSAPP.contacto(m?.nombre ?? '', m?.apellido ?? ''))} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-4 overflow-hidden rounded-3xl bg-neutral-900 p-3 pr-4 active:bg-neutral-800">
          <img src={CONTACTO.foto} alt={CONTACTO.nombre} className="h-20 w-16 shrink-0 rounded-2xl object-cover object-top" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-neutral-400">¿Dudas o sugerencias?</span>
            <span className="block text-lg font-semibold leading-tight">Escribile a {CONTACTO.nombre}</span>
            <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300">
              <IconoWhatsApp className="h-4 w-4" /> WhatsApp
            </span>
          </span>
          <Chevron className="h-5 w-5 shrink-0 text-neutral-600" />
        </a>
      )}
    </div>
  )
}

// Foto del gimnasio con la frase del día. Pasan solas cada 6 s (no si el sistema pide menos movimiento).
function FotoFrase({ hoy }) {
  const inicio = useMemo(() => Number(hoy.slice(8)) % FOTOS_GIMNASIO.length, [hoy])
  const [i, setI] = useState(inicio)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI((x) => (x + 1) % FOTOS_GIMNASIO.length), 6000)
    return () => clearInterval(t)
  }, [])
  return (
    <section className="relative h-56 overflow-hidden rounded-3xl bg-neutral-900">
      {FOTOS_GIMNASIO.map((src, k) => (
        <img key={src} src={src} alt="" aria-hidden loading={k === inicio ? 'eager' : 'lazy'}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${k === i ? 'opacity-100' : 'opacity-0'}`} />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
      <img src="/img/logo-licurgo.png" alt="Licurgo" className="absolute left-4 top-4 h-9 w-9 rounded-full ring-1 ring-white/20" />
      <blockquote className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-lg font-semibold leading-snug text-white [text-wrap:balance]">“{fraseDelDia(hoy)}”</p>
      </blockquote>
    </section>
  )
}

function Racha({ racha, semana, entrenados, objetivo, mensaje }) {
  const cumplida = entrenados >= objetivo
  return (
    <section className="rounded-3xl bg-neutral-900 p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${racha > 0 ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-500'}`}>
          <IconoFuego className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none tabular-nums">
            {racha} <span className="text-base font-semibold">{racha === 1 ? 'semana' : 'semanas'}</span>
          </p>
          <p className="mt-1 text-sm text-neutral-400">de racha · meta {objetivo} día{objetivo === 1 ? '' : 's'} por semana</p>
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="Esta semana">
        {semana.map((x) => (
          <li key={x.fecha} className="flex flex-col items-center gap-1.5">
            <span className={`text-xs ${x.hoy ? 'font-bold text-white' : 'text-neutral-500'}`}>{x.letra}</span>
            <span aria-label={`${x.letra}: ${x.entrenado ? 'entrenaste' : x.futuro ? 'todavía no llegó' : 'sin entrenar'}`}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                x.entrenado ? 'bg-red-600 text-white' : x.hoy ? 'border-2 border-dashed border-neutral-500' : x.futuro ? 'bg-neutral-800/50' : 'bg-neutral-800'}`}>
              {x.entrenado && <IconoCheck className="h-5 w-5" />}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
          <div className={`h-full rounded-full transition-all ${cumplida ? 'bg-red-500' : 'bg-red-600/80'}`}
            style={{ width: `${Math.min(100, (entrenados / objetivo) * 100)}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums">{entrenados}/{objetivo}</span>
      </div>
      <p className="mt-2 text-sm text-neutral-300">{mensaje}</p>
    </section>
  )
}

function EntrenarHoy({ dia, hechoHoy, hayRutina }) {
  if (!hayRutina) {
    return <p className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm text-neutral-400">Cuando tu coach te arme la rutina, vas a verla acá.</p>
  }
  return (
    <Link to={hechoHoy || !dia ? '/alumno/rutina' : `/alumno/rutina/dia/${dia.numero}`} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-neutral-950 active:bg-neutral-200">
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-neutral-500">{hechoHoy ? 'Ya entrenaste hoy 💪' : 'Hoy te toca'}</span>
        <span className="block truncate text-lg font-bold">
          {hechoHoy ? 'Ver mi rutina' : `Día ${dia?.numero}${dia?.nombre ? ` · ${dia.nombre}` : ''}`}
        </span>
      </span>
      <span className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white">{hechoHoy ? 'Ver' : 'Entrenar'}</span>
    </Link>
  )
}

function Mes({ mes: { celdas, total }, hoy }) {
  const nombre = NOMBRES_MES[Number(hoy.slice(5, 7)) - 1]
  return (
    <section className="rounded-3xl bg-neutral-900 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold capitalize">{nombre}</h2>
        <p className="text-sm text-neutral-400"><span className="font-semibold text-white tabular-nums">{total}</span> día{total === 1 ? '' : 's'} entrenados</p>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-neutral-500">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((l) => <span key={l}>{l}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {celdas.map((c, k) => (
          <span key={k} aria-label={c ? `${c.dia}: ${c.entrenado ? 'entrenaste' : 'sin entrenar'}` : undefined}
            className={`flex h-8 items-center justify-center rounded-lg text-xs tabular-nums ${
              !c ? '' : c.entrenado ? 'bg-red-600 font-semibold text-white' : c.hoy ? 'ring-1 ring-inset ring-white/60 text-white' : c.futuro ? 'text-neutral-700' : 'bg-neutral-800/60 text-neutral-400'}`}>
            {c?.dia}
          </span>
        ))}
      </div>
    </section>
  )
}

// Días entrenados por semana con la meta como línea punteada
function Semanas({ historial, objetivo }) {
  const max = Math.max(objetivo, ...historial.map((s) => s.entrenados), 1) * 1.25 // lugar para el número arriba
  const alto = (n) => `${(n / max) * 100}%`
  const etiqueta = (s) => (s.actual ? 'Esta' : `${s.lunes.slice(8)}/${s.lunes.slice(5, 7)}`)
  return (
    <section className="rounded-3xl bg-neutral-900 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Últimas 8 semanas</h2>
        <span className="flex items-center gap-1.5 text-xs text-neutral-400">
          <span className="w-4 border-t-2 border-dashed border-neutral-400" /> meta {objetivo}
        </span>
      </div>
      <div className="relative mt-4 h-32">
        <div className="absolute inset-x-0 border-t-2 border-dashed border-neutral-500/70" style={{ bottom: alto(objetivo) }} />
        <div className="absolute inset-0 flex items-end gap-2">
          {historial.map((s) => (
            <div key={s.lunes} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className={`text-xs tabular-nums ${s.entrenados ? 'text-neutral-200' : 'text-neutral-600'}`}>{s.entrenados}</span>
              <div aria-label={`Semana del ${s.lunes.slice(8)}/${s.lunes.slice(5, 7)}: ${s.entrenados} días`}
                className={`w-full rounded-t-[4px] ${s.cumplida ? 'bg-red-600' : 'bg-neutral-600'} ${s.actual ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-neutral-900' : ''}`}
                style={{ height: s.entrenados ? alto(s.entrenados) : 3 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        {historial.map((s) => (
          <span key={s.lunes} className={`flex-1 text-center text-[10px] ${s.actual ? 'font-semibold text-white' : 'text-neutral-500'}`}>{etiqueta(s)}</span>
        ))}
      </div>
      <p className="mt-3 text-xs text-neutral-500">En rojo, las semanas en que cumpliste la meta. Cuenta cada día que recepción marcó tu presente o que completaste tu rutina.</p>
    </section>
  )
}
