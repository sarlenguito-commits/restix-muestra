import { Component, type ReactNode } from 'react'

/** Si una pantalla falla, en vez de quedar todo en blanco se avisa y se puede volver a cargar (los datos quedan guardados). */
export default class Falla extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }

  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }

  componentDidCatch(e: unknown, info: { componentStack?: string | null }) {
    const detalle = e instanceof Error ? (e.stack ?? e.message) : String(e)
    window.restix.registro.anotar(`${detalle}\n${info.componentStack ?? ''}`)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="activacion">
        <div className="tarjeta">
          <h2>Algo falló en la pantalla</h2>
          <p className="ayuda">
            Los datos están a salvo. Tocá "Volver a cargar" para seguir. Si se repite, "Reiniciar datos" (arriba a la
            derecha) vuelve a los datos de muestra.
          </p>
          <div className="acciones">
            <button onClick={() => location.reload()}>Volver a cargar</button>
          </div>
        </div>
      </div>
    )
  }
}
