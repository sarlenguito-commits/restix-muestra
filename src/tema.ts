import type { Tema } from '@shared/types'

/** Pone la marca data-tema en <html>; styles.css cambia las variables de color según ella. */
export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.tema = tema
  // Aviso para lo que no usa CSS (el canvas del plano) y necesita redibujarse
  window.dispatchEvent(new Event('tema-cambiado'))
}

export function temaActual(): Tema {
  return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'oscuro'
}
