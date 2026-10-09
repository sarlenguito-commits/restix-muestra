import { useState } from 'react'
import type { ComandaItem } from '@shared/types'
import Interruptor from '../components/Interruptor'
import Modal from '../components/Modal'

const MOTIVOS_RAPIDOS = ['Error de carga', 'El cliente cambió', 'Demora', 'Se cayó o se quemó']

interface Props {
  item: ComandaItem
  onConfirmar: (cantidad: number, motivo: string, devolverStock: boolean) => Promise<boolean>
  onCerrar: () => void
}

export default function ModalAnular({ item, onConfirmar, onCerrar }: Props) {
  const [cantidad, setCantidad] = useState(item.cantidad)
  const [motivo, setMotivo] = useState('')
  const [devolver, setDevolver] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const elegirMotivo = (m: string) => {
    setMotivo(m)
    // Si se cayó o se quemó, los insumos ya se usaron: no vuelven al stock
    setDevolver(m !== 'Se cayó o se quemó')
  }

  const confirmar = async () => {
    if (!motivo.trim()) return setError('Indicá el motivo.')
    if (await onConfirmar(cantidad, motivo, devolver)) onCerrar()
  }

  return (
    <Modal
      titulo={`Anular: ${item.nombre}`}
      onCerrar={onCerrar}
      ancho={500}
      pie={
        <>
          {error && <p className="error">{error}</p>}
          <button className="secundario" onClick={onCerrar}>
            Volver
          </button>
          <button className="peligro-lleno" onClick={confirmar}>
            Anular {cantidad > 1 ? `${cantidad} unidades` : '1 unidad'}
          </button>
        </>
      }
    >
      {item.cantidad > 1 && (
        <div className="campo-grupo">
          <label>¿Cuántas?</label>
          <div className="contador">
            <button className="icono" disabled={cantidad <= 1} onClick={() => setCantidad((c) => c - 1)}>
              −
            </button>
            <span>{cantidad}</span>
            <button className="icono" disabled={cantidad >= item.cantidad} onClick={() => setCantidad((c) => c + 1)}>
              +
            </button>
            <span className="ayuda-lista">de {item.cantidad}</span>
          </div>
        </div>
      )}

      <div className="campo-grupo">
        <label>Motivo</label>
        <div className="botones-grandes chicos">
          {MOTIVOS_RAPIDOS.map((m) => (
            <button key={m} className={motivo === m ? 'elegido' : ''} onClick={() => elegirMotivo(m)}>
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
