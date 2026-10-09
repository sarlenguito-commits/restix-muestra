import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NOMBRE_MEDIO, type Cuenta, type MedioPago, type Pago, type TipoDescuento } from '@shared/types'
import { formatearPrecio, leerPrecio, precioParaCampo } from '../../formato'

const ICONO_MEDIO: Record<MedioPago, string> = { efectivo: '💵', transferencia: '🏦', debito: '💳', credito: '💳', pedidosya: '🛵' }

interface Fila {
  medio: MedioPago
  monto: string
  /** Solo efectivo: con cuánto pagó (vacío = justo) */
  recibido: string
}

interface Props {
  cuenta: Cuenta
  /** Medios que se ofrecen (según el canal de la mesa) */
  medios: MedioPago[]
  /** Pedidos Ya: se paga todo con una sola opción (online o efectivo), sin dividir */
  unSoloMedio?: boolean
  /** Partes iguales: cuánto paga cada persona (cada medio agregado propone este monto) */
  porPersona?: number | null
  /** Contenido extra entre el total y los medios (ej. el selector de partes iguales) */
  extra?: ReactNode
  onDescuento: (tipo: TipoDescuento | null, valor: number | null, motivo: string) => Promise<boolean>
  onCobrar: (pagos: Pago[]) => Promise<boolean>
}

/** Billetes para pagar en efectivo: el justo y los redondeos siguientes (ej. $20.205 → 21.000, 25.000, 30.000). */
function billetesSugeridos(monto: number): number[] {
  const opciones = new Set<number>()
  for (const paso of [100000, 500000, 1000000]) opciones.add(Math.ceil(monto / paso) * paso)
  return [...opciones].filter((v) => v > monto).sort((a, b) => a - b).slice(0, 3)
}

