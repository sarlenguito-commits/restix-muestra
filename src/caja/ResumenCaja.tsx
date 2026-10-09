import { MEDIOS_PAGO, NOMBRE_CAJA, NOMBRE_MEDIO, NOMBRE_TIPO_MOVIMIENTO, type MovimientoCaja, type ResumenTurno } from '@shared/types'
import { formatearPrecio } from '../formato'

/** "2026-09-24 12:30:00" → "24/09 12:30" */
export const fechaCorta = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)} ${f.slice(11, 16)}` : '—')

/** Diferencia del arqueo con ícono y palabra (nunca solo color). */
export function Diferencia({ valor }: { valor: number }) {
  if (valor === 0) return <span className="diferencia justo">✓ Justo</span>
  if (valor > 0) return <span className="diferencia sobra">▲ Sobra {formatearPrecio(valor)}</span>
  return <span className="diferencia falta">▼ Falta {formatearPrecio(-valor)}</span>
}

/** "Pago al personal · Juan", "Traspaso: Caja grande → Caja chica"… */
export function detalleMovimiento(m: MovimientoCaja): string {
  const partes: string[] = [NOMBRE_TIPO_MOVIMIENTO[m.tipo]]
  if (m.tipo === 'pago_personal' && m.persona) partes[0] += ` · ${m.persona}`
  if (m.tipo === 'traspaso') partes.push(`${NOMBRE_CAJA[m.caja_origen!]} → ${NOMBRE_CAJA[m.caja_destino!]}`)
  else if (m.caja_origen && m.tipo !== 'gasto') partes.push(`de ${NOMBRE_CAJA[m.caja_origen].toLowerCase()}`)
  else if (m.caja_destino) partes.push(`a ${NOMBRE_CAJA[m.caja_destino].toLowerCase()}`)
  if (m.motivo) partes.push(m.motivo)
  return partes.join(' · ')
}

/** Vendido por cada medio de pago, el total y lo que está todavía en mesas abiertas. */
export function VendidoPorMedio({ r, enVivo }: { r: ResumenTurno; enVivo?: boolean }) {
  return (
    <div className="vendido">
      {MEDIOS_PAGO.map((m) => (
        <div key={m} className="medio-vendido">
          <span className="etiqueta-indicador">{NOMBRE_MEDIO[m]}</span>
          <strong>{formatearPrecio(r.porMedio[m])}</strong>
        </div>
      ))}
      <div className="medio-vendido total">
        <span className="etiqueta-indicador">Total vendido</span>
        <strong>{formatearPrecio(r.ventas)}</strong>
      </div>
      {enVivo && r.mesasAbiertas > 0 && (
        <div className="medio-vendido pendiente">
          <span className="etiqueta-indicador">En mesas abiertas ({r.mesasAbiertas})</span>
          <strong>{formatearPrecio(r.enMesasAbiertas)}</strong>
        </div>
      )}
    </div>
  )
}

/** Resumen completo de un turno (para la sección Resúmenes). */
export default function ResumenCaja({ r }: { r: ResumenTurno }) {
  return (
    <div className="resumen-caja">
      <VendidoPorMedio r={r} />

      <div className="tablas-caja">
        <section>
          <h4>Arqueo</h4>
          <table className="tabla compacta">
            <thead>
              <tr>
                <th />
                <th className="derecha">Esperado</th>
                <th className="derecha">Contado</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {(['chica', 'grande'] as const).map((c) => (
                <tr key={c}>
                  <td>{NOMBRE_CAJA[c]}</td>
                  <td className="derecha numero">{formatearPrecio(r.cajas[c].esperado)}</td>
                  <td className="derecha numero">{r.cajas[c].contado === null ? '—' : formatearPrecio(r.cajas[c].contado!)}</td>
                  <td>{r.cajas[c].diferencia !== null && <Diferencia valor={r.cajas[c].diferencia!} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ayuda-lista">
            Caja chica inicial {formatearPrecio(r.turno.efectivo_inicial)} · Caja de gastos hoy {formatearPrecio(r.gastosSaldo)}
          </p>
          {r.turno.nota_cierre && <p className="ayuda-lista">Nota: {r.turno.nota_cierre}</p>}
        </section>

        <section>
          <h4>Por mozo</h4>
          <table className="tabla compacta">
            <tbody>
              {r.porMozo.map((m) => (
                <tr key={m.mozo}>
                  <td>{m.mozo}</td>
                  <td className="derecha tenue">{m.cuentas === 1 ? '1 cuenta' : `${m.cuentas} cuentas`}</td>
                  <td className="derecha numero">{formatearPrecio(m.total)}</td>
                </tr>
              ))}
              {!r.porMozo.length && (
                <tr>
                  <td className="tenue">Sin ventas.</td>
                </tr>
              )}
            </tbody>
          </table>
          {r.pedidosYa.online + r.pedidosYa.efectivo > 0 && (
            <p className="ayuda-lista">
              Pedidos Ya: online {formatearPrecio(r.pedidosYa.online)} · en efectivo {formatearPrecio(r.pedidosYa.efectivo)}
              {r.pedidosYa.comision > 0 && (
                <>
                  {' '}
                  · comisión estimada ({r.pedidosYa.porcentaje}%) {formatearPrecio(r.pedidosYa.comision)} · neto{' '}
                  {formatearPrecio(r.pedidosYa.online + r.pedidosYa.efectivo - r.pedidosYa.comision)}
                </>
              )}
            </p>
          )}
          {r.descuentos > 0 && <p className="ayuda-lista">Descuentos otorgados: {formatearPrecio(r.descuentos)}</p>}
        </section>

        <section>
          <h4>Pagos al personal</h4>
          <table className="tabla compacta">
            <tbody>
              {r.pagosPersonal.map((p) => (
                <tr key={p.persona}>
                  <td>
                    {p.persona}
                    <span className="tenue">
                      {' '}
                      · chica {formatearPrecio(p.deChica)} + grande {formatearPrecio(p.deGrande)}
                    </span>
                  </td>
                  <td className="derecha numero">{formatearPrecio(p.total)}</td>
                </tr>
              ))}
              {!r.pagosPersonal.length && (
                <tr>
                  <td className="tenue">Sin pagos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {r.movimientos.length > 0 && (
        <section className="lista-movimientos">
          <h4>Movimientos</h4>
          <table className="tabla compacta">
            <tbody>
              {r.movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="tenue">{m.fecha.slice(11, 16)}</td>
                  <td>{detalleMovimiento(m)}</td>
                  <td className="derecha numero">{formatearPrecio(m.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
