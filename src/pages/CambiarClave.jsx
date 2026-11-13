import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { INICIO_POR_ROL } from '../lib/utils'
import Cargando from '../components/Cargando'
import Aviso from '../components/Aviso'
import CampoClave from '../components/CampoClave'

// CU02 · Cambio de clave obligatorio en el primer ingreso.
// El alumno se da de alta con su DNI como clave inicial (alta_clase_prueba).
// Mientras perfil.debe_cambiar_clave sea TRUE, RutaProtegida lo manda acá.
const MINIMO = 8

export default function CambiarClave() {
  const { perfil, cargando, cambiarClave, cerrarSesion } = useAuth()
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (cargando) return <Cargando />
  if (!perfil) return <Navigate to="/login" replace />
  if (!perfil.debe_cambiar_clave) return <Navigate to={INICIO_POR_ROL[perfil.rol]} replace />

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (nueva.length < MINIMO) return setError(`La clave tiene que tener al menos ${MINIMO} caracteres.`)
    if (perfil.dni && nueva === perfil.dni) return setError('La clave nueva no puede ser tu DNI.')
    if (nueva !== repetida) return setError('Las dos claves no coinciden.')

    setEnviando(true)
    const { error } = await cambiarClave(nueva)
    setEnviando(false)
    if (error) {
      console.error('Error al cambiar la clave:', error)
      return setError(
        error.code === 'same_password'
          ? 'La clave nueva tiene que ser distinta de la actual.'
          : `No se pudo cambiar la clave: ${error.message}`,
      )
    }
    // Al apagarse debe_cambiar_clave, el Navigate de arriba lo lleva a su inicio
  }

  const campo = 'w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 outline-none focus:border-neutral-400'

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={guardar} className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-wide">LICURGO</h1>
          <p className="mt-1 text-sm text-neutral-400">Calistenia</p>
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Hola, {perfil.nombre}</h2>
          <p className="text-sm text-neutral-400">
            {perfil.rol === 'Alumno' ? 'Es tu primer ingreso. Elegí una clave nueva para reemplazar la inicial (tu DNI).' : 'Elegí una clave nueva para reemplazar la provisoria que te pasaron.'}
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-neutral-300">Clave nueva</span>
          <CampoClave autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} className={campo} autoFocus />
          <span className="text-xs text-neutral-500">Mínimo {MINIMO} caracteres.{perfil.rol === 'Alumno' ? ' No puede ser tu DNI.' : ''}</span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-neutral-300">Repetí la clave nueva</span>
          <CampoClave autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} className={campo} />
        </label>

        <Aviso tipo="error" texto={error} />

        <button
          type="submit"
          disabled={enviando || !nueva || !repetida}
          className="w-full rounded-xl bg-white py-3 font-semibold text-neutral-950 disabled:opacity-50"
        >
          {enviando ? 'Guardando…' : 'Guardar clave'}
        </button>

        <button type="button" onClick={cerrarSesion} className="w-full text-sm text-neutral-400 hover:text-white">
          Salir
        </button>
      </form>
    </div>
  )
}
