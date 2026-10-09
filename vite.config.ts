import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Rutas relativas: la muestra se publica en una subcarpeta de GitHub Pages
  base: './',
  plugins: [react()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) } },
  // El plano usa Konva (dibujo en canvas): va en un archivo aparte, así el resto de la app carga más liviano
  build: { rollupOptions: { output: { manualChunks: { konva: ['konva', 'react-konva'] } } } },
  test: { environment: 'node' }
})
