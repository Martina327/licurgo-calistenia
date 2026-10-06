import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { INICIO_POR_ROL } from '../lib/utils'
import Cargando from './Cargando'

// Deja pasar solo a usuarios logueados con alguno de los roles indicados.
// Ojo: esto ordena la navegación. La seguridad real está en el RLS de Supabase.
export default function RutaProtegida({ roles }) {
  const { perfil, cargando } = useAuth()

  if (cargando) return <Cargando />
  if (!perfil) return <Navigate to="/login" replace />
  if (roles && !roles.includes(perfil.rol)) {
    return <Navigate to={INICIO_POR_ROL[perfil.rol] ?? '/login'} replace />
  }
  return <Outlet />
}
