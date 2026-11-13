import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import InstalarApp from './InstalarApp'
import LayoutAlumno from './LayoutAlumno'
import {
  IconoAlumno, IconoBanco, IconoBolsa, IconoCaja, IconoCapas, IconoCerrar, IconoCorazon, IconoGrafico, IconoInicio,
  IconoLista, IconoMenu, IconoMostrador, IconoPersonas, IconoPuerta, IconoRecibo, IconoRutina, IconoSalir,
} from './Iconos'

// Menú de cada rol, agrupado en secciones. El SuperAdmin ve también las de los demás roles.
const ADMINISTRACION = {
  titulo: 'Administración',
  items: [
    { to: '/admin/productos', texto: 'Productos', icono: IconoBolsa },
    { to: '/admin/salones', texto: 'Salones', icono: IconoPuerta },
    { to: '/admin/personal', texto: 'Personal', icono: IconoPersonas },
    { to: '/admin/datos-cobro', texto: 'Datos de cobro', icono: IconoBanco },
    { to: '/admin/concurrencia', texto: 'Concurrencia', icono: IconoGrafico },
  ],
}
const recepcion = (textoCaja) => ({
  titulo: 'Recepción',
  items: [
    { to: '/recepcion', texto: 'Mostrador', end: true, icono: IconoMostrador },
    { to: '/recepcion/alumnos', texto: 'Alumnos', icono: IconoAlumno },
    { to: '/recepcion/caja', texto: textoCaja, icono: IconoCaja },
    { to: '/recepcion/comprobantes', texto: 'Comprobantes', contador: 'comprobantes', icono: IconoRecibo },
    { to: '/recepcion/aptos', texto: 'Aptos médicos', contador: 'aptos', icono: IconoCorazon },
  ],
})
const entrenamiento = (textoRutinas) => ({
  titulo: 'Entrenamiento',
  items: [
    { to: '/coach', texto: textoRutinas, end: true, icono: IconoRutina },
    { to: '/coach/plantillas', texto: 'Plantillas', icono: IconoCapas },
    { to: '/coach/ejercicios', texto: 'Ejercicios', icono: IconoLista },
  ],
})
const MENU = {
  SuperAdmin: [
    { titulo: null, items: [{ to: '/admin', texto: 'Inicio', end: true, icono: IconoInicio }] },
    ADMINISTRACION,
    recepcion('Cobros'),
    entrenamiento('Rutinas'),
  ],
  Recepcionista: [recepcion('Caja')],
  Coach: [entrenamiento('Alumnos y rutinas')],
}

export default function Layout() {
  const { perfil } = useAuth()
  // El alumno usa la app del celular: pestañas abajo y pantallas secundarias
  if (perfil.rol === 'Alumno') return <LayoutAlumno />
  return <LayoutStaff />
}

// Personal: barra de arriba con el botón ☰ y menú al costado.
//   · Compu (lg+): el menú queda fijo a la izquierda; el ☰ lo oculta o lo muestra (se recuerda).
//   · Celular: el menú se abre encima de la pantalla con el ☰ y se cierra al elegir una sección.
const CLAVE_MENU = 'licurgo:menu-abierto'
const leerPreferencia = () => {
  try { return localStorage.getItem(CLAVE_MENU) !== 'no' } catch { return true }
}

