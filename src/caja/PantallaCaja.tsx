import { useCallback, useEffect, useState } from 'react'
import {
  NOMBRE_CAJA,
  type Caja,
  type MovimientoCaja,
  type NuevoMovimiento,
  type PagoPersonal,
  type Resultado,
  type ResumenTurno
} from '@shared/types'
import { ticketCierre, type Ticket } from '@shared/ticket'
import ModalTickets from '../comanda/ModalTickets'
import AbrirCaja from '../comanda/cobro/AbrirCaja'
import { confirmar } from '../components/Confirmar'
import { pedirPin } from '../components/ModalPin'
import { formatearPrecio } from '../formato'
import FormMovimiento from './FormMovimiento'
import ModalCerrarCaja from './ModalCerrarCaja'
import ListaCobros from './ListaCobros'
import { detalleMovimiento, fechaCorta, VendidoPorMedio } from './ResumenCaja'

/** El turno en curso: lo vendido en vivo, las tres cajas y los movimientos de efectivo. */
export default function PantallaCaja() {
  const [actual, setActual] = useState<ResumenTurno | null>(null)
  const [gastos, setGastos] = useState<{ saldo: number; movimientos: MovimientoCaja[] }>({ saldo: 0, movimientos: [] })
  const [cargado, setCargado] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  // Tickets en pantalla (cierre, parcial o los comprobantes de un cobro)
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const setTicket = (t: Ticket) => setTickets([t])
  const [error, setError] = useState<string | null>(null)
  // Sube en cada recarga, para que la lista de cobros se actualice también
  const [recarga, setRecarga] = useState(0)
  const cargar = useCallback(async () => {
    const turno = await window.restix.caja.turno()
    setActual(turno ? await window.restix.caja.resumen(turno.id) : null)
    setGastos(await window.restix.caja.gastos())
    setRecarga((n) => n + 1)
    setCargado(true)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  /** Después de un cambio: se muestra el error o se recargan los saldos. */
  async function aplicar<T>(p: Promise<Resultado<T>>): Promise<boolean> {
    const r = await p
    if (!r.ok) {
      setError(r.error)
      return false
    }
    setError(null)
    await cargar()
    return true
  }

  const borrar = async (m: MovimientoCaja) => {
    const texto = m.grupo !== null ? 'este pago (todas sus partes)' : 'este movimiento'
    if (!(await confirmar(`¿Borrar ${texto}? Usalo solo para corregir un error de carga.`, { boton: 'Borrar', peligro: true })))
      return
    const pin = await pedirPin(`borrar ${texto}`)
    if (pin) await aplicar(window.restix.caja.borrarMovimiento(m.id, pin))
  }

  /**
   * Si lo que sale de alguna caja es más de lo que tiene, se pregunta antes (puede ser un error de tipeo).
   * No se prohíbe: el saldo es lo esperado según lo cargado, y si se cargó algo mal la plata real puede ser otra.
   */
  const confirmarSalidas = async (salidas: [Caja, number][]): Promise<boolean> => {
    const saldo = (caja: Caja) =>
      caja === 'gastos' ? (actual?.gastosSaldo ?? gastos.saldo) : (actual?.cajas[caja].esperado ?? 0)
    const negativas = salidas.filter(([caja, monto]) => monto > 0 && monto > saldo(caja))
    if (!negativas.length) return true
    const detalle = negativas
      .map(([caja, monto]) => `${NOMBRE_CAJA[caja]} tiene ${formatearPrecio(saldo(caja))} y salen ${formatearPrecio(monto)}`)
      .join('; ')
    return confirmar(`${detalle}: quedaría en negativo. ¿Registrarlo igual?`, { boton: 'Registrar igual', titulo: 'Caja en negativo' })
  }

  const registrarMovimiento = async (m: NuevoMovimiento) => {
    const origen = m.tipo === 'gasto' ? 'gastos' : m.origen
    if (origen && m.tipo !== 'ingreso' && !(await confirmarSalidas([[origen, m.monto]]))) return false
    return aplicar(window.restix.caja.movimiento(m))
  }

  const pagarPersonal = async (p: PagoPersonal) => {
    if (!(await confirmarSalidas([['chica', p.deChica], ['grande', p.deGrande]]))) return false
    return aplicar(window.restix.caja.pagarPersonal(p))
  }

  const imprimirParcial = async () => actual && setTicket(ticketCierre(actual, await window.restix.local.ver()))

  if (!cargado) return <div className="cargando">Cargando…</div>

  // Los pagos al personal en partes se muestran en un solo renglón
  const movimientos = actual?.movimientos ?? []
  const renglones = movimientos.filter((m, i) => m.grupo === null || movimientos.findIndex((x) => x.grupo === m.grupo) === i)
  const totalGrupo = (m: MovimientoCaja) =>
    m.grupo === null ? m.monto : movimientos.filter((x) => x.grupo === m.grupo).reduce((s, x) => s + x.monto, 0)
  const desglose = (m: MovimientoCaja) =>
    m.grupo === null
      ? ''
      : movimientos
          .filter((x) => x.grupo === m.grupo)
          .map((x) => `${x.caja_origen === 'chica' ? 'chica' : 'grande'} ${formatearPrecio(x.monto)}`)
          .join(' + ')

  return (
    <div className="pantalla-caja">
      {actual ? (
        <header className="zona-encabezado">
          <div>
            <h2 className="titulo-seccion">Caja abierta</h2>
            <span className="ayuda-lista">Desde {fechaCorta(actual.turno.abierto_en)}</span>
          </div>
          <div className="fila">
            <button className="icono" title="Actualizar" onClick={cargar}>
              ↻
            </button>
            <button className="secundario" onClick={imprimirParcial}>
              🖨 Parcial
            </button>
            <button onClick={() => setCerrando(true)}>Cerrar caja</button>
          </div>
        </header>
      ) : (
        <section className="caja-cerrada">
          <AbrirCaja onAbrir={(monto) => aplicar(window.restix.caja.abrir(monto))} />
        </section>
      )}

      {actual && (
        <section>
          <h4 className="subtitulo-caja">Vendido en el turno</h4>
          <VendidoPorMedio r={actual} enVivo />
        </section>
      )}

      <div className="cajas">
        {actual && (
          <>
            <div className="tarjeta-caja">
              <span className="etiqueta-indicador">{NOMBRE_CAJA.chica}</span>
              <strong>{formatearPrecio(actual.cajas.chica.esperado)}</strong>
              <span className="ayuda-lista">Arrancó con {formatearPrecio(actual.turno.efectivo_inicial)}</span>
            </div>
            <div className="tarjeta-caja">
              <span className="etiqueta-indicador">{NOMBRE_CAJA.grande}</span>
              <strong>{formatearPrecio(actual.cajas.grande.esperado)}</strong>
              <span className="ayuda-lista">Ventas en efectivo {formatearPrecio(actual.porMedio.efectivo)}</span>
            </div>
          </>
        )}
        <div className="tarjeta-caja gastos">
          <span className="etiqueta-indicador">{NOMBRE_CAJA.gastos}</span>
          <strong>{formatearPrecio(actual?.gastosSaldo ?? gastos.saldo)}</strong>
          <span className="ayuda-lista">Fondo que sigue de turno en turno</span>
        </div>
      </div>

      <FormMovimiento
        key={actual ? 'con-turno' : 'sin-turno'}
        turnoAbierto={!!actual}
        onMovimiento={registrarMovimiento}
        onPagoPersonal={pagarPersonal}
      />
      {error && <p className="error">{error}</p>}

      {actual ? (
        <section className="lista-movimientos">
          <h4>Movimientos del turno</h4>
          <table className="tabla compacta">
            <tbody>
              {renglones.map((m) => (
                <tr key={m.id}>
                  <td className="tenue">{m.fecha.slice(11, 16)}</td>
                  <td>
                    {detalleMovimiento(m)}
                    {m.grupo !== null && <span className="tenue"> · {desglose(m)}</span>}
                  </td>
                  <td className="derecha numero">{formatearPrecio(totalGrupo(m))}</td>
                  <td className="derecha">
                    <button className="icono chico" title="Borrar (corregir un error)" onClick={() => borrar(m)}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {!renglones.length && (
                <tr>
                  <td className="tenue">Todavía no hay movimientos en este turno.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="lista-movimientos">
          <h4>Últimos movimientos de la caja de gastos</h4>
          <table className="tabla compacta">
            <tbody>
              {gastos.movimientos.slice(0, 15).map((m) => (
                <tr key={m.id}>
                  <td className="tenue">{fechaCorta(m.fecha)}</td>
                  <td>{detalleMovimiento(m)}</td>
                  <td className="derecha numero">
                    {m.caja_destino === 'gastos' ? '+' : '−'} {formatearPrecio(m.monto)}
                  </td>
                </tr>
              ))}
              {!gastos.movimientos.length && (
                <tr>
                  <td className="tenue">Sin movimientos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {actual && (
        <section className="lista-movimientos">
          <h4>Cobros del turno</h4>
          <ListaCobros turnoId={actual.turno.id} corregible recarga={recarga} onCambio={cargar} />
        </section>
      )}

      {cerrando && actual && (
        <ModalCerrarCaja
          resumen={actual}
          onCerrar={() => setCerrando(false)}
          onCerrado={async (r) => {
            setCerrando(false)
            await cargar()
            setTicket(ticketCierre(r, await window.restix.local.ver()))
          }}
        />
      )}

      {tickets && tickets.length > 0 && <ModalTickets titulo={tickets[0].titulo} tickets={tickets} onCerrar={() => setTickets(null)} />}
    </div>
  )
}
