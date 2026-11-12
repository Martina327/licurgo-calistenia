import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { mensajeError } from '../../lib/utils'
import Cargando from '../../components/Cargando'
import Aviso from '../../components/Aviso'

// Personal (CU15 · A6). SOLO SuperAdmin.
//   · Alta de recepcionistas y coaches con su email real. El sistema genera una
//     clave provisoria que el dueño le pasa; en el primer ingreso la cambian.
//   · Edición (nombre, email de ingreso, celular, rol), nueva clave provisoria,
//     baja y reactivación. El dueño no se puede editar ni dar de baja desde acá.
//   · Una recepcionista con la caja abierta no se puede dar de baja ni pasar a coach.

const ROLES = ['Recepcionista', 'Coach']
const VACIO = { nombre: '', apellido: '', email: '', telefono: '', rol: 'Recepcionista' }
const esEmailValido = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

const errorPersonal = (error) => {
  const m = error?.message ?? ''
  if (m.startsWith('EMAIL_EXISTENTE')) return 'Ya hay una cuenta con ese email.'
  if (m.startsWith('TURNO_ABIERTO')) return 'Tiene un turno de caja abierto: primero tiene que cerrarlo.'
  return mensajeError(error)
}

export default function Personal() {
  const [personal, setPersonal] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [clave, setClave] = useState(null) // { nombre, email, clave } recién generada
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState(null)
  const [verBajas, setVerBajas] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('v_personal').select('*').order('rol').order('apellido')
    setError(error ? mensajeError(error) : '')
    setPersonal(data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const limpiar = () => { setAviso(''); setClave(null); setError('') }

  const terminar = async ({ texto, nuevaClave }) => {
    setMostrarAlta(false)
    setEditando(null)
    setAviso(texto ?? '')
    setClave(nuevaClave ?? null)
    await cargar()
  }

  const cambiarEstado = async (p) => {
    limpiar()
    const { error } = await supabase.rpc('cambiar_estado_personal', { p_id: p.id, p_activo: !p.activo })
    if (error) return setError(errorPersonal(error))
    await terminar({ texto: p.activo ? `${p.nombre} ${p.apellido} fue dado de baja: ya no puede ingresar.` : `${p.nombre} ${p.apellido} puede volver a ingresar.` })
  }

  const nuevaClave = async (p) => {
    limpiar()
    const { data, error } = await supabase.rpc('restablecer_clave_personal', { p_id: p.id })
    if (error) return setError(errorPersonal(error))
    await terminar({ nuevaClave: { nombre: `${p.nombre} ${p.apellido}`, email: p.email, clave: data, telefono: p.telefono } })
  }

  if (cargando) return <Cargando />

  const visibles = personal.filter((p) => p.activo !== verBajas)
  const cantBajas = personal.filter((p) => !p.activo).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Personal</h1>
          <p className="text-sm text-neutral-400">Recepcionistas y coaches. Entran a la app con su email.</p>
        </div>
        {!mostrarAlta && (
          <button onClick={() => { setMostrarAlta(true); setEditando(null); limpiar() }} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950">
            + Personal
          </button>
        )}
      </div>

      {mostrarAlta && <FormPersonal alCancelar={() => setMostrarAlta(false)} alGuardar={terminar} />}

      {clave && <ClaveProvisoria {...clave} />}
      <Aviso tipo="ok" texto={aviso} />
      <Aviso tipo="error" texto={error} />

      <div className="flex gap-2">
        <button
          onClick={() => setVerBajas(false)}
          className={`rounded-full border px-3 py-1 text-sm ${!verBajas ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300'}`}
        >
          Activos <span className="opacity-60">({personal.length - cantBajas})</span>
        </button>
        <button
          onClick={() => setVerBajas(true)}
          className={`rounded-full border px-3 py-1 text-sm ${verBajas ? 'border-white bg-white text-neutral-950' : 'border-neutral-700 text-neutral-300'}`}
        >
          Dados de baja <span className="opacity-60">({cantBajas})</span>
        </button>
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-neutral-400">{verBajas ? 'No hay personal dado de baja.' : 'No hay personal cargado.'}</p>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {visibles.map((p) => {
            const esDueno = p.rol === 'SuperAdmin'
            return (
              <li key={p.id} className="space-y-3 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={`font-medium ${p.activo ? '' : 'text-neutral-400'}`}>
                      {p.nombre} {p.apellido}{' '}
                      <span className="ml-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">{esDueno ? 'Dueño' : p.rol}</span>
                    </p>
                    <p className="text-sm text-neutral-400">
                      {p.email ?? 'Sin email'}{p.telefono ? ` · ${p.telefono}` : ''}
                      {p.debe_cambiar_clave && <span className="text-amber-400"> · Todavía no cambió la clave provisoria</span>}
                    </p>
                  </div>
                  {!esDueno && (
                    <div className="flex flex-wrap gap-3 text-sm">
                      {p.activo && (
                        <>
                          <button onClick={() => { setEditando(p.id); setMostrarAlta(false); limpiar() }} className="text-neutral-300 hover:underline">
                            Editar
                          </button>
                          <button onClick={() => nuevaClave(p)} className="text-neutral-300 hover:underline">
                            Nueva clave
                          </button>
                        </>
                      )}
                      <button onClick={() => cambiarEstado(p)} className={p.activo ? 'text-red-400 hover:underline' : 'text-emerald-400 hover:underline'}>
                        {p.activo ? 'Dar de baja' : 'Reactivar'}
                      </button>
                    </div>
                  )}
                </div>
                {editando === p.id && <FormPersonal persona={p} alCancelar={() => setEditando(null)} alGuardar={terminar} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Clave provisoria: se muestra UNA vez para que el dueño se la pase a la persona
function ClaveProvisoria({ nombre, email, clave, telefono }) {
  const [copiado, setCopiado] = useState(false)
  const texto = `Hola ${nombre.split(' ')[0]}! Ya tenés tu usuario en la app de Licurgo.\nIngresá con tu email: ${email}\nClave provisoria: ${clave}\nAl entrar te va a pedir que elijas una clave nueva.`
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }
  const tel = telefono ? String(telefono).replace(/\D/g, '') : null
  return (
    <div className="space-y-2 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-100">
      <p className="font-medium">Clave provisoria de {nombre}</p>
      <p>
        Email: <span className="font-mono">{email}</span> · Clave: <span className="rounded bg-emerald-900/60 px-2 py-0.5 font-mono text-base tracking-wider">{clave}</span>
      </p>
      <p className="text-emerald-300/80">Pasásela ahora: por seguridad no se vuelve a mostrar. Al entrar, la app le pide una clave nueva.</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={copiar} className="rounded-lg border border-emerald-800 px-3 py-1.5 hover:bg-emerald-900/50">
          {copiado ? 'Mensaje copiado' : 'Copiar mensaje'}
        </button>
        {tel && (
          <a
            href={`https://wa.me/549${tel}?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-emerald-800 px-3 py-1.5 hover:bg-emerald-900/50"
          >
            Enviar por WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}

function FormPersonal({ persona, alCancelar, alGuardar }) {
  const esNuevo = !persona
  const [datos, setDatos] = useState(
    persona
      ? { nombre: persona.nombre, apellido: persona.apellido, email: persona.email ?? '', telefono: persona.telefono ?? '', rol: persona.rol }
      : VACIO,
  )
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const cambiar = (c) => (e) => setDatos((d) => ({ ...d, [c]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    const d = { ...datos, nombre: datos.nombre.trim(), apellido: datos.apellido.trim(), email: datos.email.trim().toLowerCase(), telefono: datos.telefono.replace(/\D/g, '') }
    if (!d.nombre || !d.apellido) return setError('Completá nombre y apellido.')
    if (!esEmailValido(d.email)) return setError('Ingresá un email válido: es con el que va a entrar a la app.')
    if (d.telefono && d.telefono.length < 10) return setError('El celular tiene que tener código de área y número (ej.: 3815551234).')

    setEnviando(true)
    if (esNuevo) {
      const { data, error } = await supabase.rpc('alta_personal', {
        p_email: d.email, p_nombre: d.nombre, p_apellido: d.apellido, p_telefono: d.telefono || null, p_rol: d.rol,
      })
      setEnviando(false)
      if (error) return setError(errorPersonal(error))
      const r = Array.isArray(data) ? data[0] : data
      return alGuardar({ nuevaClave: { nombre: `${d.nombre} ${d.apellido}`, email: d.email, clave: r.clave, telefono: d.telefono } })
    }
    const { error } = await supabase.rpc('editar_personal', {
      p_id: persona.id, p_email: d.email, p_nombre: d.nombre, p_apellido: d.apellido, p_telefono: d.telefono || null, p_rol: d.rol,
    })
    setEnviando(false)
    if (error) return setError(errorPersonal(error))
    alGuardar({
      texto: d.email !== persona.email
        ? `Cambios guardados. Ojo: ${d.nombre} ahora entra con ${d.email} (la clave no cambia).`
        : `Cambios guardados en ${d.nombre} ${d.apellido}.`,
    })
  }

  const campo = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-400'

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h2 className="font-semibold">{esNuevo ? 'Nuevo integrante del personal' : 'Editar personal'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Nombre</span>
          <input value={datos.nombre} onChange={cambiar('nombre')} className={campo} autoFocus />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Apellido</span>
          <input value={datos.apellido} onChange={cambiar('apellido')} className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Email <span className="text-neutral-500">(con este entra a la app)</span></span>
          <input type="email" value={datos.email} onChange={cambiar('email')} autoCapitalize="none" className={campo} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-400">Celular <span className="text-neutral-500">(opcional)</span></span>
          <input value={datos.telefono} onChange={cambiar('telefono')} inputMode="tel" placeholder="3815551234" className={campo} />
        </label>
        <div className="space-y-1 text-sm sm:col-span-2">
          <span className="text-neutral-400">Rol</span>
          <div className="flex gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDatos((d) => ({ ...d, rol: r }))}
                className={`flex-1 rounded-lg border px-3 py-2 ${datos.rol === r ? 'border-white bg-white font-semibold text-neutral-950' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Aviso tipo="error" texto={error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={alCancelar} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
          {enviando ? 'Guardando…' : esNuevo ? 'Dar de alta' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}
