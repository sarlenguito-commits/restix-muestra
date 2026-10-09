import type { RestixApi } from './muestra/api'

declare global {
  interface Window {
    /** La API de Restix: en la app de escritorio la pone Electron; en la muestra, src/muestra/api.ts */
    restix: RestixApi
  }
}
