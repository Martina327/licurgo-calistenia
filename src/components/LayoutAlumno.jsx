import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import InstalarApp from './InstalarApp'
import { Atras, IconoInicio, IconoMensualidad, IconoRutina, IconoSalir } from './Iconos'

// Pantallas secundarias: se abren desde otra pantalla y vuelven con "‹"
const SECUNDARIAS = [
  { ruta: /^\/alumno\/pagar$/, titulo: 'Pagar por transferencia', volver: '/alumno/mensualidad' },
  { ruta: /^\/alumno\/comprobantes$/, titulo: 'Mis comprobantes', volver: '/alumno/mensualidad' },
  { ruta: /^\/alumno\/rutina\/dia\/\d+$/, titulo: 'Mi rutina', volver: '/alumno/rutina' },
]

const PESTANIAS = [
  { to: '/alumno', texto: 'Inicio', Icono: IconoInicio, end: true },
  { to: '/alumno/rutina', texto: 'Rutina', Icono: IconoRutina },
  { to: '/alumno/mensualidad', texto: 'Mensualidad', Icono: IconoMensualidad, incluye: Object.keys({ '/alumno/pagar': 1, '/alumno/comprobantes': 1 }) },
]

// La app del alumno con forma de app de celular (PWA, RNF03):
//   · barra superior fija con el título (o "‹ Volver" en pantallas secundarias)
//   · pestañas abajo, al alcance del pulgar, respetando la barra de inicio del iPhone
// La barra superior mide 56px + 1px de borde: la barra de progreso de la rutina se pega debajo (top-[57px]).
export default function LayoutAlumno() {
  const { pathname } = useLocation()
  const secundaria = SECUNDARIAS.find((x) => x.ruta.test(pathname))

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          {secundaria ? (
            <>
              <Link to={secundaria.volver} aria-label="Volver" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-neutral-200 active:bg-neutral-800">
                <Atras />
              </Link>
              <span className="min-w-0 flex-1 truncate text-base font-semibold">{secundaria.titulo}</span>
            </>
          ) : (
            <>
              <img src="/icons/icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
              <span className="flex-1 text-base font-bold tracking-wide">LICURGO</span>
            </>
          )}
          <MenuCuenta />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5">
        <Outlet />
      </main>

      <nav aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {PESTANIAS.map(({ to, texto, Icono, end, incluye }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => {
                const activa = isActive || incluye?.includes(pathname)
                return `flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium ${activa ? 'text-white' : 'text-neutral-500'}`
              }}>
              <Icono className="h-6 w-6" />
              {texto}
            </NavLink>
          ))}
        </div>
      </nav>

      <InstalarApp sobrePestanias />
    </div>
  )
}

// Avatar con la inicial: abre el nombre y "Cerrar sesión"
function MenuCuenta() {
  const { perfil, cerrarSesion } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto])

  return (
    <div ref={caja} className="relative">
      <button onClick={() => setAbierto((v) => !v)} aria-label="Mi cuenta" aria-expanded={abierto}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-100">
        {perfil.nombre?.[0]?.toUpperCase()}
      </button>
      {abierto && (
        <div className="absolute right-0 top-11 w-56 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl">
          <div className="border-b border-neutral-800 px-4 py-3">
            <p className="truncate font-medium">{perfil.nombre} {perfil.apellido}</p>
            <p className="text-xs text-neutral-500">Alumno</p>
          </div>
          <button onClick={cerrarSesion} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-red-300 active:bg-neutral-800">
            <IconoSalir className="h-5 w-5" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