function LayoutStaff() {
  const { perfil, cerrarSesion } = useAuth()
  const secciones = MENU[perfil.rol] ?? []
  const items = secciones.flatMap((s) => s.items)
  const { pathname } = useLocation()
  // El coach arma rutinas desde la compu: en pantallas grandes el editor usa más ancho
  const ancho = pathname.startsWith('/coach') ? 'max-w-7xl' : 'max-w-5xl'
  const pendientes = usePendientes(items.some((i) => i.contador))

  const [fijo, setFijo] = useState(leerPreferencia) // compu
  const [abiertoCel, setAbiertoCel] = useState(false) // celular

  // Al cambiar de pantalla se cierra el menú del celular
  useEffect(() => setAbiertoCel(false), [pathname])
  useEffect(() => {
    if (!abiertoCel) return
    const esc = (e) => e.key === 'Escape' && setAbiertoCel(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [abiertoCel])

  const alternar = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setFijo((f) => {
        try { localStorage.setItem(CLAVE_MENU, f ? 'no' : 'si') } catch { /* sin almacenamiento: no pasa nada */ }
        return !f
      })
    } else {
      setAbiertoCel((a) => !a)
    }
  }

  const actual = items.find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))

  return (
    <div className="min-h-screen">
      {/* Fondo oscuro detrás del menú en el celular */}
      {abiertoCel && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setAbiertoCel(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-neutral-800 bg-neutral-950 transition-transform duration-200 ${
          abiertoCel ? 'translate-x-0' : '-translate-x-full'
        } ${fijo ? 'lg:translate-x-0' : 'lg:-translate-x-full'}`}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-neutral-800 px-4">
          <img src="/icons/favicon-32.png" alt="" className="h-7 w-7 rounded-md" />
          <span className="flex-1 font-bold tracking-[0.2em]">LICURGO</span>
          <button onClick={() => setAbiertoCel(false)} aria-label="Cerrar menú" className="rounded-md p-1 text-neutral-400 hover:text-white lg:hidden">
            <IconoCerrar className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {secciones.map((s, n) => (
            <div key={s.titulo ?? n} className="space-y-1">
              {s.titulo && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">{s.titulo}</p>}
              {s.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.end}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      isActive ? 'bg-neutral-900 font-medium text-white' : 'text-neutral-400 hover:bg-neutral-900/60 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-red-600" />}
                      <i.icono className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-red-500' : ''}`} />
                      <span className="flex-1">{i.texto}</span>
                      {pendientes[i.contador] > 0 && (
                        <span aria-label={`${pendientes[i.contador]} pendientes`} className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-neutral-950">
                          {pendientes[i.contador]}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-3 border-t border-neutral-800 px-4 py-3">
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate text-sm text-neutral-200">{perfil.nombre} {perfil.apellido}</p>
            <p className="text-neutral-500">{perfil.rol}</p>
          </div>
          <button onClick={cerrarSesion} className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800">
            <IconoSalir className="h-4 w-4" /> Salir
          </button>
        </div>
      </aside>

      <div className={`transition-[padding] duration-200 ${fijo ? 'lg:pl-64' : ''}`}>
        <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
          {/* Altura fija (56px + 1px de borde): la barra de progreso del alumno se pega justo debajo (top-[57px]) */}
          <div className={`mx-auto flex h-14 ${ancho} items-center gap-3 px-4`}>
            <button
              onClick={alternar}
              aria-label="Abrir o cerrar el menú"
              className="-ml-1 rounded-lg p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              <IconoMenu className="h-6 w-6" />
            </button>
            <span className="flex-1 truncate font-medium">{actual?.texto ?? ''}</span>
            <span className={`text-sm font-bold tracking-[0.2em] ${fijo ? 'lg:hidden' : ''}`}>LICURGO</span>
          </div>
        </header>
        <main className={`mx-auto ${ancho} px-4 py-6`}>
          <Outlet />
        </main>
      </div>
      <InstalarApp />
    </div>
  )
}

// Comprobantes de pago y aptos médicos por revisar: se cuentan al cambiar de pantalla y al revisar uno
const TABLAS_PENDIENTES = { comprobantes: 'comprobantes_pago', aptos: 'certificados_cargas' }
function usePendientes(activo) {
  const { pathname } = useLocation()
  const [n, setN] = useState({})
  useEffect(() => {
    if (!activo) return
    let cancelado = false
    const contar = () => Promise.all(Object.entries(TABLAS_PENDIENTES).map(([clave, tabla]) =>
      supabase.from(tabla).select('id', { count: 'exact', head: true }).eq('estado', 'Pendiente').then(({ count }) => [clave, count ?? 0])))
      .then((pares) => { if (!cancelado) setN(Object.fromEntries(pares)) })
    contar()
    window.addEventListener('licurgo:comprobantes', contar) // las bandejas avisan cuando aprueban o rechazan
    return () => { cancelado = true; window.removeEventListener('licurgo:comprobantes', contar) }
  }, [activo, pathname])
  return n
}
