export default function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-neutral-400">
      {texto}
    </div>
  )
}
