import { useState } from 'react'
import Interruptor from '../components/Interruptor'
import Modal from '../components/Modal'

const MOTIVOS_PEDIDO = ['El cliente canceló', 'Pedidos Ya lo canceló', 'Error de carga', 'Demora']
const MOTIVOS_MESA = ['Se fueron sin consumir', 'Mesa abierta por error', 'Error de carga', 'Demora']

interface Props {
  /** "Mesa 4" / "Pedidos Ya #4821" / "Delivery · Marta" */
  etiqueta: string
  /** true si es una mesa del salón (cambian los motivos rápidos y los textos) */
  esMesa: boolean
  onConfirmar: (motivo: string, devolverStock: boolean) => Promise<boolean>
  onCerrar: () => void
}

/** Anula la mesa o el pedido entero sin cobrarlo y la deja libre. */
export default function ModalAnularPedido({ etiqueta, esMesa, onConfirmar, onCerrar }: Props) {
  const MOTIVOS_RAPIDOS = esMesa ? MOTIVOS_MESA : MOTIVOS_PEDIDO
  const [motivo, setMotivo] = useState('')
  const [devolver, setDevolver] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const confirmar = async () => {
    if (!motivo.trim()) return setError('Indicá el motivo.')
    if (await onConfirmar(motivo, devolver)) onCerrar()
  }

  return (
    <Modal
      titulo={`Anular ${etiqueta}`}
      onCerrar={onCerrar}
      ancho={500}
      pie={
        <>
          {error && <p className="error">{error}</p>}
          <button className="secundario" onClick={onCerrar}>
            Volver
          </button>
          <button className="peligro-lleno" onClick={confirmar}>
            {esMesa ? 'Anular la mesa' : 'Anular el pedido'}
          </button>
        </>
      }
    >
      <p className="ayuda-lista">
        Se anula todo lo enviado, no se cobra nada y la mesa queda libre. Queda registrado con el motivo.
      </p>

      <div className="campo-grupo">
        <label>Motivo</label>
        <div className="botones-grandes chicos">
          {MOTIVOS_RAPIDOS.map((m) => (
            <button key={m} className={motivo === m ? 'elegido' : ''} onClick={() => setMotivo(m)}>
              {m}
            </button>
          ))}
        </div>
        <input
          className="campo"
          placeholder="U otro motivo…"
          value={MOTIVOS_RAPIDOS.includes(motivo) ? '' : motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>

      <div className="campo-grupo">
        <label>Stock</label>
        <div className="fila">
          <Interruptor
            activo={devolver}
            onCambiar={setDevolver}
            texto={devolver ? 'Devolver los insumos al stock (no se llegó a preparar)' : 'No devolver (ya se preparó y se descarta)'}
          />
        </div>
      </div>
    </Modal>
  )
}
