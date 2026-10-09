import { useEffect, useState } from 'react'
import { NOMBRE_CAJA, type Caja, type Mozo, type NuevoMovimiento, type PagoPersonal } from '@shared/types'
import { leerPrecio } from '../formato'

type Opcion = 'traspaso' | 'personal' | 'aGastos' | 'gasto' | 'ingreso' | 'retiro'

const OPCIONES: [Opcion, string][] = [
  ['traspaso', 'Traspaso'],
  ['personal', 'Pago al personal'],
  ['aGastos', 'A gastos'],
  ['gasto', 'Gasto'],
  ['ingreso', 'Ingreso'],
  ['retiro', 'Retiro']
]

const AYUDA: Record<Opcion, string> = {
  traspaso: 'Pasar plata de una caja a otra (ej.: falta cambio en la chica).',
  personal: 'Puede salir en partes de la chica y de la grande.',
  aGastos: 'Cargar la caja de gastos desde la chica o la grande.',
  gasto: 'Sale de la caja de gastos (ej.: hielo, proveedor chico).',
  ingreso: 'Plata que entra y no es una venta.',
  retiro: 'Plata que sale y no es un gasto ni un pago al personal.'
}

interface Props {
  /** Sin turno abierto solo se puede usar la caja de gastos */
  turnoAbierto: boolean
  onMovimiento: (m: NuevoMovimiento) => Promise<boolean>
  onPagoPersonal: (p: PagoPersonal) => Promise<boolean>
}

function SelectorCaja({ valor, opciones, onCambiar }: { valor: Caja; opciones: Caja[]; onCambiar: (c: Caja) => void }) {
  return (
    <select className="campo caja" value={valor} onChange={(e) => onCambiar(e.target.value as Caja)}>
      {opciones.map((c) => (
        <option key={c} value={c}>
          {NOMBRE_CAJA[c]}
        </option>
      ))}
    </select>
  )
}

function Monto({ valor, onCambiar, placeholder }: { valor: string; onCambiar: (v: string) => void; placeholder?: string }) {
  return (
    <div className="campo-precio">
      <span>$</span>
      <input className="campo" inputMode="decimal" placeholder={placeholder} value={valor} onChange={(e) => onCambiar(e.target.value)} />
    </div>
  )
}

