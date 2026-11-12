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
