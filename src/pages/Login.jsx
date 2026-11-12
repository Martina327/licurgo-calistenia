import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { esDniValido, INICIO_POR_ROL } from '../lib/utils'

// CU02 – Autenticarse: alumnos con DNI, personal con email (A6)
export default function Login() {
  const { perfil, cargando, iniciarSesion } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Ya logueado → a su pantalla de inicio
  if (!cargando && perfil) return <Navigate to={INICIO_POR_ROL[perfil.rol]} replace />

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    const valor = usuario.trim()
    const esEmail = valor.includes('@')
    if (esEmail ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor) : !esDniValido(valor.replace(/[.\s]/g, ''))) {
      setError(esEmail ? 'Revisá el email.' : 'Ingresá tu DNI (7 u 8 números) o, si sos del personal, tu email.')
      return
    }
    setEnviando(true)
    const { error } = await iniciarSesion(valor, password)
    setEnviando(false)
    if (error) {
      console.error('Error de login:', error)
      setError(
        error.message === 'Invalid login credentials'
          ? `${esEmail ? 'Email' : 'DNI'} o contraseña incorrectos.`
          : `No se pudo iniciar sesión: ${error.message}`,
      )
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-wide">LICURGO</h1>
          <p className="mt-1 text-sm text-neutral-400">Calistenia</p>
        </div>

        <label className="block">
          <span className="text-sm text-neutral-300">DNI o email</span>
          <input
            autoComplete="username"
            autoCapitalize="none"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Alumnos: DNI · Personal: email"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 outline-none focus:border-neutral-400"
          />
        </label>

        <label className="block">
          <span className="text-sm text-neutral-300">Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 outline-none focus:border-neutral-400"
          />
        </label>

        {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={enviando || !usuario.trim() || !password}
          className="w-full rounded-lg bg-white py-2.5 font-semibold text-neutral-950 disabled:opacity-40"
        >
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
