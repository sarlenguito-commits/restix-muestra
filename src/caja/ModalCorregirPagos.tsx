import { useState } from 'react'
import { MEDIOS_SALON, NOMBRE_MEDIO, type CobroDelTurno, type MedioPago, type Pago } from '@shared/types'
import { etiquetaComanda } from '@shared/ticket'
import Modal from '../components/Modal'
import { pedirPin } from '../components/ModalPin'
import { formatearPrecio, leerPrecio, precioParaCampo } from '../formato'

interface Fila {
  medio: MedioPago
  monto: string
  /** Solo efectivo: con cuánto pagó (vacío = justo) */
  recibido: string
}

interface Props {
  cobro: CobroDelTurno
  onCerrar: () => void
  onCorregido: (cobros: CobroDelTurno[]) => void
}

/** Nombre del cobro en la lista y en los títulos: "Mesa 4 · Cuenta 2", "Pedidos Ya #4821" */
export const nombreCobro = (c: CobroDelTurno) => `${etiquetaComanda(c)}${c.cuenta ? ` · ${c.cuenta}` : ''}`

/**
 * Corrige los medios de pago de un cobro ya hecho (ej. se cargó débito y era efectivo). El total no cambia.
 * Pide el PIN de ADMIN. Solo para cobros del turno abierto (lo controla el proceso principal).
 */
export default function ModalCorregirPagos({ cobro, onCerrar, onCorregido }: Props) {
  const medios: MedioPago[] = cobro.canal === 'pedidosya' ? ['pedidosya', 'efectivo'] : MEDIOS_SALON
  const [filas, setFilas] = useState<Fila[]>(() =>
    cobro.pagos.map((p) => ({ medio: p.medio, monto: precioParaCampo(p.monto), recibido: p.recibido ? precioParaCampo(p.recibido) : '' }))
  )
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const montos = filas.map((f) => leerPrecio(f.monto))
  const falta = cobro.total - montos.reduce<number>((s, m) => s + (m ?? 0), 0)
  const cambiar = (i: number, cambios: Partial<Fila>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios } : f)))
  const agregar = () =>
    setFilas((fs) => [...fs, { medio: medios.find((m) => !fs.some((f) => f.medio === m)) ?? medios[0], monto: falta > 0 ? precioParaCampo(falta) : '', recibido: '' }])

  const guardar = async () => {
    const pagos: Pago[] = []
    for (const [i, f] of filas.entries()) {
      const monto = montos[i]
      if (monto === null || monto <= 0) return setError(`Revisá el monto de ${NOMBRE_MEDIO[f.medio]}.`)
      const recibido = f.medio === 'efectivo' && f.recibido.trim() ? leerPrecio(f.recibido) : null
      if (f.medio === 'efectivo' && f.recibido.trim() && (recibido === null || recibido < monto))
        return setError('En efectivo, lo recibido tiene que cubrir el monto.')
      pagos.push({ medio: f.medio, monto, recibido })
    }
    if (!pagos.length) return setError('Agregá al menos un medio de pago.')
    if (falta !== 0) return setError(falta > 0 ? 'Falta asignar una parte del total.' : 'Los pagos superan el total.')
    const pin = await pedirPin(`corregir el cobro de ${nombreCobro(cobro)}`)
    if (!pin) return
    setGuardando(true)
    const r = await window.restix.caja.corregirPagos(cobro.cuenta_id, pagos, pin)
    setGuardando(false)
    if (!r.ok) return setError(r.error)
    onCorregido(r.dato)
  }

  return (
    <Modal
      titulo={`Corregir cobro · ${nombreCobro(cobro)}`}
      onCerrar={onCerrar}
      ancho={600}
      pie={
        <>
          {error && <p className="error">{error}</p>}
          <button className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={falta !== 0 || guardando || !filas.length}>
            {guardando ? 'Guardando…' : 'Guardar corrección'}
          </button>
        </>
      }
    >
      <p className="ayuda-lista">
        Para cuando se cargó mal el medio de pago (ej. débito en vez de efectivo). El total no cambia: se corrige cómo se pagó.
        La caja y el resumen del turno se acomodan solos, y la corrección queda registrada.
      </p>
      <div className="renglon-importe total-cobro">
        <span>TOTAL COBRADO</span>
        <strong>{formatearPrecio(cobro.total)}</strong>
      </div>
      <p className="ayuda-lista">
        Se había cargado: {cobro.pagos.map((p) => `${NOMBRE_MEDIO[p.medio]} ${formatearPrecio(p.monto)}`).join(' + ')}
      </p>

      <div className="filas-pago">
        {filas.map((f, i) => (
          <div key={i} className="fila-pago">
            <div className="fila">
              <select className="campo" value={f.medio} onChange={(e) => cambiar(i, { medio: e.target.value as MedioPago, recibido: '' })}>
                {medios.map((m) => (
                  <option key={m} value={m}>
                    {NOMBRE_MEDIO[m]}
                  </option>
                ))}
              </select>
              <div className="campo-precio">
                <span>$</span>
                <input className="campo" inputMode="decimal" value={f.monto} onFocus={(e) => e.target.select()} onChange={(e) => cambiar(i, { monto: e.target.value })} />
              </div>
              {f.medio === 'efectivo' && (
                <>
                  <span className="ayuda-lista">recibió</span>
                  <div className="campo-precio">
                    <span>$</span>
                    <input className="campo" inputMode="decimal" placeholder="justo" value={f.recibido} onChange={(e) => cambiar(i, { recibido: e.target.value })} />
                  </div>
                </>
              )}
              <button className="icono chico" title="Quitar" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="fila">
        <button className="secundario" onClick={agregar}>
          + Medio de pago
        </button>
      </div>

      <div className={`renglon-importe falta ${falta === 0 ? 'completo' : ''}`}>
        <span>{falta >= 0 ? 'Falta asignar' : 'Sobra'}</span>
        <strong>
          {formatearPrecio(Math.abs(falta))} {falta === 0 && '✓'}
        </strong>
      </div>
    </Modal>
  )
}
