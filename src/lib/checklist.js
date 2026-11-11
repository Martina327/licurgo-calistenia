// ---------------------------------------------------------------
// Checklist de la rutina del alumno (CU11 · RNF04)
// Vive solo en el navegador (localStorage): no se guarda en la base.
//   · Se reinicia cada día (si la fecha guardada no es hoy, arranca vacío);
//     qué día de la rutina toca lo decide la semana (lib/semana.js)
//   · Una clave por rutina; al abrir otra rutina se borran las viejas
//   · Si el coach edita la rutina, los ítems cambian de id y las marcas
//     viejas simplemente dejan de coincidir
// localStorage puede fallar (modo privado, almacenamiento bloqueado):
// en ese caso el checklist funciona igual, pero no se recuerda.
// ---------------------------------------------------------------

const PREFIJO = 'licurgo.checklist.'

export function leerChecklist(rutinaId, hoy, storage = globalThis.localStorage) {
  const vacio = { fecha: hoy, marcados: [], dia: null }
  try {
    // Limpieza: claves de rutinas anteriores
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i)
      if (k?.startsWith(PREFIJO) && k !== PREFIJO + rutinaId) storage.removeItem(k)
    }
    const guardado = JSON.parse(storage.getItem(PREFIJO + rutinaId) ?? 'null')
    if (!guardado) return vacio
    return guardado.fecha === hoy
      ? { fecha: hoy, marcados: Array.isArray(guardado.marcados) ? guardado.marcados : [], dia: guardado.dia ?? null }
      : vacio // otro día: marcas en cero y el día lo decide la semana (lib/semana.js → diaQueToca)
  } catch {
    return vacio
  }
}

export function guardarChecklist(rutinaId, estado, storage = globalThis.localStorage) {
  try {
    storage.setItem(PREFIJO + rutinaId, JSON.stringify(estado))
  } catch {
    // sin almacenamiento disponible: se ignora
  }
}

export const alternarMarca = (estado, itemId) => ({
  ...estado,
  marcados: estado.marcados.includes(itemId)
    ? estado.marcados.filter((id) => id !== itemId)
    : [...estado.marcados, itemId],
})
