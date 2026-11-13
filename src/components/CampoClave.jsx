import { useState } from 'react'
import { IconoOjo, IconoOjoTachado } from './Iconos'

// Campo de contraseña con un ojito a la derecha para ver lo que se va escribiendo.
// Recibe las mismas props que un <input> (value, onChange, autoComplete, className…);
// `contenedor` lleva los márgenes, así el ojito queda centrado en el campo.
export default function CampoClave({ className = '', contenedor = '', ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className={`relative ${contenedor}`}>
      <input {...props} type={visible ? 'text' : 'password'} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-400 hover:text-white"
      >
        {visible ? <IconoOjoTachado className="h-5 w-5" /> : <IconoOjo className="h-5 w-5" />}
      </button>
    </div>
  )
}