/** Un solo formulario para todos los movimientos de efectivo. */
export default function FormMovimiento({ turnoAbierto, onMovimiento, onPagoPersonal }: Props) {
  const [opcion, setOpcion] = useState<Opcion>(turnoAbierto ? 'traspaso' : 'gasto')
  const [origen, setOrigen] = useState<Caja>('grande')
  const [destino, setDestino] = useState<Caja>('chica')
  const [monto, setMonto] = useState('')
  const [deChica, setDeChica] = useState('')
  const [deGrande, setDeGrande] = useState('')
  const [personaId, setPersonaId] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [personal, setPersonal] = useState<Mozo[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.restix.mozos.listar().then((lista) => setPersonal(lista.filter((p) => p.activo)))
  }, [])

  // Sin turno, la chica y la grande no se pueden mover
  const cajasPosibles: Caja[] = turnoAbierto ? ['chica', 'grande', 'gastos'] : ['gastos']
  const opcionesVisibles = turnoAbierto ? OPCIONES : OPCIONES.filter(([o]) => o === 'gasto' || o === 'ingreso' || o === 'retiro')

  const elegir = (o: Opcion) => {
    setOpcion(o)
    setError(null)
    if (o === 'traspaso') {
      setOrigen('grande')
      setDestino('chica')
    }
    if (o === 'aGastos') setOrigen('grande')
    if (o === 'ingreso') setDestino(turnoAbierto ? 'chica' : 'gastos')
    if (o === 'retiro') setOrigen(turnoAbierto ? 'chica' : 'gastos')
  }

  const limpiar = () => {
    setMonto('')
    setDeChica('')
    setDeGrande('')
    setMotivo('')
  }

  const registrar = async () => {
    setError(null)
    let ok: boolean
    if (opcion === 'personal') {
      const c = deChica.trim() ? leerPrecio(deChica) : 0
      const g = deGrande.trim() ? leerPrecio(deGrande) : 0
      if (personaId === null) return setError('Elegí a quién se le paga.')
      if (c === null || g === null || c + g <= 0) return setError('Cargá cuánto sale de cada caja.')
      ok = await onPagoPersonal({ persona_id: personaId, deChica: c, deGrande: g, motivo })
    } else {
      const m = leerPrecio(monto)
      if (m === null || m <= 0) return setError('Monto inválido.')
      const movimiento: NuevoMovimiento =
        opcion === 'traspaso'
          ? { tipo: 'traspaso', origen, destino, monto: m, motivo }
          : opcion === 'aGastos'
            ? { tipo: 'traspaso', origen, destino: 'gastos', monto: m, motivo: motivo || 'A caja de gastos' }
            : opcion === 'gasto'
              ? { tipo: 'gasto', monto: m, motivo }
              : opcion === 'ingreso'
                ? { tipo: 'ingreso', destino, monto: m, motivo }
                : { tipo: 'retiro', origen, monto: m, motivo }
      ok = await onMovimiento(movimiento)
    }
    if (ok) limpiar()
  }

  return (
    <section className="form-movimiento">
      <h4>Nuevo movimiento</h4>
      <div className="segmentado chico">
        {opcionesVisibles.map(([o, texto]) => (
          <button key={o} className={opcion === o ? 'activo' : ''} onClick={() => elegir(o)}>
            {texto}
          </button>
        ))}
      </div>
      <p className="ayuda-lista">{AYUDA[opcion]}</p>

      <div className="fila campos-movimiento">
        {opcion === 'traspaso' && (
          <>
            <span>De</span>
            <SelectorCaja valor={origen} opciones={cajasPosibles} onCambiar={setOrigen} />
            <span>a</span>
            <SelectorCaja valor={destino} opciones={cajasPosibles.filter((c) => c !== origen)} onCambiar={setDestino} />
            <Monto valor={monto} onCambiar={setMonto} />
          </>
        )}
        {opcion === 'personal' && (
          <>
            <select className="campo persona" value={personaId ?? ''} onChange={(e) => setPersonaId(Number(e.target.value) || null)}>
              <option value="">¿A quién?</option>
              {personal.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <span>De la chica</span>
            <Monto valor={deChica} onCambiar={setDeChica} placeholder="0" />
            <span>De la grande</span>
            <Monto valor={deGrande} onCambiar={setDeGrande} placeholder="0" />
          </>
        )}
        {opcion === 'aGastos' && (
          <>
            <span>De</span>
            <SelectorCaja valor={origen} opciones={['chica', 'grande']} onCambiar={setOrigen} />
            <Monto valor={monto} onCambiar={setMonto} />
          </>
        )}
        {opcion === 'gasto' && <Monto valor={monto} onCambiar={setMonto} />}
        {opcion === 'ingreso' && (
          <>
            <span>A</span>
            <SelectorCaja valor={destino} opciones={cajasPosibles} onCambiar={setDestino} />
            <Monto valor={monto} onCambiar={setMonto} />
          </>
        )}
        {opcion === 'retiro' && (
          <>
            <span>De</span>
            <SelectorCaja valor={origen} opciones={cajasPosibles} onCambiar={setOrigen} />
            <Monto valor={monto} onCambiar={setMonto} />
          </>
        )}
        <input
          className="campo motivo-mov"
          placeholder={
            opcion === 'gasto'
              ? 'En qué se gastó (ej.: hielo)'
              : opcion === 'personal'
                ? 'Detalle (opcional, ej.: jornal)'
                : opcion === 'traspaso' || opcion === 'aGastos'
                  ? 'Detalle (opcional)'
                  : 'Motivo'
          }
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && registrar()}
        />
        <button onClick={registrar}>Registrar</button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
