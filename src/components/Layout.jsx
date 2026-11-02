import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Menú de cada rol. El SuperAdmin ve también las secciones de los demás roles.
const MENU = {
  SuperAdmin: [
    { to: '/admin', texto: 'Ingresos' },
    { to: '/recepcion', texto: 'Mostrador' },
    { to: '/coach', texto: 'Rutinas' },
  ],
  Recepcionista: [{ to: '/recepcion', texto: 'Mostrador' }],
  Coach: [{ to: '/coach', texto: 'Alumnos y rutinas' }],
  Alumno: [{ to: '/alumno', texto: 'Mi membresía' }],
}

export default function Layout() {
  const { perfil, cerrarSesion } = useAuth()
  const items = MENU[perfil.rol] ?? []

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="font-bold tracking-wide">LICURGO</span>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
                    isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                  }`
                }
              >
                {i.texto}
              </NavLink>
            ))}
          </nav>
          <div className="hidden text-right text-xs sm:block">
            <div className="text-neutral-200">{perfil.nombre} {perfil.apellido}</div>
            <div className="text-neutral-500">{perfil.rol}</div>
          </div>
          <button
            onClick={cerrarSesion}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
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
