// Íconos de línea (24×24, trazo 2) para la app del alumno. Sin dependencias.
const Base = ({ children, className = 'h-6 w-6', ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden className={className} {...p}>
    {children}
  </svg>
)

export const IconoInicio = (p) => (
  <Base {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></Base>
)
// Barra con discos: la rutina
export const IconoRutina = (p) => (
  <Base {...p}><path d="M2 12h20" /><rect x="5" y="7" width="3" height="10" rx="1" /><rect x="16" y="7" width="3" height="10" rx="1" /></Base>
)
export const IconoBanco = (p) => (
  <Base {...p}><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 20h18" /></Base>
)
export const IconoRecibo = (p) => (
  <Base {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></Base>
)
export const IconoCorazon = (p) => (
  <Base {...p}><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /><path d="M8 11h2l1-2 2 4 1-2h2" /></Base>
)
export const IconoWhatsApp = (p) => (
  <Base {...p}><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2.3-2.3l.8-1-1-2z" /></Base>
)
export const Chevron = (p) => <Base className="h-5 w-5" {...p}><path d="m9 6 6 6-6 6" /></Base>
export const Atras = (p) => <Base {...p}><path d="m15 5-7 7 7 7" /></Base>
export const IconoCheck = (p) => <Base {...p}><path d="m5 12.5 4.5 4.5L19 7" /></Base>
export const IconoSalir = (p) => (
  <Base {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l4-4-4-4M14 12H4" /></Base>
)
// Tarjeta: la mensualidad
export const IconoMensualidad = (p) => (
  <Base {...p}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></Base>
)
export const IconoFuego = (p) => (
  <Base {...p}><path d="M12 22c4 0 7-2.8 7-6.8 0-2.6-1.3-4.5-2.7-6-.3 1.6-1.1 2.6-2.2 3 .3-3.3-1.2-6.3-4.1-8.2.2 3-1.4 4.7-2.9 6.4C5.9 11.8 5 13.3 5 15.2 5 19.2 8 22 12 22z" /></Base>
)
// Ojo abierto / tachado: mostrar u ocultar la contraseña
export const IconoOjo = (p) => (
  <Base {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Base>
)
export const IconoOjoTachado = (p) => (
  <Base {...p}><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="M3 3l18 18" /></Base>
)
export const IconoLapiz = (p) => (
  <Base {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></Base>
)
export const IconoBasurero = (p) => (
  <Base {...p}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4h6v3" /></Base>
)
export const IconoBuscar = (p) => (
  <Base {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Base>
)
export const IconoCalendario = (p) => (
  <Base {...p}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Base>
)

// Menú lateral del personal
export const IconoMenu = (p) => <Base {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Base>
export const IconoCerrar = (p) => <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>
export const IconoBolsa = (p) => (
  <Base {...p}><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></Base>
)
export const IconoPuerta = (p) => (
  <Base {...p}><path d="M5 21V4h11v17" /><path d="M3 21h18" /><path d="M13 12h.01" /></Base>
)
export const IconoPersonas = (p) => (
  <Base {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></Base>
)
export const IconoGrafico = (p) => (
  <Base {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Base>
)
export const IconoMostrador = (p) => (
  <Base {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="m9 13 2 2 4-4" /></Base>
)
export const IconoAlumno = (p) => (
  <Base {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Base>
)
export const IconoCaja = (p) => (
  <Base {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v5M18 9.5v5" /></Base>
)
export const IconoCapas = (p) => (
  <Base {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></Base>
)
export const IconoLista = (p) => (
  <Base {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></Base>
)
