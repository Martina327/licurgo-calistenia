import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { INICIO_POR_ROL } from './lib/utils'
import RutaProtegida from './components/RutaProtegida'
import Layout from './components/Layout'
import Cargando from './components/Cargando'
import Login from './pages/Login'
import DashboardIngresos from './pages/superadmin/DashboardIngresos'
import Mostrador from './pages/recepcion/Mostrador'
import PanelCoach from './pages/coach/PanelCoach'
import InicioAlumno from './pages/alumno/InicioAlumno'

// "/" manda a cada uno a su pantalla de inicio según el rol (CU02)
function Inicio() {
  const { perfil, cargando } = useAuth()
  if (cargando) return <Cargando />
  return <Navigate to={perfil ? INICIO_POR_ROL[perfil.rol] : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Inicio />} />

      <Route element={<RutaProtegida />}>
        <Route element={<Layout />}>
          <Route element={<RutaProtegida roles={['SuperAdmin']} />}>
            <Route path="/admin" element={<DashboardIngresos />} />
          </Route>
          <Route element={<RutaProtegida roles={['Recepcionista', 'SuperAdmin']} />}>
            <Route path="/recepcion" element={<Mostrador />} />
          </Route>
          <Route element={<RutaProtegida roles={['Coach', 'SuperAdmin']} />}>
            <Route path="/coach" element={<PanelCoach />} />
          </Route>
          <Route element={<RutaProtegida roles={['Alumno']} />}>
            <Route path="/alumno" element={<InicioAlumno />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
