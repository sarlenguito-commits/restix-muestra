import { useState } from 'react'
import type { Canal, DatosApertura, Mozo } from '@shared/types'
import Modal from '../components/Modal'

const COMENSALES_RAPIDOS = [1, 2, 3, 4, 5, 6, 7, 8]

interface Props {
  titulo: string
  boton: string
  /** Salón: mozo y comensales · Pedidos Ya: n.º de pedido · Delivery: datos del cliente */
  canal: Canal
  mozos: Mozo[]
  inicial?: DatosApertura
  onConfirmar: (datos: DatosApertura) => Promise<boolean>
  onCerrar: () => void
}

/** Datos al abrir una mesa (o para cambiarlos después), según la pestaña. */
export default function ModalApertura({ titulo, boton, canal, mozos, inicial, onConfirmar, onCerrar }: Props) {
  const [mozoId, setMozoId] = useState<number | null>(inicial?.mozo_id ?? null)
  const [comensales, setComensales] = useState<number | null>(inicial?.comensales ?? null)
  const [pedido, setPedido] = useState(inicial?.pedido_ref ?? '')
  const [nombre, setNombre] = useState(inicial?.cliente_nombre ?? '')
  const [direccion, setDireccion] = useState(inicial?.cliente_direccion ?? '')
  const [telefono, setTelefono] = useState(inicial?.cliente_telefono ?? '')
  const [enviando, setEnviando] = useState(false)
  // Solo mozos activos (y el que ya estaba asignado, aunque ahora esté inactivo)
  const activos = mozos.filter((m) => (m.activo && m.rol === 'mozo') || m.id === inicial?.mozo_id)

  const confirmar = async () => {
    setEnviando(true)
    const ok = await onConfirmar({
      mozo_id: canal === 'salon' ? mozoId : null,
      comensales: canal === 'salon' ? comensales : null,
      pedido_ref: pedido,
      cliente_nombre: nombre,
      cliente_direccion: direccion,
      cliente_telefono: telefono
    })
    setEnviando(false)
    if (ok) onCerrar()
  }
  const alEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && confirmar()

  return (
    <Modal
      titulo={titulo}
      onCerrar={onCerrar}
      ancho={520}
      pie={
        <>
          <button className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button onClick={confirmar} disabled={enviando}>
            {boton}
          </button>
        </>
      }
    >
      {canal === 'pedidosya' && (
        <div className="campo-grupo">
          <label>N.º de pedido de Pedidos Ya</label>
          <input
            className="campo grande"
            autoFocus
            placeholder="Ej.: 4821"
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            onKeyDown={alEnter}
          />
        </div>
      )}

      {canal === 'delivery' && (
        <>
          <div className="campo-grupo">
            <label>Nombre del cliente</label>
            <input className="campo" autoFocus placeholder="Ej.: Marta" value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={alEnter} />
          </div>
          <div className="campo-grupo">
            <label>Dirección</label>
            <input className="campo" placeholder="Ej.: Av. Roca 1234, 2° B" value={direccion} onChange={(e) => setDireccion(e.target.value)} onKeyDown={alEnter} />
          </div>
          <div className="campo-grupo">
            <label>Teléfono</label>
            <input className="campo" placeholder="Ej.: 11 5555-1234" value={telefono} onChange={(e) => setTelefono(e.target.value)} onKeyDown={alEnter} />
          </div>
        </>
      )}

      {canal === 'salon' && (
        <>
          <div className="campo-grupo">
            <label>Mozo</label>
            <div className="botones-grandes">
              {activos.map((m) => (
                <button key={m.id} className={mozoId === m.id ? 'elegido' : ''} onClick={() => setMozoId(m.id)}>
                  {m.nombre}
                </button>
              ))}
              <button className={mozoId === null ? 'elegido' : ''} onClick={() => setMozoId(null)}>
                Sin asignar
              </button>
            </div>
          </div>

          <div className="campo-grupo">
            <label>Comensales</label>
            <div className="botones-grandes numeros">
              {COMENSALES_RAPIDOS.map((n) => (
                <button key={n} className={comensales === n ? 'elegido' : ''} onClick={() => setComensales(n)}>
                  {n}
                </button>
              ))}
            </div>
            <div className="contador">
              <button className="icono" onClick={() => setComensales((c) => (c && c > 1 ? c - 1 : null))}>
                −
              </button>
              <span>{comensales ?? '—'}</span>
              <button className="icono" onClick={() => setComensales((c) => Math.min(99, (c ?? 0) + 1))}>
                +
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
