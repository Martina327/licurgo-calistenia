import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { INICIO_POR_ROL } from './lib/utils'
import RutaProtegida from './components/RutaProtegida'
import Layout from './components/Layout'
import Cargando from './components/Cargando'
import Login from './pages/Login'
import CambiarClave from './pages/CambiarClave'
import DashboardIngresos from './pages/superadmin/DashboardIngresos'
import Productos from './pages/superadmin/Productos'
import Salones from './pages/superadmin/Salones'
import Mostrador from './pages/recepcion/Mostrador'
import Alumnos from './pages/recepcion/Alumnos'
import Caja from './pages/recepcion/Caja'
import PanelCoach from './pages/coach/PanelCoach'
import CatalogoEjercicios from './pages/coach/CatalogoEjercicios'
import RutinaAlumno from './pages/coach/RutinaAlumno'
import ObservacionesAlumno from './pages/coach/ObservacionesAlumno'
import Plantillas from './pages/coach/Plantillas'
import InicioAlumno from './pages/alumno/InicioAlumno'
import MiRutina from './pages/alumno/MiRutina'

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
      <Route path="/cambiar-clave" element={<CambiarClave />} />
      <Route path="/" element={<Inicio />} />

      <Route element={<RutaProtegida />}>
        <Route element={<Layout />}>
          <Route element={<RutaProtegida roles={['SuperAdmin']} />}>
            <Route path="/admin" element={<DashboardIngresos />} />
            <Route path="/admin/productos" element={<Productos />} />
            <Route path="/admin/salones" element={<Salones />} />
          </Route>
          <Route element={<RutaProtegida roles={['Recepcionista', 'SuperAdmin']} />}>
            <Route path="/recepcion" element={<Mostrador />} />
            <Route path="/recepcion/alumnos" element={<Alumnos />} />
            <Route path="/recepcion/caja" element={<Caja />} />
          </Route>
          <Route element={<RutaProtegida roles={['Coach', 'SuperAdmin']} />}>
            <Route path="/coach" element={<PanelCoach />} />
            <Route path="/coach/ejercicios" element={<CatalogoEjercicios />} />
            <Route path="/coach/plantillas" element={<Plantillas />} />
            <Route path="/coach/alumnos/:alumnoId/rutina" element={<RutinaAlumno />} />
            <Route path="/coach/alumnos/:alumnoId/observaciones" element={<ObservacionesAlumno />} />
          </Route>
          <Route element={<RutaProtegida roles={['Alumno']} />}>
            <Route path="/alumno" element={<InicioAlumno />} />
            <Route path="/alumno/rutina" element={<MiRutina />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
