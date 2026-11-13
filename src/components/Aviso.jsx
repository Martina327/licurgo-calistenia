// Mensaje de resultado de una acción: verde si salió bien, rojo si hubo error, celeste para indicaciones.
const TONO = { ok: 'bg-emerald-950 text-emerald-300', info: 'bg-sky-950 text-sky-200' }
export default function Aviso({ tipo, texto }) {
  if (!texto) return null
  return (
    <p className={`rounded-lg px-3 py-2 text-sm ${TONO[tipo] ?? 'bg-red-950 text-red-300'}`}>
      {texto}
    </p>
  )
}
