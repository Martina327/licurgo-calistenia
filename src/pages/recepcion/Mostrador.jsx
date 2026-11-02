import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatearFecha, linkWhatsApp, mensajeError, MENSAJES_WHATSAPP } from '../../lib/utils'
import Cargando from '../../components/Cargando'

const COLOR_ESTADO = {
  'Al día': 'bg-emerald-950 text-emerald-300',
  'Por vencer': 'bg-amber-950 text-amber-300',
  Vencida: 'bg-red-950 text-red-300',
  'Sin membresía': 'bg-neutral-800 text-neutral-300',
}

// Mostrador de recepción:
//   · Check-in (CU03): la asistencia la marca SOLO recepción. La cuota vencida avisa, no bloquea.
//   · Invitaciones a retomar: clase de prueba sin pagar (7 días) e inactivos. WhatsApp manual.
//   · Alertas de vencimiento (CU17) con el mensaje de WhatsApp ya armado.
// Pendiente (fase 2): comprobantes (CU08), cobro en efectivo (CU06), kiosco (CU04),
// subalquileres (CU16) y caja (CU05).
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
// Check-in por mostrador
// ---------------------------------------------------------------
function CheckIn({ alumnos }) {
  const [busqueda, setBusqueda] = useState('')
  const [aviso, setAviso] = useState(null) // { tipo: 'ok' | 'alerta' | 'error', texto }
  const [enCurso, setEnCurso] = useState(null)

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (q.length < 2) return []
    return alumnos
      .filter((a) => a.dni.includes(q) || `${a.nombre} ${a.apellido}`.toLowerCase().includes(q))
      .slice(0, 6)
  }, [busqueda, alumnos])

  const marcarPresente = async (alumno) => {
    setEnCurso(alumno.alumno_id)
    setAviso(null)
    const { error } = await supabase.rpc('registrar_checkin', { p_alumno_id: alumno.alumno_id })
    setEnCurso(null)
    if (error) return setAviso({ tipo: 'error', texto: mensajeError(error) })

    const nombre = `${alumno.nombre} ${alumno.apellido}`
    if (alumno.estado_membresia === 'Vencida') {
      setAviso({ tipo: 'alerta', texto: `Presente registrado. Atención: la cuota de ${nombre} venció hace ${Math.abs(alumno.dias_restantes)} día(s).` })
    } else if (alumno.estado_alumno === 'En clase de prueba') {
      setAviso({ tipo: 'ok', texto: `Presente registrado: ${nombre} (clase de prueba).` })
    } else {
      setAviso({ tipo: 'ok', texto: `Presente registrado: ${nombre}.` })
    }
    setBusqueda('')
  }

  const colorAviso = { ok: 'bg-emerald-950 text-emerald-300', alerta: 'bg-amber-950 text-amber-300', error: 'bg-red-950 text-red-300' }

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Asistencia</h1>
        <p className="text-sm text-neutral-400">Buscá al alumno por DNI o nombre y marcá su presente. Se guarda la fecha y la hora.</p>
      </div>
      <input
        id="busqueda-checkin"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="DNI o nombre"
        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 outline-none focus:border-neutral-400"
      />
      {resultados.length > 0 && (
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {resultados.map((a) => (
            <li key={a.alumno_id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{a.nombre} {a.apellido}</p>
                <p className="text-xs text-neutral-400">
                  DNI {a.dni} · {a.estado_alumno === 'Activo' ? `vence ${formatearFecha(a.fecha_vencimiento)}` : a.estado_alumno}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${COLOR_ESTADO[a.estado_membresia]}`}>{a.estado_membresia}</span>
                <button
                  onClick={() => marcarPresente(a)}
                  disabled={enCurso === a.alumno_id}
                  className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-950 disabled:opacity-50"
                >
                  Presente
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className={`rounded-lg px-3 py-2 text-sm ${colorAviso[aviso.tipo]}`}>{aviso.texto}</p>}
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
