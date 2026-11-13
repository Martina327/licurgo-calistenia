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

// Saca las marcas de las tareas indicadas (ej. las de días ya completados esta semana:
// al volver a entrar, el día arranca limpio)
export const sinMarcas = (estado, ids) => ({ ...estado, marcados: estado.marcados.filter((id) => !ids.has(id)) })

// Al cerrar sesión se borran los checklists guardados en este navegador
export function limpiarChecklists(storage = globalThis.localStorage) {
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i)
      if (k?.startsWith(PREFIJO)) storage.removeItem(k)
    }
  } catch {
    // sin almacenamiento disponible: nada que borrar
  }
}

// Día que quedó empezado un día anterior y no se terminó ni se finalizó.
// Para que el alumno no quede trabado, al día siguiente se cuenta como hecho al elegir
// qué día toca (se sigue con el próximo). Devuelve { numero_dia, fecha, creado } o null.
export function diaEmpezadoAntes(rutinaId, hoy, storage = globalThis.localStorage) {
  try {
    const g = JSON.parse(storage.getItem(PREFIJO + rutinaId) ?? 'null')
    if (!g || g.fecha === hoy || g.dia == null || !g.marcados?.length) return null
    return { numero_dia: g.dia, fecha: g.fecha, creado: `${g.fecha}T23:59:59` }
  } catch {
    return null
  }
}
