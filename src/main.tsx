import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Falla from './components/Falla'
import { instalarMuestra } from './muestra/api'
import { aplicarTema } from './tema'
import './styles.css'

// Antes que nada: los datos de muestra (guardados en este navegador) y la API que usan las pantallas
instalarMuestra()

// Lo que falle en la pantalla queda anotado (en la muestra, en la consola del navegador)
window.addEventListener('error', (e) => window.restix.registro.anotar(e.error?.stack ?? e.message))
window.addEventListener('unhandledrejection', (e) =>
  window.restix.registro.anotar(e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason))
)

// El tema se aplica antes de dibujar para que no haya un parpadeo con el tema equivocado
window.restix.tema.get().then((tema) => {
  aplicarTema(tema)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Falla>
        <App />
      </Falla>
    </StrictMode>
  )
})
