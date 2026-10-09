import { useCallback, useEffect, useState } from 'react'
import { NOMBRE_MEDIO, type CobroDelTurno } from '@shared/types'
import { ticketDeCuenta, type Ticket } from '@shared/ticket'
import ModalTickets from '../comanda/ModalTickets'
import { formatearPrecio } from '../formato'
import ModalCorregirPagos, { nombreCobro } from './ModalCorregirPagos'

interface Props {
  turnoId: number
  /** Turno abierto: se pueden corregir los medios de pago (✎). En uno cerrado el arqueo ya está hecho. */
  corregible: boolean
  /** Cambia cuando la pantalla de arriba recarga (ej. hubo un cobro nuevo) */
  recarga?: number
  /** Después de corregir (para recargar la caja y lo vendido) */
  onCambio?: () => void
}

/**
 * Los cobros de un turno: ver el comprobante (🧾) y corregir medios de pago (✎, solo turno abierto).
 * Se usa en Caja y en Resúmenes.
 */
export default function ListaCobros({ turnoId, corregible, recarga, onCambio }: Props) {
  const [cobros, setCobros] = useState<CobroDelTurno[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<CobroDelTurno | null>(null)

  const cargar = useCallback(async () => {
    setCobros(await window.restix.caja.cobros(turnoId))
  }, [turnoId])

  useEffect(() => {
    cargar()
  }, [cargar, recarga])

  const cambio = async () => {
    await cargar()
    onCambio?.()
  }

  /** El comprobante de pago de un cobro, para verlo de nuevo */
  const verComprobante = async (cobro: CobroDelTurno) => {
    const estado = await window.restix.cobro.estado(cobro.comanda_id)
    const cuenta = estado.ok ? estado.dato.cuentas.find((c) => c.id === cobro.cuenta_id) : undefined
    if (!estado.ok || !cuenta) return setError('No se encontró ese cobro.')
    const local = await window.restix.local.ver()
    setTickets([ticketDeCuenta(cuenta, estado.dato.comanda, local, cobro.cobrada_en)])
  }

  return (
    <>
      <p className="ayuda-lista">
        {corregible && 'Si un cobro se cargó con el medio equivocado, tocá ✎ para corregirlo (pide el PIN).'}
      </p>
      <table className="tabla compacta">
        <tbody>
          {cobros.map((c) => (
            <tr key={c.cuenta_id}>
              <td className="tenue">{c.cobrada_en.slice(11, 16)}</td>
              <td>
                {nombreCobro(c)}
                {c.correcciones > 0 && <span className="tenue"> · corregido</span>}
              </td>
              <td className="tenue">{c.pagos.map((p) => `${NOMBRE_MEDIO[p.medio]} ${formatearPrecio(p.monto)}`).join(' + ')}</td>
              <td className="derecha numero">{formatearPrecio(c.total)}</td>
              <td className="derecha acciones-cobro">
                <button className="icono chico" title="Ver el comprobante" onClick={() => verComprobante(c)}>
                  🧾
                </button>
                {corregible && (
                  <>
                    {' '}
                    <button className="icono chico" title="Corregir los medios de pago" onClick={() => setCorrigiendo(c)}>
                      ✎
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {!cobros.length && (
            <tr>
              <td className="tenue">Todavía no hay cobros en este turno.</td>
            </tr>
          )}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}

      {corrigiendo && (
        <ModalCorregirPagos
          cobro={corrigiendo}
          onCerrar={() => setCorrigiendo(null)}
          onCorregido={async (lista) => {
            setCorrigiendo(null)
            setCobros(lista)
            await cambio() // la caja grande y lo vendido por medio cambian
          }}
        />
      )}

      {tickets && tickets.length > 0 && <ModalTickets titulo={tickets[0].titulo} tickets={tickets} onCerrar={() => setTickets(null)} />}
    </>
  )
}
