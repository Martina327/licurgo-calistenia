import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, hoyAR, linkWhatsApp, mensajeError, MENSAJES_WHATSAPP } from '../../lib/utils'
import { buscarParaCheckin, horaAR, situacionCheckin, tienePaseLibre, TONOS } from '../../lib/checkin'
import Cargando from '../../components/Cargando'

// Mostrador de recepción:
//   · Check-in (CU03): la asistencia la marca SOLO recepción. La cuota vencida avisa, no bloquea.
//   · Invitaciones a retomar: clase de prueba sin pagar (7 días) e inactivos. WhatsApp manual.
//   · Alertas de vencimiento (CU17) con el mensaje de WhatsApp ya armado.
export default function Mostrador() {
  const [alumnos, setAlumnos] = useState([])
  const [alertas, setAlertas] = useState([])
  const [invitaciones, setInvitaciones] = useState([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    const [m, a, i] = await Promise.all([
      supabase.from('v_membresias').select('*').order('apellido'),
      supabase.from('v_alertas').select('*').order('dias_restantes', { ascending: true, nullsFirst: true }),
      supabase.from('v_invitaciones_pendientes').select('*').order('dias', { ascending: false }),
    ])
    setAlumnos(m.data ?? [])
    setAlertas(a.data ?? [])
    setInvitaciones(i.data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (cargando) return <Cargando />

  return (
    <div className="space-y-8">
      <CheckIn alumnos={alumnos} />
      <Invitaciones invitaciones={invitaciones} alRegistrar={cargar} />
      <Alertas alertas={alertas} />
    </div>
  )
}

// ---------------------------------------------------------------
// Check-in por mostrador (B6 · CU03 · RF11)
//   · Buscar por DNI (con o sin puntos) o nombre; Enter marca si hay un solo resultado
//   · Quien ya tiene presente hoy muestra la hora en lugar del botón
//   · Cuota vencida: avisa en rojo pero registra igual (no bloquea)
//   · Pase Libre (A6) cuenta como al día; si la columna todavía no existe, se lee como falso
// ---------------------------------------------------------------
function CheckIn({ alumnos }) {
  const [busqueda, setBusqueda] = useState('')
  const [resultado, setResultado] = useState(null) // { alumno, situacion, hora } o { error }
  const [enCurso, setEnCurso] = useState(null)
  const [presentes, setPresentes] = useState([]) // [{ alumno_id, fecha_hora }] de hoy
  const [verPresentes, setVerPresentes] = useState(false)
  const input = useRef(null)

  const cargarPresentes = useCallback(async () => {
    const { data } = await supabase.from('asistencias').select('alumno_id, fecha_hora').eq('fecha', hoyAR())
      .order('fecha_hora', { ascending: false })
    setPresentes(data ?? [])
  }, [])
  useEffect(() => { cargarPresentes() }, [cargarPresentes])

  const horaDe = useMemo(() => Object.fromEntries(presentes.map((p) => [p.alumno_id, p.fecha_hora])), [presentes])
  const porId = useMemo(() => Object.fromEntries(alumnos.map((a) => [a.alumno_id, a])), [alumnos])
  const resultados = useMemo(() => buscarParaCheckin(alumnos, busqueda), [busqueda, alumnos])

  const marcarPresente = async (alumno) => {
    if (enCurso) return
    setEnCurso(alumno.alumno_id)
    const { data, error } = await supabase.rpc('registrar_checkin', { p_alumno_id: alumno.alumno_id })
    setEnCurso(null)
    if (error) return setResultado({ error: mensajeError(error) })
    const yaEstaba = Boolean(horaDe[alumno.alumno_id])
    setResultado({ alumno, situacion: situacionCheckin(alumno), hora: data?.fecha_hora ?? new Date().toISOString(), yaEstaba })
    setBusqueda('')
    input.current?.focus()
    cargarPresentes()
  }

  const alEnter = (e) => {
    if (e.key === 'Enter' && resultados.length === 1 && !horaDe[resultados[0].alumno_id]) marcarPresente(resultados[0])
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Asistencia</h1>
          <p className="text-sm text-neutral-400">Buscá por DNI o nombre y marcá el presente. Una cuota vencida no impide entrar: solo avisa.</p>
        </div>
        <button onClick={() => setVerPresentes((v) => !v)}
          className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-900">
          Presentes hoy <span className="font-semibold text-white">{presentes.length}</span> {verPresentes ? '▾' : '▸'}
        </button>
      </div>

      <input
        id="busqueda-checkin"
        ref={input}
        autoFocus
        value={busqueda}
        onChange={(e) => { setBusqueda(e.target.value); if (e.target.value) setResultado(null) }}
        onKeyDown={alEnter}
        inputMode="search"
        autoComplete="off"
        placeholder="DNI o nombre"
        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-lg outline-none focus:border-neutral-400"
      />

      {busqueda.trim() && resultados.length === 0 && (
        <p className="px-1 text-sm text-neutral-500">No encontramos a nadie con "{busqueda.trim()}". Si es nuevo, dalo de alta en Alumnos.</p>
      )}

      {resultados.length > 0 && (
        <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
          {resultados.map((a) => {
            const sit = situacionCheckin(a)
            const hora = horaDe[a.alumno_id]
            return (
              <li key={a.alumno_id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.apellido}, {a.nombre}</p>
                  <p className="text-sm text-neutral-400">
                    DNI {a.dni}{a.fecha_vencimiento && !tienePaseLibre(a) ? ` · vence ${formatearFecha(a.fecha_vencimiento)}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${TONOS[sit.tono].chip}`}>{sit.etiqueta}</span>
                {hora ? (
                  <span className="w-28 shrink-0 text-right text-sm text-emerald-300">✓ Presente {horaAR(hora)}</span>
                ) : (
                  <button onClick={() => marcarPresente(a)} disabled={Boolean(enCurso)}
                    className="w-28 shrink-0 rounded-lg bg-white py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
                    {enCurso === a.alumno_id ? 'Marcando…' : 'Presente'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {resultados.length === 1 && !horaDe[resultados[0].alumno_id] && (
        <p className="hidden px-1 text-xs text-neutral-500 sm:block">Enter para marcar el presente.</p>
      )}

      {resultado?.error && <p className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">{resultado.error}</p>}
      {resultado?.alumno && (
        <div role="status" className={`rounded-xl border px-4 py-3 ${TONOS[resultado.situacion.tono].caja}`}>
          <p className="font-semibold">
            {resultado.yaEstaba ? 'Ya tenía el presente de hoy' : 'Presente registrado'} · {resultado.alumno.nombre} {resultado.alumno.apellido}
            <span className="font-normal opacity-70"> · {horaAR(resultado.hora)}</span>
          </p>
          <p className="text-sm opacity-90">{resultado.situacion.texto}</p>
        </div>
      )}

      {verPresentes && (
        presentes.length === 0 ? (
          <p className="px-1 text-sm text-neutral-500">Todavía no hay presentes hoy.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 text-sm">
            {presentes.map((p) => {
              const a = porId[p.alumno_id]
              return (
                <li key={p.alumno_id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="truncate">{a ? `${a.apellido}, ${a.nombre}` : 'Alumno dado de baja'}</span>
                  <span className="shrink-0 tabular-nums text-neutral-400">{horaAR(p.fecha_hora)}</span>
                </li>
              )
            })}
          </ul>
        )
      )}
    </section>
  )
}

// ---------------------------------------------------------------
// Invitaciones a retomar (clase de prueba sin pagar · inactivos)
// ---------------------------------------------------------------
function Invitaciones({ invitaciones, alRegistrar }) {
  const [error, setError] = useState(null)

  const marcarEnviada = async (inv) => {
    setError(null)
    const { error } = await supabase.rpc('registrar_invitacion', { p_alumno_id: inv.alumno_id, p_motivo: inv.motivo })
    if (error) return setError(mensajeError(error))
    alRegistrar()
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Invitaciones a retomar</h2>
        <p className="text-sm text-neutral-400">
          Personas que hicieron la clase de prueba hace 7 días o más sin pagar, y alumnos inactivos. Abrí WhatsApp, enviá el mensaje y marcalo como enviado.
        </p>
      </div>
      {invitaciones.length === 0 ? (
        <p className="text-sm text-neutral-400">No hay invitaciones pendientes.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {invitaciones.map((inv) => {
            const wa = linkWhatsApp(inv.telefono, MENSAJES_WHATSAPP[inv.motivo](inv.nombre))
            return (
              <li key={inv.alumno_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{inv.nombre} {inv.apellido}</p>
                  <p className="text-xs text-neutral-400">
                    {inv.motivo === 'Clase de prueba' ? `Clase de prueba el ${formatearFecha(inv.desde)}` : `Cuota vencida el ${formatearFecha(inv.desde)}`} · hace {inv.dias} días
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {wa ? (
                    <a href={wa} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Abrir WhatsApp</a>
                  ) : (
                    <span className="text-neutral-500">Sin celular</span>
                  )}
                  <button onClick={() => marcarEnviada(inv)} className="rounded-lg border border-neutral-700 px-3 py-1.5 hover:bg-neutral-900">
                    Marcar enviada
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}
    </section>
  )
}

// ---------------------------------------------------------------
// Alertas de vencimiento (CU17)
// ---------------------------------------------------------------
function Alertas({ alertas }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Alertas de vencimiento</h2>
        <p className="text-sm text-neutral-400">
          Membresías que vencen en 3 días o menos y certificados de aptitud por vencer, vencidos o faltantes.
        </p>
      </div>

      {alertas.length === 0 ? (
        <p className="text-sm text-neutral-400">No hay alertas.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-neutral-400">
              <tr>
                <th className="px-3 py-2">Alumno</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a) => {
                const texto = a.tipo === 'Membresía'
                  ? MENSAJES_WHATSAPP.vencimiento(a.nombre, a.dias_restantes)
                  : MENSAJES_WHATSAPP.certificado(a.nombre)
                const wa = linkWhatsApp(a.telefono, texto)
                return (
                  <tr key={`${a.alumno_id}-${a.tipo}`} className="border-t border-neutral-800">
                    <td className="px-3 py-2">{a.nombre} {a.apellido}</td>
                    <td className="px-3 py-2">{a.tipo}</td>
                    <td className="px-3 py-2">{a.estado}</td>
                    <td className="px-3 py-2">{formatearFecha(a.vence)}</td>
                    <td className="px-3 py-2 text-right">
                      {wa && (
                        <a href={wa} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                          WhatsApp
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