export default function PanelPago({ cuenta, medios, unSoloMedio, porPersona, extra, onDescuento, onCobrar }: Props) {
  const [filas, setFilas] = useState<Fila[]>([])
  const [cobrando, setCobrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Descuento (se guarda en la cuenta al tocar "Aplicar")
  const [tipoDesc, setTipoDesc] = useState<TipoDescuento | null>(cuenta.descuento_tipo)
  const [valorDesc, setValorDesc] = useState(
    cuenta.descuento_valor === null
      ? ''
      : cuenta.descuento_tipo === 'monto'
        ? precioParaCampo(cuenta.descuento_valor)
        : String(cuenta.descuento_valor)
  )
  const [motivoDesc, setMotivoDesc] = useState(cuenta.descuento_motivo ?? '')

  // Si el total cambia con los pagos ya cargados (se aplicó o se sacó un descuento),
  // el último pago se acomoda solo al total nuevo para no tener que corregirlo a mano.
  const totalPrevio = useRef(cuenta.total)
  useEffect(() => {
    const diferencia = cuenta.total - totalPrevio.current
    totalPrevio.current = cuenta.total
    if (diferencia === 0) return
    setFilas((fs) => {
      const ultima = fs.at(-1)
      if (!ultima) return fs
      const nuevo = (leerPrecio(ultima.monto) ?? 0) + diferencia
      if (nuevo <= 0) return fs // no alcanza con el último: queda "Sobra" para corregirlo a mano
      const recibido = (leerPrecio(ultima.recibido) ?? 0) >= nuevo ? ultima.recibido : ''
      return [...fs.slice(0, -1), { ...ultima, monto: precioParaCampo(nuevo), recibido }]
    })
  }, [cuenta.total])

  const montos = filas.map((f) => leerPrecio(f.monto))
  const pagado = montos.reduce<number>((s, m) => s + (m ?? 0), 0)
  const falta = cuenta.total - pagado

  const agregar = (medio: MedioPago) => {
    // Una sola opción: elegir un medio reemplaza al anterior y cobra el total
    if (unSoloMedio) return setFilas([{ medio, monto: precioParaCampo(cuenta.total), recibido: '' }])
    const monto = porPersona ? Math.min(porPersona, falta) : falta
    if (monto <= 0) return
    setFilas((fs) => [...fs, { medio, monto: precioParaCampo(monto), recibido: '' }])
  }
  const cambiar = (i: number, cambios: Partial<Fila>) =>
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios } : f)))

  const aplicarDescuento = async (tipo: TipoDescuento | null) => {
    setError(null)
    if (tipo === null) {
      setTipoDesc(null)
      setValorDesc('')
      setMotivoDesc('')
      return onDescuento(null, null, '')
    }
    const valor = tipo === 'monto' ? leerPrecio(valorDesc) : Number(valorDesc.replace(',', '.'))
    if (valor === null || !Number.isFinite(valor) || valor < 0) return setError('Valor de descuento inválido.')
    // Antes 12,5 % se redondeaba a 13 % sin avisar
    if (tipo === 'porcentaje' && !Number.isInteger(valor))
      return setError('El porcentaje va sin decimales (ej.: 10). Para un monto exacto, usá el descuento en $.')
    await onDescuento(tipo, Math.round(valor), motivoDesc)
  }

  const confirmar = async () => {
    const pagos: Pago[] = []
    for (const [i, f] of filas.entries()) {
      const monto = montos[i]
      if (monto === null || monto <= 0) return setError(`Revisá el monto de ${NOMBRE_MEDIO[f.medio]}.`)
      const recibido = f.medio === 'efectivo' && f.recibido.trim() ? leerPrecio(f.recibido) : null
      if (f.medio === 'efectivo' && f.recibido.trim() && (recibido === null || recibido < monto))
        return setError('En efectivo, lo recibido tiene que cubrir el monto.')
      pagos.push({ medio: f.medio, monto, recibido })
    }
    if (falta !== 0) return setError(falta > 0 ? 'Falta cobrar una parte.' : 'Los pagos superan el total.')
    setError(null)
    setCobrando(true)
    await onCobrar(pagos)
    setCobrando(false)
  }

  return (
    <div className="panel-pago">
      <div className="renglon-importe">
        <span>Subtotal</span>
        <span>{formatearPrecio(cuenta.subtotal)}</span>
      </div>

      <div className="descuento">
        <div className="segmentado chico">
          <button className={tipoDesc === null ? 'activo' : ''} onClick={() => tipoDesc !== null && aplicarDescuento(null)}>
            Sin descuento
          </button>
          <button className={tipoDesc === 'porcentaje' ? 'activo' : ''} onClick={() => setTipoDesc('porcentaje')}>
            %
          </button>
          <button className={tipoDesc === 'monto' ? 'activo' : ''} onClick={() => setTipoDesc('monto')}>
            $
          </button>
        </div>
        {tipoDesc && (
          <>
            <input
              className="campo valor"
              inputMode="decimal"
              placeholder={tipoDesc === 'porcentaje' ? '10' : '1.000'}
              value={valorDesc}
              onChange={(e) => setValorDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarDescuento(tipoDesc)}
            />
            <input
              className="campo motivo"
              placeholder="Motivo (opcional)"
              value={motivoDesc}
              onChange={(e) => setMotivoDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarDescuento(tipoDesc)}
            />
            <button className="secundario" onClick={() => aplicarDescuento(tipoDesc)}>
              Aplicar
            </button>
          </>
        )}
        {cuenta.descuento > 0 && <span className="monto-descuento">− {formatearPrecio(cuenta.descuento)}</span>}
      </div>

      <div className="renglon-importe total-cobro">
        <span>TOTAL</span>
        <strong>{formatearPrecio(cuenta.total)}</strong>
      </div>

      {extra}

      <div className="medios">
        {medios.map((m) => (
          <button
            key={m}
            className={`medio ${unSoloMedio && filas[0]?.medio === m ? 'elegido' : ''}`}
            onClick={() => agregar(m)}
            disabled={!unSoloMedio && falta <= 0}
          >
            <span>{ICONO_MEDIO[m]}</span> {NOMBRE_MEDIO[m]}
          </button>
        ))}
      </div>

      <div className="filas-pago">
        {filas.map((f, i) => {
          const monto = montos[i]
          const recibido = f.recibido.trim() ? leerPrecio(f.recibido) : null
          const vuelto = monto !== null && recibido !== null && recibido >= monto ? recibido - monto : null
          return (
            <div key={i} className="fila-pago">
              <div className="fila">
                <span className="medio-nombre">
                  {ICONO_MEDIO[f.medio]} {NOMBRE_MEDIO[f.medio]}
                </span>
                <div className="campo-precio">
                  <span>$</span>
                  <input
                    className="campo"
                    inputMode="decimal"
                    value={f.monto}
                    readOnly={unSoloMedio}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => cambiar(i, { monto: e.target.value })}
                  />
                </div>
                {f.medio === 'efectivo' && (
                  <>
                    <span className="ayuda-lista">recibió</span>
                    <div className="campo-precio">
                      <span>$</span>
                      <input
                        className="campo"
                        inputMode="decimal"
                        placeholder="justo"
                        value={f.recibido}
                        onChange={(e) => cambiar(i, { recibido: e.target.value })}
                      />
                    </div>
                    {vuelto !== null && vuelto > 0 && <strong className="vuelto">Vuelto {formatearPrecio(vuelto)}</strong>}
                  </>
                )}
                <button className="icono chico" title="Quitar" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
              {f.medio === 'efectivo' && monto !== null && monto > 0 && (
                <div className="billetes">
                  <button className={!f.recibido ? 'elegido' : ''} onClick={() => cambiar(i, { recibido: '' })}>
                    Justo
                  </button>
                  {billetesSugeridos(monto).map((b) => (
                    <button
                      key={b}
                      className={recibido === b ? 'elegido' : ''}
                      onClick={() => cambiar(i, { recibido: precioParaCampo(b) })}
                    >
                      {formatearPrecio(b)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className={`renglon-importe falta ${falta === 0 ? 'completo' : ''}`}>
        <span>{falta >= 0 ? 'Falta cobrar' : 'Sobra'}</span>
        <strong>
          {formatearPrecio(Math.abs(falta))} {falta === 0 && '✓'}
        </strong>
      </div>

      <div className="fila pie-pago">
        <button className="confirmar" disabled={falta !== 0 || cobrando} onClick={confirmar}>
          {cobrando ? 'Cobrando…' : 'Confirmar cobro'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
