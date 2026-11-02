// Mensaje de resultado de una acción: verde si salió bien, rojo si hubo error.
export default function Aviso({ tipo, texto }) {
  if (!texto) return null
  return (
    <p className={`rounded-lg px-3 py-2 text-sm ${tipo === 'ok' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'}`}>
      {texto}
    </p>
  )
}
