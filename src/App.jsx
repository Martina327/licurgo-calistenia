import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { INICIO_POR_ROL } from './lib/utils'
import RutaProtegida from './components/RutaProtegida'
import Layout from './components/Layout'
import Cargando from './components/Cargando'
import ActualizacionApp from './components/ActualizacionApp'
import Login from './pages/Login'
import CambiarClave from './pages/CambiarClave'
import DashboardIngresos from './pages/superadmin/DashboardIngresos'
import DatosCobro from './pages/superadmin/DatosCobro'
import Mostrador from './pages/recepcion/Mostrador'
import Alumnos from './pages/recepcion/Alumnos'
import Comprobantes from './pages/recepcion/Comprobantes'
import PanelCoach from './pages/coach/PanelCoach'
import CatalogoEjercicios from './pages/coach/CatalogoEjercicios'
import RutinaAlumno from './pages/coach/RutinaAlumno'
import ObservacionesAlumno from './pages/coach/ObservacionesAlumno'
import Plantillas from './pages/coach/Plantillas'
import InicioAlumno from './pages/alumno/InicioAlumno'
import MiRutina from './pages/alumno/MiRutina'
import PagarCuota from './pages/alumno/PagarCuota'
import MisComprobantes from './pages/alumno/MisComprobantes'

// "/" manda a cada uno a su pantalla de inicio según el rol (CU02)
function Inicio() {
  const { perfil, cargando } = useAuth()
  if (cargando) return <Cargando />
  return <Navigate to={perfil ? INICIO_POR_ROL[perfil.rol] : '/login'} replace />
}

export default function App() {
  return (
    <>
    <ActualizacionApp />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cambiar-clave" element={<CambiarClave />} />
      <Route path="/" element={<Inicio />} />

      <Route element={<RutaProtegida />}>
        <Route element={<Layout />}>
          <Route element={<RutaProtegida roles={['SuperAdmin']} />}>
            <Route path="/admin" element={<DashboardIngresos />} />
            <Route path="/admin/datos-cobro" element={<DatosCobro />} />
          </Route>
          <Route element={<RutaProtegida roles={['Recepcionista', 'SuperAdmin']} />}>
            <Route path="/recepcion" element={<Mostrador />} />
            <Route path="/recepcion/alumnos" element={<Alumnos />} />
            <Route path="/recepcion/comprobantes" element={<Comprobantes />} />
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
            <Route path="/alumno/pagar" element={<PagarCuota />} />
            <Route path="/alumno/comprobantes" element={<MisComprobantes />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
