import type { CambiosElemento, Elemento, Salon, TipoElemento } from '@shared/types'
import { CampoNumero, CampoTexto } from '../components/Campos'

const NOMBRES: Record<TipoElemento, string> = {
  mesa: 'Mesa',
  pared: 'Pared',
  barra: 'Barra',
  puerta: 'Puerta',
  columna: 'Columna',
  planta: 'Planta',
  texto: 'Texto'
}

/** Tamaño al cambiar la forma de una mesa */
const TAMANIO_FORMA = { cuadrada: { ancho: 80, alto: 80 }, rectangular: { ancho: 140, alto: 80 } }

interface Props {
  elemento: Elemento | null
  salon: Salon | null
  puedeBorrarSalon: boolean
  onCambiar: (id: number, cambios: CambiosElemento) => Promise<boolean>
  onDuplicar: (el: Elemento) => void
  onBorrar: (id: number) => void
  onRenombrarSalon: (nombre: string) => Promise<boolean>
  onBorrarSalon: () => void
}

export default function PanelPropiedades(props: Props) {
  const { elemento: el, onCambiar } = props

  if (!el) {
    return (
      <aside className="panel">
        <h3>Salón</h3>
        {props.salon && (
          <div className="campo-grupo">
            <label>Nombre</label>
            <CampoTexto valor={props.salon.nombre} onGuardar={props.onRenombrarSalon} />
          </div>
        )}
        <div className="ayuda-lista">
          <p>Tocá un elemento para editarlo.</p>
          <p>Arrastralo para moverlo; los cuadraditos cambian el tamaño y el círculo lo gira.</p>
          <p>
            <kbd>Supr</kbd> borra · <kbd>Esc</kbd> deselecciona
          </p>
          <p>Doble clic en una pestaña para renombrar el salón.</p>
        </div>
        {/* Las pestañas Pedidos Ya y Delivery no se borran */}
        {props.salon?.tipo === 'salon' && (
          <div className="panel-pie">
            <button
              className="peligro"
              disabled={!props.puedeBorrarSalon}
              onClick={props.onBorrarSalon}
              title={props.puedeBorrarSalon ? '' : 'Tiene que quedar al menos un salón'}
            >
              Borrar salón
            </button>
          </div>
        )}
      </aside>
    )
  }

  const cambiar = (cambios: CambiosElemento) => onCambiar(el.id, cambios)
  const girar = (grados: number) => cambiar({ rotacion: (((el.rotacion + grados) % 360) + 360) % 360 })

  return (
    <aside className="panel">
      <h3>{el.tipo === 'mesa' ? `Mesa ${el.nombre}` : el.tipo === 'barra' ? el.nombre : NOMBRES[el.tipo]}</h3>

      {el.tipo === 'mesa' && (
        <>
          <div className="campo-grupo">
            <label>Nombre o número</label>
            <CampoTexto valor={el.nombre ?? ''} onGuardar={(nombre) => cambiar({ nombre })} />
          </div>
          <div className="campo-grupo">
            <label>Lugares</label>
            <div className="contador">
              <button className="icono" disabled={(el.lugares ?? 1) <= 1} onClick={() => cambiar({ lugares: (el.lugares ?? 1) - 1 })}>
                −
              </button>
              <span>{el.lugares}</span>
              <button className="icono" disabled={(el.lugares ?? 1) >= 20} onClick={() => cambiar({ lugares: (el.lugares ?? 1) + 1 })}>
                +
              </button>
            </div>
          </div>
          <div className="campo-grupo">
            <label>Forma</label>
            <div className="segmentado">
              {(['cuadrada', 'rectangular'] as const).map((forma) => (
                <button
                  key={forma}
                  className={el.forma === forma ? 'activo' : ''}
                  onClick={() => el.forma !== forma && cambiar({ forma, ...TAMANIO_FORMA[forma] })}
                >
                  {forma === 'cuadrada' ? 'Cuadrada' : 'Rectangular'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {el.tipo === 'barra' && (
        <div className="campo-grupo">
          <label>Nombre (se comanda como una mesa)</label>
          <CampoTexto valor={el.nombre ?? ''} onGuardar={(nombre) => cambiar({ nombre })} />
        </div>
      )}

      {el.tipo === 'texto' && (
        <div className="campo-grupo">
          <label>Texto</label>
          <CampoTexto valor={el.nombre ?? ''} onGuardar={(nombre) => cambiar({ nombre })} />
        </div>
      )}

      <div className="campo-grupo">
        <label>Tamaño (ancho × alto)</label>
        <div className="fila">
          <CampoNumero
            valor={el.ancho}
            min={10}
            max={2000}
            onGuardar={(ancho) => cambiar(el.tipo === 'mesa' && el.forma === 'cuadrada' ? { ancho, alto: ancho } : { ancho })}
          />
          <span>×</span>
          <CampoNumero
            valor={el.alto}
            min={5}
            max={2000}
            onGuardar={(alto) => cambiar(el.tipo === 'mesa' && el.forma === 'cuadrada' ? { ancho: alto, alto } : { alto })}
          />
        </div>
      </div>

      <div className="campo-grupo">
        <label>Rotación: {el.rotacion}°</label>
        <div className="fila">
          <button className="secundario" onClick={() => girar(-90)}>
            ↺ 90°
          </button>
          <button className="secundario" onClick={() => girar(90)}>
            ↻ 90°
          </button>
        </div>
      </div>

      <div className="panel-pie">
        <button className="secundario" onClick={() => props.onDuplicar(el)}>
          Duplicar
        </button>
        <button className="peligro" onClick={() => props.onBorrar(el.id)}>
          Borrar
        </button>
      </div>
    </aside>
  )
}
