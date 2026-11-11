import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { limpiarChecklists } from '../lib/checklist'
import { dniAEmail } from '../lib/utils'

const AuthContext = createContext(null)

// Mantiene la sesión de Supabase y el perfil (fila de `usuarios`) del usuario logueado.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)

  // 1) Sesión: la inicial y sus cambios (login, logout, refresh del token)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setCargando(false)
    })
    // No llamar a Supabase dentro de este callback: el perfil se busca en el efecto de abajo.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSession(nueva)
      if (!nueva) {
        setPerfil(null)
        setCargando(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 2) Perfil: cada vez que cambia el usuario logueado
  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return
    let cancelado = false
    setCargando(true)
    supabase
      .from('usuarios')
      .select('id, dni, nombre, apellido, rol, activo, debe_cambiar_clave')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (cancelado) return
        if (error || !data?.activo) {
          // Cuenta sin perfil o dada de baja: se cierra la sesión
          setPerfil(null)
          supabase.auth.signOut()
        } else {
          setPerfil(data)
        }
        setCargando(false)
      })
    return () => { cancelado = true }
  }, [userId])

  const iniciarSesion = async (dni, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: dniAEmail(dni), password })
    return { error }
  }

  // Al salir se borra el checklist guardado en el navegador: al volver, el día arranca limpio
  const cerrarSesion = () => { limpiarChecklists(); return supabase.auth.signOut() }

  // Cambio de clave (obligatorio en el primer ingreso del alumno, CU02).
  // 1) cambia la clave en Supabase Auth  2) apaga la marca debe_cambiar_clave
  const cambiarClave = async (nueva) => {
    const { error } = await supabase.auth.updateUser({ password: nueva })
    if (error) return { error }
    const { error: errorMarca } = await supabase.rpc('marcar_clave_cambiada')
    if (errorMarca) return { error: errorMarca }
    setPerfil((p) => (p ? { ...p, debe_cambiar_clave: false } : p))
    return { error: null }
  }

  return (
    <AuthContext.Provider value={{ session, perfil, cargando, iniciarSesion, cerrarSesion, cambiarClave }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
