import type { Comanda, ComandaItem } from '@shared/types'
import { CampoTexto } from '../components/Campos'
import { formatearPrecio } from '../formato'

interface Props {
  comanda: Comanda
  onCantidad: (item: ComandaItem, cantidad: number) => void
  onNota: (item: ComandaItem, nota: string) => Promise<boolean>
  onQuitar: (item: ComandaItem) => void
  onAnular: (item: ComandaItem) => void
  onReimprimir: (envio: number) => void
}

/** "2026-09-24 12:31:05" → "12:31" */
export const hora = (fecha: string | null) => fecha?.slice(11, 16) ?? ''

export default function Pedido({ comanda, onCantidad, onNota, onQuitar, onAnular, onReimprimir }: Props) {
  const pendientes = comanda.items.filter((i) => i.estado === 'pendiente')
  const enviados = comanda.items.filter((i) => i.estado === 'enviado')
  const anulados = comanda.items.filter((i) => i.estado === 'anulado')
  const envios = [...new Set(enviados.map((i) => i.envio!))].sort((a, b) => a - b)

  return (
    <div className="pedido-lista">
      {!comanda.items.length && <p className="ayuda-lista pedido-vacio">Tocá los productos para cargar el pedido.</p>}

      {pendientes.length > 0 && (
        <section className="grupo-pedido pendientes">
          <h4>Sin enviar</h4>
          {pendientes.map((i) => (
            <div key={i.id} className="renglon-pedido">
              <div className="fila-principal">
                <div className="contador chico">
                  <button className="icono chico" onClick={() => (i.cantidad > 1 ? onCantidad(i, i.cantidad - 1) : onQuitar(i))}>
                    −
                  </button>
                  <span>{i.cantidad}</span>
                  <button className="icono chico" onClick={() => onCantidad(i, i.cantidad + 1)}>
                    +
                  </button>
                </div>
                <span className="nombre">{i.nombre}</span>
                <span className="subtotal">{formatearPrecio(i.precio * i.cantidad)}</span>
                <button className="icono chico" title="Quitar" onClick={() => onQuitar(i)}>
                  ✕
                </button>
              </div>
              <CampoTexto
                className="campo nota"
                placeholder="Nota (ej.: sin cebolla)"
                valor={i.nota ?? ''}
                onGuardar={(nota) => onNota(i, nota)}
              />
            </div>
          ))}
        </section>
      )}

      {envios.map((n) => {
        const items = enviados.filter((i) => i.envio === n)
        return (
          <section key={n} className="grupo-pedido">
            <h4 className="encabezado-envio">
              Envío {n} · {hora(items[0].enviado_en)}
              <button className="icono chico" title="Reimprimir este envío" onClick={() => onReimprimir(n)}>
                🖨
              </button>
            </h4>
            {items.map((i) => (
              <div key={i.id} className="renglon-pedido enviado">
                <div className="fila-principal">
                  <span className="cantidad">{i.cantidad} ×</span>
                  <span className="nombre">
                    {i.nombre}
                    {i.nota && <em className="nota-texto">{i.nota}</em>}
                  </span>
                  <span className="subtotal">{formatearPrecio(i.precio * i.cantidad)}</span>
                  <button className="icono chico" title="Anular" onClick={() => onAnular(i)}>
                    ⊘
                  </button>
                </div>
              </div>
            ))}
          </section>
        )
      })}

      {anulados.length > 0 && (
        <section className="grupo-pedido anulados">
          <h4>Anulados</h4>
          {anulados.map((i) => (
            <div key={i.id} className="renglon-pedido anulado">
              <div className="fila-principal">
                <span className="cantidad">{i.cantidad} ×</span>
                <span className="nombre">
                  <s>{i.nombre}</s>
                  <em className="nota-texto">
                    {i.anulado_motivo}
                    {i.stock_devuelto ? ' · stock devuelto' : ''}
                  </em>
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
