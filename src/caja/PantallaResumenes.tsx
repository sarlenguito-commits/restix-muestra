import { useEffect, useState } from 'react'
import type { ProductosDelMes, ResumenTurno } from '@shared/types'
import { ticketCierre, type Ticket } from '@shared/ticket'
import ModalTickets from '../comanda/ModalTickets'
import Modal from '../components/Modal'
import { formatearPrecio } from '../formato'
import ListaCobros from './ListaCobros'
import ResumenCaja, { Diferencia } from './ResumenCaja'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-09-24" → "Jueves 24/09/2026" */
function nombreDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const dia = DIAS[new Date(a, m - 1, d).getDay()]
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`
}

/** "2026-10" → "Octubre 2026" */
function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const nombre = MESES[m - 1]
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${a}`
}

/** Mes de hoy en formato "2026-10" */
const mesActual = () => new Date().toLocaleDateString('sv-SE').slice(0, 7)

/** Turnos cerrados de un mes agrupados por día, el total del mes y el ranking de productos. */
export default function PantallaResumenes() {
  const [meses, setMeses] = useState<string[] | null>(null)
  const [mes, setMes] = useState<string | null>(null)
  const [resumenes, setResumenes] = useState<ResumenTurno[] | null>(null)
  const [productos, setProductos] = useState<ProductosDelMes | null>(null)
  const [viendo, setViendo] = useState<ResumenTurno | null>(null)
  const [ticket, setTicket] = useState<Ticket | null>(null)

  // Meses con turnos; se abre el más nuevo (o el actual si todavía no hay ninguno)
  useEffect(() => {
    window.restix.caja.meses().then((lista) => {
      setMeses(lista)
      setMes(lista[0] ?? mesActual())
    })
  }, [])

  useEffect(() => {
    if (!mes) return
    let vigente = true
    setResumenes(null)
    setProductos(null)
    window.restix.caja.turnos(mes).then(async (turnos) => {
      const cerrados = turnos.filter((t) => t.estado === 'cerrado')
      const lista = await Promise.all(cerrados.map((t) => window.restix.caja.resumen(t.id)))
      if (vigente) setResumenes(lista.filter((r): r is ResumenTurno => r !== null))
    })
    window.restix.caja.productosVendidos(mes).then((r) => vigente && r.ok && setProductos(r.dato))
    return () => {
      vigente = false
    }
  }, [mes])

  if (!meses || !mes || !resumenes) return <div className="cargando">Cargando…</div>

  // Agrupados por el día en que se abrió el turno
  const dias = new Map<string, ResumenTurno[]>()
  for (const r of resumenes) {
    const dia = r.turno.abierto_en.slice(0, 10)
    dias.set(dia, [...(dias.get(dia) ?? []), r])
  }

  const imprimir = async (r: ResumenTurno) => setTicket(ticketCierre(r, await window.restix.local.ver()))

  // Navegación entre meses con turnos (la lista viene del más nuevo al más viejo)
  const indice = meses.indexOf(mes)
  const anterior = indice >= 0 ? meses[indice + 1] : meses[0]
  const siguiente = indice > 0 ? meses[indice - 1] : undefined
  const totalMes = resumenes.reduce((s, r) => s + r.ventas, 0)
  const comisionMes = resumenes.reduce((s, r) => s + r.pedidosYa.comision, 0)
  const maximo = Math.max(1, ...(productos?.vendidos.map((p) => p.cantidad) ?? [1]))

  return (
    <div className="pantalla-caja">
      <header className="zona-encabezado">
        <div>
          <h2 className="titulo-seccion">Resúmenes de turnos y días</h2>
          <span className="ayuda-lista">Cada turno cerrado queda acá. Tocá uno para ver el detalle.</span>
        </div>
        <div className="fila selector-mes">
          <button className="icono" title="Mes anterior" disabled={!anterior} onClick={() => anterior && setMes(anterior)}>
            ‹
          </button>
          <select className="campo" value={mes} onChange={(e) => setMes(e.target.value)}>
            {!meses.includes(mes) && <option value={mes}>{nombreMes(mes)}</option>}
            {meses.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
          <button className="icono" title="Mes siguiente" disabled={!siguiente} onClick={() => siguiente && setMes(siguiente)}>
            ›
          </button>
        </div>
      </header>

      {resumenes.length > 0 && (
        <section className="total-mes">
          <span>
            {nombreMes(mes)} · {resumenes.length === 1 ? '1 turno' : `${resumenes.length} turnos`}
            {comisionMes > 0 && ` · comisión Pedidos Ya estimada ${formatearPrecio(comisionMes)}`}
          </span>
          <strong>{formatearPrecio(totalMes)}</strong>
        </section>
      )}

      {!resumenes.length && <p className="ayuda-lista">No hay turnos cerrados en {nombreMes(mes).toLowerCase()}.</p>}

      {[...dias.entries()].map(([dia, turnos]) => {
        const total = turnos.reduce((s, r) => s + r.ventas, 0)
        const diferencia = turnos.reduce((s, r) => s + (r.diferencia ?? 0), 0)
        return (
          <section key={dia} className="dia-resumen">
            <header className="fila">
              <h3>{nombreDia(dia)}</h3>
              <span className="ayuda-lista">
                {turnos.length === 1 ? '1 turno' : `${turnos.length} turnos`} · arqueo del día <Diferencia valor={diferencia} />
              </span>
              <strong className="total-dia">{formatearPrecio(total)}</strong>
            </header>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Horario</th>
                  <th className="derecha">Efectivo</th>
                  <th className="derecha">Transf.</th>
                  <th className="derecha">Débito</th>
                  <th className="derecha">Crédito</th>
                  <th className="derecha">Pedidos Ya</th>
                  <th className="derecha">Total</th>
                  <th>Arqueo</th>
                </tr>
              </thead>
              <tbody>
                {turnos.map((r) => (
                  <tr key={r.turno.id} onClick={() => setViendo(r)}>
                    <td>
                      {r.turno.abierto_en.slice(11, 16)} a {r.turno.cerrado_en?.slice(11, 16)}
                    </td>
                    <td className="derecha numero">{formatearPrecio(r.porMedio.efectivo)}</td>
                    <td className="derecha numero">{formatearPrecio(r.porMedio.transferencia)}</td>
                    <td className="derecha numero">{formatearPrecio(r.porMedio.debito)}</td>
                    <td className="derecha numero">{formatearPrecio(r.porMedio.credito)}</td>
                    <td className="derecha numero">{formatearPrecio(r.porMedio.pedidosya)}</td>
                    <td className="derecha numero">
                      <strong>{formatearPrecio(r.ventas)}</strong>
                    </td>
                    <td>{r.diferencia !== null && <Diferencia valor={r.diferencia} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}

      {productos && productos.vendidos.length > 0 && (
        <section className="ranking-productos">
          <h3>Productos vendidos en {nombreMes(mes).toLowerCase()}</h3>
          <p className="ayuda-lista">Del más al menos vendido, de las mesas cobradas en el mes. Importes de lista (antes de descuentos).</p>
          <table className="tabla compacta">
            <thead>
              <tr>
                <th>#</th>
                <th>Producto</th>
                <th className="derecha">Cantidad</th>
                <th />
                <th className="derecha">Importe</th>
              </tr>
            </thead>
            <tbody>
              {productos.vendidos.map((p, i) => (
                <tr key={p.nombre}>
                  <td className="tenue">{i + 1}</td>
                  <td>{p.nombre}</td>
                  <td className="derecha numero">{p.cantidad}</td>
                  <td className="barra-celda">
                    <span className="barra-ranking" style={{ width: `${(p.cantidad / maximo) * 100}%` }} />
                  </td>
                  <td className="derecha numero">{formatearPrecio(p.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {productos.sinVentas.length > 0 && (
            <p className="ayuda-lista">
              <strong>Sin ventas en el mes ({productos.sinVentas.length}):</strong> {productos.sinVentas.join(', ')}
            </p>
          )}
        </section>
      )}

      {viendo && (
        <Modal
          titulo={`Turno ${nombreDia(viendo.turno.abierto_en.slice(0, 10))} · ${viendo.turno.abierto_en.slice(11, 16)} a ${viendo.turno.cerrado_en?.slice(11, 16)}`}
          onCerrar={() => setViendo(null)}
          ancho={1000}
          pie={
            <button className="secundario" onClick={() => imprimir(viendo)}>
              🖨 Imprimir cierre
            </button>
          }
        >
          <ResumenCaja r={viendo} />
          <section className="lista-movimientos">
            <h4>Cobros del turno</h4>
            <ListaCobros
              turnoId={viendo.turno.id}
              corregible={false}
              onCambio={async () => {
                // Una nota de crédito o una factura nueva cambian lo facturado del cierre
                const r = await window.restix.caja.resumen(viendo.turno.id)
                if (r) {
                  setViendo(r)
                  setResumenes((lista) => lista && lista.map((x) => (x.turno.id === r.turno.id ? r : x)))
                }
              }}
            />
          </section>
        </Modal>
      )}

      {ticket && <ModalTickets titulo={ticket.titulo} tickets={[ticket]} onCerrar={() => setTicket(null)} />}
    </div>
  )
}
