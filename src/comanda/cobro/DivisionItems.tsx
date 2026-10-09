import type { Cuenta, ParteItem } from '@shared/types'
import { cantidadLegible } from '@shared/ticket'
import { CampoTexto } from '../../components/Campos'
import { formatearPrecio } from '../../formato'

interface Props {
  cuentas: Cuenta[]
  sinAsignar: ParteItem[]
  onAsignar: (cuentaId: number, itemId: number, cantidad: number) => void
  onRepartir: (itemId: number) => void
  onRenombrar: (cuentaId: number, nombre: string) => Promise<boolean>
  onAgregarCuenta: () => void
  onQuitarCuenta: (cuentaId: number) => void
  onCobrar: (cuentaId: number) => void
  onImprimir: (cuenta: Cuenta) => void
}

export default function DivisionItems(props: Props) {
  const { cuentas, sinAsignar } = props
  const pendientes = cuentas.filter((c) => c.estado === 'pendiente')
  // Cuánto de cada ítem tiene ya cada cuenta (para sumar de a una unidad)
  const enCuenta = (cuenta: Cuenta, itemId: number) => cuenta.items.find((i) => i.comanda_item_id === itemId)?.cantidad ?? 0

  return (
    <div className="division">
      <section className="sin-asignar">
        <h4>Sin asignar</h4>
        {!sinAsignar.length && <p className="ayuda-lista">Todo está asignado ✓</p>}
        {sinAsignar.map((p) => (
          <div key={p.comanda_item_id} className="parte">
            <div className="fila">
              <span className="cantidad">{cantidadLegible(p.cantidad)} ×</span>
              <span className="nombre">{p.nombre}</span>
              <span className="importe">{formatearPrecio(p.importe)}</span>
            </div>
            <div className="botones-asignar">
              {pendientes.map((c) => (
                <button
                  key={c.id}
                  title={`Pasar ${p.cantidad >= 1 ? 'una unidad' : 'lo que queda'} a ${c.nombre}`}
                  onClick={() => props.onAsignar(c.id, p.comanda_item_id, enCuenta(c, p.comanda_item_id) + Math.min(1, p.cantidad))}
                >
                  → {c.nombre}
                </button>
              ))}
              {pendientes.length > 1 && (
                <button className="repartir" title="Repartir en partes iguales entre las cuentas sin cobrar" onClick={() => props.onRepartir(p.comanda_item_id)}>
                  ÷ Repartir
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="tarjetas-cuentas">
        {cuentas.map((c) => (
          <div key={c.id} className={`tarjeta-cuenta ${c.estado}`}>
            <header>
              {c.estado === 'cobrada' ? (
                <strong>✓ {c.nombre}</strong>
              ) : (
                <CampoTexto className="campo nombre-cuenta" valor={c.nombre} onGuardar={(n) => props.onRenombrar(c.id, n)} />
              )}
              {c.estado === 'pendiente' && c.items.length > 0 && (
                <button className="icono chico" title="Imprimir la cuenta de esta persona" onClick={() => props.onImprimir(c)}>
                  🖨
                </button>
              )}
              {c.estado === 'pendiente' && cuentas.length > 2 && (
                <button className="icono chico" title="Quitar esta cuenta" onClick={() => props.onQuitarCuenta(c.id)}>
                  ✕
                </button>
              )}
            </header>
            <ul>
              {c.items.map((i) => (
                <li key={i.comanda_item_id}>
                  <span className="cantidad">{cantidadLegible(i.cantidad)} ×</span>
                  <span className="nombre">{i.nombre}</span>
                  <span className="importe">{formatearPrecio(i.importe)}</span>
                  {c.estado === 'pendiente' && (
                    <button
                      className="icono chico"
                      title="Devolver a sin asignar"
                      onClick={() => props.onAsignar(c.id, i.comanda_item_id, 0)}
                    >
                      ↩
                    </button>
                  )}
                </li>
              ))}
              {!c.items.length && <li className="ayuda-lista">Sin ítems</li>}
            </ul>
            <footer>
              <strong>{formatearPrecio(c.total)}</strong>
              {c.estado === 'cobrada' ? (
                <span className="insignia stock-ok">Cobrada</span>
              ) : (
                <button onClick={() => props.onCobrar(c.id)} disabled={!c.items.length}>
                  Cobrar
                </button>
              )}
            </footer>
          </div>
        ))}
        <button className="secundario agregar-cuenta" onClick={props.onAgregarCuenta}>
          + Cuenta
        </button>
      </section>
    </div>
  )
}
