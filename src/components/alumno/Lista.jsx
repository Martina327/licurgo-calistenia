import { Link } from 'react-router-dom'
import { Chevron } from '../Iconos'

// Lista agrupada estilo iOS: filas con ícono, título, detalle y flecha
export function Lista({ titulo, children }) {
  return (
    <section className="space-y-2">
      {titulo && <h2 className="px-1 text-sm font-medium text-neutral-400">{titulo}</h2>}
      <ul className="divide-y divide-neutral-800 overflow-hidden rounded-2xl bg-neutral-900">{children}</ul>
    </section>
  )
}

export function Fila({ to, href, onClick, Icono, colorIcono = 'bg-neutral-800 text-neutral-200', titulo, detalle, valor }) {
  const contenido = (
    <>
      {Icono && (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorIcono}`}>
          <Icono className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-neutral-100">{titulo}</span>
        {detalle && <span className="block truncate text-sm text-neutral-400">{detalle}</span>}
      </span>
      {valor && <span className="shrink-0 text-sm text-neutral-400">{valor}</span>}
      {(to || href || onClick) && <Chevron className="h-5 w-5 shrink-0 text-neutral-600" />}
    </>
  )
  const clase = 'flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral-800'
  return (
    <li>
      {to ? <Link to={to} className={clase}>{contenido}</Link>
        : href ? <a href={href} target="_blank" rel="noopener noreferrer" className={clase}>{contenido}</a>
          : onClick ? <button onClick={onClick} className={clase}>{contenido}</button>
            : <div className={clase}>{contenido}</div>}
    </li>
  )
}
