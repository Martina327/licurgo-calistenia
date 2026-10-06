# Sistema Integral de Gestión Administrativa y Progresión Deportiva para Centros de Entrenamiento Funcional y Calistenia

### Caso de Aplicación: Licurgo Calistenia
**Universidad Tecnológica Nacional - Facultad Regional Tucumán (UTN FRT)**  
**Carrera:** Analista Desarrollador Universitario de Sistemas de Información / Ingeniería en Sistemas de Información  
**Materia:** Seminario Integrador | **Año:** 2026  
**Profesor:** Ing. Rodriguez, Sergio  

---

## 👥 Integrantes del Equipo

* **Albornoz, Martina** - Legajo: 52691
* **Atencia Abete, Juan Cruz** - Legajo: 53117
* **Figueroa Daruich, Agostina** - Legajo: 56426
* **Nacusse, Federico** - Legajo: 53344

---

## 🛠️ Stack

React 19 + Vite + Tailwind CSS 4 · Supabase (PostgreSQL, Auth, Storage, RLS) · Deploy en Vercel.

## 🚀 Cómo correr el proyecto

Requisitos: Node.js 20 o superior.

```bash
git clone https://github.com/Martina327/licurgo-calistenia.git
cd licurgo-calistenia
git checkout dev
npm install
cp .env.example .env      # en Windows: copy .env.example .env
# completar .env con la URL y la anon key de Supabase (Project Settings → API)
npm run dev               # abre http://localhost:5173
```

La base de datos se crea con `supabase/schema.sql` (ya ejecutado en el proyecto de Supabase del equipo).
**No volver a correrlo completo**: su sección 0 borra todo. Los cambios nuevos van como migraciones en `supabase/migrations/`.

### Usuarios de prueba

Contraseña de todos: `Licurgo2026!` — se ingresa con el **DNI**.

| Rol | DNI | Qué se puede probar |
| --- | --- | --- |
| SuperAdmin | 20111111 | Dashboard de ingresos y todas las secciones |
| Recepcionista | 25222222 | Panel de alertas con link a WhatsApp |
| Coach | 30111222 | Listado de alumnos con observaciones |
| Alumno | 40111001 | Lucía: al día, check-in permitido |
| Alumno | 41222002 | Tomás: vence en 2 días (ve la alerta) |
| Alumno | 39333003 | Camila: vencida (el check-in se bloquea) |

## 📁 Estructura

```
supabase/schema.sql        Esquema completo de la base (tablas, RLS, funciones, mocks)
src/lib/supabase.js        Cliente de Supabase
src/lib/utils.js           Login con DNI, rutas por rol, formatos, mensajes de error
src/context/AuthContext    Sesión + perfil (rol) del usuario logueado
src/components/            RutaProtegida, Layout (menú por rol), Cargando
src/pages/<rol>/           Pantallas de cada módulo
```

## 🌿 Flujo de trabajo con Git

- `main` → versión estable (lo que se publica). **Nadie pushea directo.**
- `dev` → integración del trabajo de todos.
- `feature/<tarea>` → una rama por tarea, sale de `dev` y vuelve a `dev` por Pull Request.

```bash
git checkout dev
git pull
git checkout -b feature/nombre-de-la-tarea
# ...trabajar y commitear...
git push -u origin feature/nombre-de-la-tarea
# en GitHub: Pull Request hacia dev → revisión de un compañero → Merge
```
