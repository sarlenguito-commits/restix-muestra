import { useEffect, useState, type FormEvent } from 'react'
import Modal from './Modal'

interface Pedido {
  /** Qué se quiere hacer, en minúscula: "anular Mesa 4", "entrar a Ajustes" */
  motivo: string
  resolver: (pin: string | null) => void
}

let abrir: ((p: Pedido) => void) | null = null

/** Pide el PIN de ADMIN. Devuelve el PIN (ya verificado) o null si se cancela. */
export function pedirPin(motivo: string): Promise<string | null> {
  return new Promise((resolver) => (abrir ? abrir({ motivo, resolver }) : resolver(null)))
}

/** Va una sola vez en la app (en Inicio): muestra el cartel cuando alguien llama a pedirPin. */
export function PinAdmin() {
  const [pedido, setPedido] = useState<Pedido | null>(null)

  useEffect(() => {
    abrir = setPedido
    return () => {
      abrir = null
    }
  }, [])

  if (!pedido) return null
  return (
    <ModalPin
      motivo={pedido.motivo}
      onListo={(pin) => {
        pedido.resolver(pin)
        setPedido(null)
      }}
    />
  )
}

/** Solo números, hasta 4 */
const soloPin = (v: string) => v.replace(/\D/g, '').slice(0, 4)

function ModalPin({ motivo, onListo }: { motivo: string; onListo: (pin: string | null) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const confirmar = async (valor = pin) => {
    if (ocupado || valor.length !== 4) return
    setOcupado(true)
    const r = await window.restix.pin.verificar(valor)
    setOcupado(false)
    if (r.ok) return onListo(valor)
    setError(r.error)
    setPin('')
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    confirmar()
  }

  return (
    <Modal titulo="PIN de ADMIN" onCerrar={() => onListo(null)} ancho={380}>
      <form className="form-pin" onSubmit={enviar}>
        <p className="ayuda-lista">
          Para {motivo} hace falta el PIN de ADMIN. En la muestra es <strong>1234</strong>.
        </p>
        <div className="campo-grupo">
          <label>PIN</label>
          <input
            className="campo campo-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={(e) => {
              const v = soloPin(e.target.value)
              setPin(v)
              setError(null)
              // Con el cuarto número se revisa solo, sin tocar Aceptar
              if (v.length === 4) confirmar(v)
            }}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="fila acciones-pin">
          <button type="button" className="secundario" onClick={() => onListo(null)}>
            Cancelar
          </button>
          <button type="submit" disabled={pin.length !== 4 || ocupado}>
            Aceptar
          </button>
        </div>
      </form>
    </Modal>
  )
}
