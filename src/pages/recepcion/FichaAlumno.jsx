import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatearFecha, formatearPesos, hoyAR, linkWhatsApp, mensajeError } from '../../lib/utils'
import { horaAR } from '../../lib/checkin'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'
import Ayuda from '../../components/Ayuda'
import { EtiquetaUnica } from '../../components/EtiquetaEstado'
import { Atras, IconoCheck, IconoLapiz, IconoWhatsApp } from '../../components/Iconos'
import { EditarAlumno } from './Alumnos'

// Ficha de un alumno (Recepción y SuperAdmin). Se abre tocando un alumno en la pantalla Alumnos.
//   · Cuota: estado, fecha hasta la que tiene pago, precio, pase libre.
//   · Datos personales y ficha (nacimiento, domicilio, contacto de emergencia).
//   · Últimos presentes y "Marcar presente".
//   · Lápiz: editar datos, pase libre y dar de baja (EditarAlumno).
//   · Si está dado de baja: "Reactivar".
const edad = (nacimiento) => {
  if (!nacimiento) return null
  const [a, m, d] = nacimiento.split('-').map(Number)
  const [ha, hm, hd] = hoyAR().split('-').map(Number)
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0)
}

export default function FichaAlumno() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const [alumno, setAlumno] = useState(null) // fila de v_membresias o de v_alumnos_baja (deBaja)
  const [ficha, setFicha] = useState({})
  const [presentes, setPresentes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(params.get('editar') === '1')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [marcando, setMarcando] = useState(false)

  const cargar = useCallback(async () => {
    const [m, b, u, a, asis] = await Promise.all([
      supabase.from('v_membresias').select('*').eq('alumno_id', id).maybeSingle(),
      supabase.from('v_alumnos_baja').select('*').eq('alumno_id', id).maybeSingle(),
      supabase.from('usuarios').select('email_contacto').eq('id', id).maybeSingle(),
      supabase.from('alumnos').select('fecha_nacimiento, domicilio, contacto_emergencia').eq('usuario_id', id).maybeSingle(),
      supabase.from('asistencias').select('fecha, fecha_hora').eq('alumno_id', id).order('fecha_hora', { ascending: false }).limit(5),
    ])
    setAlumno(m.data ?? (b.data ? { ...b.data, deBaja: true } : null))
    setFicha({ email: u.data?.email_contacto, ...(a.data ?? {}) })
    setPresentes(asis.data ?? [])
    setCargando(false)
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  // ?editar=1 (desde Comprobantes): se abre la edición y se limpia la dirección
  useEffect(() => {
    if (params.get('editar')) setParams({}, { replace: true })
  }, [params, setParams])

  const terminar = async (texto) => {
    setEditando(false)
    setAviso(texto)
    await cargar()
  }

  const marcarPresente = async () => {
    setError('')
    setMarcando(true)
    const { error } = await supabase.rpc('registrar_checkin', { p_alumno_id: id })
    setMarcando(false)
    if (error) return setError(mensajeError(error))
    setAviso(`Presente registrado: ${alumno.nombre} ${alumno.apellido}.`)
    await cargar()
  }

  const reactivar = async () => {
    setError('')
    const { error } = await supabase.rpc('reactivar_alumno', { p_alumno_id: id })
    if (error) return setError(mensajeError(error))
    await terminar(`${alumno.nombre} ${alumno.apellido} volvió a estar activo en el sistema.`)
  }

  const volver = (
    <Link to="/recepcion/alumnos" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white">
      <Atras className="h-4 w-4" /> Alumnos
    </Link>
  )

  if (cargando) return <Cargando />
  if (!alumno) {
    return (
      <div className="space-y-4">
        {volver}
        <p className="text-sm text-neutral-400">No encontramos a ese alumno.</p>
      </div>
    )
  }

  const hoy = hoyAR()
  const presenteHoy = presentes.find((p) => p.fecha === hoy)
  const prueba = alumno.estado_alumno === 'En clase de prueba'
  const wa = linkWhatsApp(alumno.telefono)
  const anios = edad(ficha.fecha_nacimiento)

  return (
    <div className="space-y-5">
      {volver}

      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold">{alumno.nombre} {alumno.apellido}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {alumno.deBaja ? (
              <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-400">Dado de baja</span>
            ) : (
              <EtiquetaUnica alumno={alumno} />
            )}
            {alumno.datos_faltantes?.length > 0 && (
              <Ayuda
                texto={`Falta cargar: ${alumno.datos_faltantes.join(', ')}. Se completa con el lápiz.`}
                className="rounded-full border border-amber-800 px-2 py-0.5 text-[11px] font-medium text-amber-400 hover:bg-amber-950"
              >
                Falta info
              </Ayuda>
            )}
          </div>
        </div>

        {alumno.deBaja ? (
          <button onClick={reactivar} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950">
            Reactivar
          </button>
        ) : (
          <div className="flex gap-2">
            {presenteHoy ? (
              <span className="flex items-center gap-1.5 rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
                <IconoCheck className="h-4 w-4" /> Presente {horaAR(presenteHoy.fecha_hora)}
              </span>
            ) : (
              <button onClick={marcarPresente} disabled={marcando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
                {marcando ? 'Marcando…' : 'Marcar presente'}
              </button>
            )}
            <button
              onClick={() => { setEditando((e) => !e); setAviso('') }}
              aria-label="Editar datos"
              title="Editar datos"
              className={`flex h-10 w-10 items-center justify-center rounded-lg border ${editando ? 'border-white bg-neutral-800' : 'border-neutral-700 hover:bg-neutral-800'}`}
            >
              <IconoLapiz className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <Aviso tipo="ok" texto={aviso} />
      <Aviso tipo="error" texto={error} />

      {editando && !alumno.deBaja && (
        <EditarAlumno key={alumno.alumno_id} alumno={alumno} alCancelar={() => setEditando(false)} alTerminar={terminar} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Cuota */}
        <Tarjeta titulo="Cuota">
          {alumno.pase_libre ? (
            <Dato texto="Pase libre" valor={alumno.pase_libre_motivo || 'Sí'} />
          ) : prueba ? (
            <Dato texto="Clase de prueba" valor={formatearFecha(alumno.fecha_clase_prueba)} />
          ) : alumno.deBaja ? (
            <Dato texto="Último vencimiento" valor={formatearFecha(alumno.fecha_vencimiento)} />
          ) : (
            <Dato
              texto={alumno.estado_membresia === 'Vencida' ? 'Venció el' : 'Pagó hasta el'}
              valor={formatearFecha(alumno.fecha_vencimiento)}
              color={alumno.estado_membresia === 'Vencida' ? 'text-red-400' : alumno.estado_membresia === 'Por vencer' ? 'text-amber-300' : ''}
              grande
            />
          )}
          {alumno.precio_plan != null && <Dato texto="Cuota mensual" valor={formatearPesos(alumno.precio_plan)} />}
        </Tarjeta>

        {/* Contacto */}
        <Tarjeta titulo="Datos">
          <Dato texto="DNI" valor={alumno.dni} />
          <Dato
            texto="Celular"
            valor={alumno.telefono ? (
              <span className="flex items-center gap-2">
                {alumno.telefono}
                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer" title="Abrir WhatsApp" className="text-emerald-400 hover:text-emerald-300">
                    <IconoWhatsApp className="h-4 w-4" />
                  </a>
                )}
              </span>
            ) : '—'}
          />
          <Dato texto="Email" valor={ficha.email || '—'} />
        </Tarjeta>

        {/* Ficha */}
        <Tarjeta titulo="Ficha">
          <Dato texto="Nacimiento" valor={ficha.fecha_nacimiento ? `${formatearFecha(ficha.fecha_nacimiento)}${anios != null ? ` (${anios} años)` : ''}` : '—'} />
          <Dato texto="Domicilio" valor={ficha.domicilio || '—'} />
          <Dato texto="Contacto de emergencia" valor={ficha.contacto_emergencia || '—'} />
        </Tarjeta>

        {/* Asistencia */}
        <Tarjeta titulo="Últimos presentes">
          {presentes.length === 0 ? (
            <p className="py-1 text-sm text-neutral-500">Todavía no tiene presentes.</p>
          ) : (
            presentes.map((p) => (
              <Dato key={p.fecha_hora} texto={p.fecha === hoy ? 'Hoy' : formatearFecha(p.fecha)} valor={horaAR(p.fecha_hora)} />
            ))
          )}
        </Tarjeta>
      </div>
    </div>
  )
}

function Tarjeta({ titulo, children }) {
  return (
    <section className="space-y-1 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <h2 className="pb-1 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">{titulo}</h2>
      <dl className="divide-y divide-neutral-800/70">{children}</dl>
    </section>
  )
}

function Dato({ texto, valor, color = '', grande }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-neutral-400">{texto}</dt>
      <dd className={`text-right ${grande ? 'text-lg font-semibold' : ''} ${color}`}>{valor}</dd>
    </div>
  )
}
