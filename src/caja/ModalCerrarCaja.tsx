import { useState } from 'react'
import type { ResumenTurno } from '@shared/types'
import Modal from '../components/Modal'
import { formatearPrecio, leerPrecio } from '../formato'
import { Diferencia } from './ResumenCaja'

interface Props {
  resumen: ResumenTurno
  onCerrar: () => void
  onCerrado: (r: ResumenTurno) => void
}

function Conteo(props: { titulo: string; esperado: number; valor: string; onCambiar: (v: string) => void; autoFocus?: boolean }) {
  const centavos = leerPrecio(props.valor)
  return (
    <div className="conteo-caja">
      <div className="renglon-importe">
        <strong>{props.titulo}</strong>
        <span className="ayuda-lista">debería haber {formatearPrecio(props.esperado)}</span>
      </div>
      <div className="fila">
        <span>Contado</span>
        <div className="campo-precio grande">
          <span>$</span>
          <input
            className="campo"
            autoFocus={props.autoFocus}
            inputMode="decimal"
            value={props.valor}
            onChange={(e) => props.onCambiar(e.target.value)}
          />
        </div>
        {centavos !== null && <Diferencia valor={centavos - props.esperado} />}
      </div>
    </div>
  )
}

/** Arqueo: se cuenta la caja chica y la grande por separado, cada una con su diferencia. */
export default function ModalCerrarCaja({ resumen, onCerrar, onCerrado }: Props) {
  const [chica, setChica] = useState('')
  const [grande, setGrande] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const contadoChica = leerPrecio(chica)
  const contadoGrande = leerPrecio(grande)

  const cerrar = async () => {
    if (contadoChica === null || contadoGrande === null) return setError('Cargá lo contado en las dos cajas.')
    const r = await window.restix.caja.cerrar(contadoChica, contadoGrande, nota)
    if (!r.ok) return setError(r.error)
    onCerrado(r.dato)
  }

  return (
    <Modal
      titulo="Cerrar caja"
      onCerrar={onCerrar}
      ancho={520}
      pie={
        <>
          {error && <p className="error">{error}</p>}
          <button className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button onClick={cerrar} disabled={contadoChica === null || contadoGrande === null}>
            Cerrar caja
          </button>
        </>
      }
    >
      {resumen.mesasAbiertas > 0 && (
        <p className="aviso">
          ⚠ {resumen.mesasAbiertas === 1 ? 'Hay 1 mesa abierta' : `Hay ${resumen.mesasAbiertas} mesas abiertas`}: se van a cobrar
          en el turno siguiente.
        </p>
      )}
      <Conteo titulo="Caja chica" esperado={resumen.cajas.chica.esperado} valor={chica} onCambiar={setChica} autoFocus />
      <Conteo titulo="Caja grande" esperado={resumen.cajas.grande.esperado} valor={grande} onCambiar={setGrande} />
      <p className="ayuda-lista">
        La caja chica pasa al próximo turno con lo contado. La caja de gastos ({formatearPrecio(resumen.gastosSaldo)}) no se cuenta:
        sigue como está.
      </p>
      <div className="campo-grupo">
        <label>Nota (opcional)</label>
        <input className="campo" placeholder="Ej.: faltó un billete de $10" value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
    </Modal>
  )
}
