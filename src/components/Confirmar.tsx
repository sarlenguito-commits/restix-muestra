import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'

// Reemplaza a window.confirm(). El cartel nativo de Windows, al cerrarse, deja la ventana de Electron sin teclado:
// los campos se ven bien pero no dejan escribir (pasaba con el PIN justo después de "¿Borrar este movimiento?").

interface Opciones {
  /** Texto del botón que confirma (por defecto "Aceptar") */
  boton?: string
  /** Botón rojo: para borrar o anular */
  peligro?: boolean
  titulo?: string
}

interface Pregunta extends Opciones {
  texto: string
  resolver: (si: boolean) => void
}

let abrir: ((p: Pregunta) => void) | null = null

/** Pregunta algo con Aceptar / Cancelar. Devuelve true si se aceptó. */
export function confirmar(texto: string, opciones: Opciones = {}): Promise<boolean> {
  return new Promise((resolver) => (abrir ? abrir({ ...opciones, texto, resolver }) : resolver(false)))
}

/** Va una sola vez en la app (en Inicio): muestra el cartel cuando alguien llama a confirmar. */
export function Confirmaciones() {
  const [pregunta, setPregunta] = useState<Pregunta | null>(null)

  useEffect(() => {
    abrir = setPregunta
    return () => {
      abrir = null
    }
  }, [])

  if (!pregunta) return null
  const responder = (si: boolean) => {
    pregunta.resolver(si)
    setPregunta(null)
  }
  return <CartelConfirmar pregunta={pregunta} onResponder={responder} />
}

function CartelConfirmar({ pregunta, onResponder }: { pregunta: Pregunta; onResponder: (si: boolean) => void }) {
  const aceptar = useRef<HTMLButtonElement>(null)

  // El foco va a "Aceptar": Enter confirma, Esc cancela
  useEffect(() => aceptar.current?.focus(), [])

  return (
    <Modal
      titulo={pregunta.titulo ?? 'Confirmar'}
      onCerrar={() => onResponder(false)}
      ancho={420}
      pie={
        <>
          <button className="secundario" onClick={() => onResponder(false)}>
            Cancelar
          </button>
          <button ref={aceptar} className={pregunta.peligro ? 'peligro-lleno' : ''} onClick={() => onResponder(true)}>
            {pregunta.boton ?? 'Aceptar'}
          </button>
        </>
      }
    >
      <p className="texto-confirmar">{pregunta.texto}</p>
    </Modal>
  )
}
