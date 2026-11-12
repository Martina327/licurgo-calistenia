import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Versión de esta compilación: el commit que desplegó Vercel (o la hora, si se compila a mano).
// Va dentro del JS (__APP_VERSION__) y en /version.json; si no coinciden, la app se actualiza sola.
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`

function versionApp() {
  return {
    name: 'licurgo-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION }) })
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), versionApp()],
  define: { __APP_VERSION__: JSON.stringify(command === 'build' ? VERSION : 'dev') },
}))
