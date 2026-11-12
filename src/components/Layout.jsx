import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Menú de cada rol. El SuperAdmin ve también las secciones de los demás roles.
const MENU = {
  SuperAdmin: [
    { to: '/admin', texto: 'Ingresos' },
    { to: '/recepcion', texto: 'Mostrador', end: true },
    { to: '/recepcion/alumnos', texto: 'Alumnos' },
    { to: '/recepcion/caja', texto: 'Caja' },
    { to: '/coach', texto: 'Rutinas', end: true },
    { to: '/coach/plantillas', texto: 'Plantillas' },
    { to: '/coach/ejercicios', texto: 'Ejercicios' },
  ],
  Recepcionista: [
    { to: '/recepcion', texto: 'Mostrador', end: true },
    { to: '/recepcion/alumnos', texto: 'Alumnos' },
    { to: '/recepcion/caja', texto: 'Caja' },
  ],
  Coach: [
    { to: '/coach', texto: 'Alumnos y rutinas', corto: 'Alumnos', end: true },
    { to: '/coach/plantillas', texto: 'Plantillas' },
    { to: '/coach/ejercicios', texto: 'Ejercicios' },
  ],
  Alumno: [
    { to: '/alumno', texto: 'Mi membresía', corto: 'Membresía', end: true },
    { to: '/alumno/rutina', texto: 'Mi rutina' },
  ],
}

export default function Layout() {
  const { perfil, cerrarSesion } = useAuth()
  const items = MENU[perfil.rol] ?? []

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        {/* Altura fija (56px + 1px de borde): la barra de progreso del alumno se pega justo debajo (top-[57px]) */}
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:gap-4">
          {/* En el celular se oculta la marca para que entre el menú completo */}
          <span className="hidden shrink-0 font-bold tracking-wide sm:inline">LICURGO</span>
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-2 py-1.5 text-sm sm:px-3 ${
                    isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                  }`
                }
              >
                {/* En el celular, el nombre corto para que entre todo el menú */}
                {i.corto ? <><span className="sm:hidden">{i.corto}</span><span className="hidden sm:inline">{i.texto}</span></> : i.texto}
              </NavLink>
            ))}
          </nav>
          <div className="hidden text-right text-xs sm:block">
            <div className="text-neutral-200">{perfil.nombre} {perfil.apellido}</div>
            <div className="text-neutral-500">{perfil.rol}</div>
          </div>
          <button
            onClick={cerrarSesion}
            className="shrink-0 rounded-md border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 sm:px-3"
          >
            Salir
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
