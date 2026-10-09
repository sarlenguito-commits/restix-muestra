import { useCallback, useEffect, useState } from 'react'
import { MEDIOS_SALON, type Comanda, type EstadoCobro, type MedioPago, type Pago, type Resultado, type TipoDescuento } from '@shared/types'
import { ahora, etiquetaComanda, ticketDeCuenta, type Ticket } from '@shared/ticket'
import Modal from '../../components/Modal'
import VistaTicket from '../../components/VistaTicket'
import { formatearPrecio } from '../../formato'
import AbrirCaja from './AbrirCaja'
import DivisionItems from './DivisionItems'
import ModalTickets from '../ModalTickets'
import PanelPago from './PanelPago'

type Modo = 'junto' | 'iguales' | 'items'

/** Pedidos Ya se cobra por la app (o en efectivo si paga el cadete); el resto, con los medios de siempre */
const MEDIOS_PEDIDOSYA: MedioPago[] = ['pedidosya', 'efectivo']

interface Props {
  comanda: Comanda
  /** liberada: true si con el cobro la mesa quedó libre */
  onCerrar: (liberada: boolean) => void
}

export default function ModalCobro({ comanda, onCerrar }: Props) {
  const [estado, setEstado] = useState<EstadoCobro | null>(null)
  const [modo, setModo] = useState<Modo>('junto')
  const [partes, setPartes] = useState(Math.max(2, comanda.comensales ?? 2))
  /** En "por ítems": la cuenta que se está cobrando (null = viendo la división) */
  const [cobrandoId, setCobrandoId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Comprobante del último cobro (se muestra antes de seguir) */
  const [comprobante, setComprobante] = useState<Ticket | null>(null)
  /** Cuenta previa de una persona (división por ítems) */
  const [cuentaPrevia, setCuentaPrevia] = useState<Ticket | null>(null)
  const cb = window.restix.cobro

  /** Aplica el resultado: estado nuevo o el motivo del rechazo. */
  const aplicar = useCallback(async (promesa: Promise<Resultado<EstadoCobro>>): Promise<boolean> => {
    const r = await promesa
    if (!r.ok) {
      setError(r.error)
      return false
    }
    setError(null)
    setEstado(r.dato)
    return true
  }, [])

  // Al abrir: si ya estaba dividida, se muestra la división; si no, una sola cuenta
  useEffect(() => {
    cb.estado(comanda.id).then((r) => {
      if (!r.ok) return setError(r.error)
      if (r.dato.cuentas.some((c) => c.por_items)) {
        setModo('items')
        setEstado(r.dato)
      } else aplicar(cb.todoJunto(comanda.id))
    })
  }, [comanda.id, cb, aplicar])

  if (!estado) return null

  const cambiarModo = async (nuevo: Modo) => {
    if (nuevo === modo) return
    setCobrandoId(null)
    if (nuevo === 'items') {
      if (await aplicar(cb.dividir(comanda.id, partes))) setModo('items')
    } else {
      if (modo === 'items' && !(await aplicar(cb.deshacerDivision(comanda.id)))) return
      setModo(nuevo)
    }
  }

  const descuento = (cuentaId: number) => (tipo: TipoDescuento | null, valor: number | null, motivo: string) =>
    aplicar(cb.descuento(cuentaId, tipo, valor, motivo))

  const cobrar = (cuentaId: number) => async (pagos: Pago[]) => {
    const r = await cb.cobrar(cuentaId, pagos)
    if (!r.ok) {
      setError(r.error)
      return false
    }
    setError(null)
    setEstado(r.dato)
    setCobrandoId(null)
    // Comprobante de lo que se acaba de cobrar
    const cuenta = r.dato.cuentas.find((c) => c.id === cuentaId)
    if (cuenta) setComprobante(ticketDeCuenta(cuenta, r.dato.comanda, await window.restix.local.ver(), ahora()))
    return true
  }

  /** Después del comprobante: si la mesa quedó libre se cierra todo; si no, se vuelve a las cuentas. */
  const seguir = () => {
    setComprobante(null)
    if (estado.comanda.estado === 'cerrada') onCerrar(true)
  }

  const imprimirCuentaPrevia = async (cuentaId: number) => {
    const cuenta = estado.cuentas.find((c) => c.id === cuentaId)
    if (cuenta) setCuentaPrevia(ticketDeCuenta(cuenta, estado.comanda, await window.restix.local.ver(), ahora()))
  }

  const medios = comanda.canal === 'pedidosya' ? MEDIOS_PEDIDOSYA : MEDIOS_SALON
  const unica = estado.cuentas.find((c) => !c.por_items)
  const cobrando = estado.cuentas.find((c) => c.id === cobrandoId)
  const cobradas = estado.cuentas.filter((c) => c.estado === 'cobrada').length

  return (
    <Modal titulo={`Cobrar ${etiquetaComanda(comanda)}`} onCerrar={() => onCerrar(estado.comanda.estado === 'cerrada')} ancho={modo === 'items' && !cobrando ? 980 : 720}>
      {comprobante ? (
        <div className="cobro-registrado">
          <h4>✓ Cobro registrado{estado.comanda.estado === 'cerrada' ? ' · la mesa quedó libre' : ''}</h4>
          <VistaTicket ticket={comprobante} />
          <div className="fila">
            <button onClick={seguir}>{estado.comanda.estado === 'cerrada' ? 'Listo' : 'Seguir con las cuentas'}</button>
          </div>
        </div>
      ) : !estado.turno ? (
        <AbrirCaja onAbrir={async (monto) => {
          const r = await window.restix.caja.abrir(monto)
          if (!r.ok) {
            setError(r.error)
            return false
          }
          return aplicar(cb.estado(comanda.id))
        }} />
      ) : (
        <>
          <div className="segmentado modos-cobro">
            {(
              [
                ['junto', 'Todo junto'],
                ['iguales', 'Partes iguales'],
                ['items', 'Por ítems']
              ] as const
            ).map(([m, texto]) => (
              <button key={m} className={modo === m ? 'activo' : ''} onClick={() => cambiarModo(m)} disabled={cobradas > 0 && m !== modo}>
                {texto}
              </button>
            ))}
          </div>

          {modo !== 'items' && unica && (
            <PanelPago
              key={`${unica.id}-${modo}`}
              cuenta={unica}
              medios={medios}
              unSoloMedio={comanda.canal === 'pedidosya'}
              porPersona={modo === 'iguales' ? Math.ceil(unica.total / partes) : null}
              extra={
                modo === 'iguales' && (
                  <div className="partes-iguales">
                    <span>Entre</span>
                    <div className="contador chico">
                      <button className="icono chico" disabled={partes <= 2} onClick={() => setPartes((p) => p - 1)}>
                        −
                      </button>
                      <span>{partes}</span>
                      <button className="icono chico" disabled={partes >= 20} onClick={() => setPartes((p) => p + 1)}>
                        +
                      </button>
                    </div>
                    <span>
                      → <strong>{formatearPrecio(Math.ceil(unica.total / partes))}</strong> cada uno
                    </span>
                    <span className="ayuda-lista">(el último paga lo que falte)</span>
                  </div>
                )
              }
              onDescuento={descuento(unica.id)}
              onCobrar={cobrar(unica.id)}
            />
          )}

          {modo === 'items' && !cobrando && (
            <>
              <div className="fila encabezado-division">
                <span className="ayuda-lista">
                  Cobradas {cobradas} de {estado.cuentas.length}
                  {estado.sinAsignar.length > 0 && ' · falta asignar ítems'}
                </span>
              </div>
              <DivisionItems
                cuentas={estado.cuentas}
                sinAsignar={estado.sinAsignar}
                onAsignar={(cuentaId, itemId, cantidad) => aplicar(cb.asignar(cuentaId, itemId, cantidad))}
                onRepartir={(itemId) =>
                  aplicar(cb.repartir(itemId, estado.cuentas.filter((c) => c.estado === 'pendiente').map((c) => c.id)))
                }
                onRenombrar={(cuentaId, nombre) => aplicar(cb.renombrarCuenta(cuentaId, nombre))}
                onAgregarCuenta={() => aplicar(cb.agregarCuenta(comanda.id))}
                onQuitarCuenta={(cuentaId) => aplicar(cb.quitarCuenta(cuentaId))}
                onCobrar={setCobrandoId}
                onImprimir={(c) => imprimirCuentaPrevia(c.id)}
              />
            </>
          )}

          {modo === 'items' && cobrando && (
            <>
              <div className="fila encabezado-division">
                <button className="secundario" onClick={() => setCobrandoId(null)}>
                  ← Cuentas
                </button>
                <strong>{cobrando.nombre}</strong>
              </div>
              <PanelPago
                key={cobrando.id}
                cuenta={cobrando}
                medios={medios}
                unSoloMedio={comanda.canal === 'pedidosya'}
                onDescuento={descuento(cobrando.id)}
                onCobrar={cobrar(cobrando.id)}
              />
            </>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
      {cuentaPrevia && <ModalTickets titulo={cuentaPrevia.titulo} tickets={[cuentaPrevia]} onCerrar={() => setCuentaPrevia(null)} />}
    </Modal>
  )
}
