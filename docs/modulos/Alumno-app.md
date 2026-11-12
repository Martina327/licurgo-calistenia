# App del alumno: Inicio, Rutina y Mensualidad

**Pareja B** · rama `feature/b1-inicio-racha` → `dev`

Tres pestañas abajo, como una app de celular:

| Pestaña | Ruta | Qué tiene |
|---|---|---|
| **Inicio** | `/alumno` | Foto de Licurgo con la frase del día, racha, "Hoy te toca", calendario del mes, últimas 8 semanas y contacto con Gero |
| **Rutina** | `/alumno/rutina` | El checklist del día, con dos vistas |
| **Mensualidad** | `/alumno/mensualidad` | Estado de la cuota, pagar por transferencia, mis comprobantes, apto médico (B4) |

![Inicio y Mensualidad](img/alumno-inicio.png)

## Inicio: motivación para entrenar

- **Foto y frase:** fotos del gimnasio (`public/img/gimnasio/`) que pasan solas cada 6 s (quietas si el celular pide menos movimiento) y una frase para entrenar distinta cada día (`FRASES` en `lib/racha.js`).
- **Qué cuenta como día entrenado:** el presente que marca recepción (`asistencias`) **o** completar un día de la rutina en la app (`dias_completados`). Un mismo día cuenta una vez.
- **Meta semanal:** la cantidad de días de la rutina del alumno (si no tiene rutina, 3).
- **Racha:** semanas seguidas cumpliendo la meta. Se cuenta por semanas y no por días porque en calistenia se descansa: una racha diaria se cortaría en cada día de descanso. La semana en curso suma cuando se cumple y, mientras tanto, no corta la racha.
- **Esta semana:** L a D con tilde rojo en los días entrenados, barra `entrenados/meta` y un mensaje ("Te falta 1 día para cumplir la semana", "¡Semana cumplida! Llevás 5 semanas seguidas").
- **Hoy te toca:** el día de la rutina que corresponde (misma regla que la pantalla de rutina) con botón **Entrenar**.
- **Mes:** calendario con los días entrenados y el total.
- **Últimas 8 semanas:** días entrenados por semana con la meta punteada; en rojo las semanas cumplidas.
- **Cuota:** si vence en 3 días o venció, un aviso lleva a Mensualidad.
- **Contacto:** foto de Gero, "Escribile a Gero" → WhatsApp (número de *Datos de cobro*, hoy 381 624-5748).

## Rutina: dos vistas

Botón arriba a la derecha (se recuerda en el celular):

- **Por días:** los días en horizontal arriba; se elige uno y se ve su rutina (como hasta ahora).
- **Lista:** los días uno debajo del otro con cuántas tareas tienen y si ya se hicieron esta semana o si "hoy te toca". Tocar un día lo **despliega** (pasa a ser el día del checklist, con su barra de progreso fija arriba) y tocarlo de nuevo lo **minimiza**.

![Vistas de la rutina](img/alumno-rutina-vistas.png)

## Marca

Logo Λ de Licurgo (rojo sobre negro) en los íconos de la app, el encabezado y la foto del Inicio. El rojo de la marca es el color de la racha y de los días entrenados.

## Pruebas

- **Unitarias** (`lib/racha.js`): meta, unión de fuentes sin repetir, semanas lunes a domingo, racha (semana actual a medias no corta, sí suma cuando se cumple, se corta con una semana incompleta), semana en curso, calendario (mes que empieza en domingo, febrero), mensajes, frase estable en el día.
- **Navegador:** Inicio con historial de 8 semanas (racha 5, 2/3 esta semana), aviso de cuota, contacto; vistas de rutina: cambio, desplegar/minimizar, tildar en la lista, la vista se recuerda al recargar y el día a medias se vuelve a abrir.
