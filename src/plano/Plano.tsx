import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Layer, Shape, Stage, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { CambiosElemento, Elemento, EstadoMesa } from '@shared/types'
import { useColoresPlano } from './colores'
import FiguraElemento from './FiguraElemento'

/** Lo que la pantalla le puede pedir al plano desde afuera. */
export interface PlanoHandle {
  /** Punto del plano que está en el centro de la pantalla (para ubicar elementos nuevos). */
  centroVista: () => { x: number; y: number }
}

interface Props {
  elementos: Elemento[]
  /** Estado de cada mesa (id → estado); las que no figuran están libres */
  estados?: Record<number, EstadoMesa>
  editable?: boolean
  /** En diseño: elemento que se edita. En servicio: mesa abierta en el panel */
  seleccionId?: number | null
  onSeleccionar?: (id: number | null) => void
  onCambiar?: (id: number, cambios: CambiosElemento) => void
  ref?: Ref<PlanoHandle>
}

/** Posición y zoom de la "cámara" sobre el plano. */
interface Vista {
  x: number
  y: number
  escala: number
}

const ZOOM_MIN = 0.25
const ZOOM_MAX = 4
const PASO_GRILLA = 20
const MARGEN_ENCUADRE = 80
const GIROS_IMAN = [0, 45, 90, 135, 180, 225, 270, 315]

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Elementos que conservan la proporción al cambiarles el tamaño. */
function mantieneProporcion(el: Elemento | undefined): boolean {
  if (!el) return false
  return (el.tipo === 'mesa' && el.forma === 'cuadrada') || el.tipo === 'planta' || el.tipo === 'columna'
}

export default function Plano({ elementos, estados = {}, editable = false, seleccionId = null, onSeleccionar, onCambiar, ref }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformador = useRef<Konva.Transformer>(null)
  const [tam, setTam] = useState({ w: 0, h: 0 })
  const [vista, setVista] = useState<Vista>({ x: 0, y: 0, escala: 1 })
  const colores = useColoresPlano()

  // El lienzo ocupa todo el espacio disponible y se adapta si cambia el tamaño de la ventana
  useEffect(() => {
    const div = contenedor.current
    if (!div) return
    const obs = new ResizeObserver(([e]) => setTam({ w: e.contentRect.width, h: e.contentRect.height }))
    obs.observe(div)
    return () => obs.disconnect()
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      centroVista: () => ({ x: (tam.w / 2 - vista.x) / vista.escala, y: (tam.h / 2 - vista.y) / vista.escala })
    }),
    [tam, vista]
  )

  /** Ajusta zoom y posición para que se vean todos los elementos. */
  const encuadrar = useCallback(() => {
    if (!tam.w || !tam.h) return
    if (!elementos.length) {
      setVista({ x: tam.w / 2, y: tam.h / 2, escala: 1 })
      return
    }
    // Lo que ocupa cada elemento ya rotado (con el radio, una pared larga "ocupaba" lo mismo a lo alto y achicaba todo)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of elementos) {
      const giro = (el.rotacion * Math.PI) / 180
      const cos = Math.abs(Math.cos(giro))
      const sen = Math.abs(Math.sin(giro))
      const medioAncho = (el.ancho * cos + el.alto * sen) / 2
      const medioAlto = (el.ancho * sen + el.alto * cos) / 2
      minX = Math.min(minX, el.x - medioAncho)
      minY = Math.min(minY, el.y - medioAlto)
      maxX = Math.max(maxX, el.x + medioAncho)
      maxY = Math.max(maxY, el.y + medioAlto)
    }
    const ancho = maxX - minX + MARGEN_ENCUADRE * 2
    const alto = maxY - minY + MARGEN_ENCUADRE * 2
    const escala = limitar(Math.min(tam.w / ancho, tam.h / alto), ZOOM_MIN, 1.5)
    setVista({
      escala,
      x: tam.w / 2 - ((minX + maxX) / 2) * escala,
      y: tam.h / 2 - ((minY + maxY) / 2) * escala
    })
  }, [tam, elementos])

  // Encuadrar una sola vez, cuando ya se conoce el tamaño del lienzo
  const encuadrado = useRef(false)
  useEffect(() => {
    if (!encuadrado.current && tam.w) {
      encuadrar()
      encuadrado.current = true
    }
  }, [tam, encuadrar])

  // Engancha el transformador (cuadraditos y giro) al elemento seleccionado
  useEffect(() => {
    const tr = transformador.current
    if (!tr) return
    const nodo = seleccionId !== null ? stageRef.current?.findOne(`#el-${seleccionId}`) : undefined
    tr.nodes(nodo ? [nodo] : [])
    tr.getLayer()?.batchDraw()
  }, [seleccionId, editable, elementos])

  /** Zoom manteniendo fijo el punto indicado (en píxeles de pantalla). */
  const zoomEn = useCallback((factor: number, px: number, py: number) => {
    setVista((v) => {
      const escala = limitar(v.escala * factor, ZOOM_MIN, ZOOM_MAX)
      const mundoX = (px - v.x) / v.escala
      const mundoY = (py - v.y) / v.escala
      return { escala, x: px - mundoX * escala, y: py - mundoY * escala }
    })
  }, [])

  const alRueda = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const p = e.target.getStage()?.getPointerPosition()
    if (p) zoomEn(e.evt.deltaY < 0 ? 1.1 : 1 / 1.1, p.x, p.y)
  }

  // Arrastrar el fondo mueve la vista (solo si se arrastra el lienzo, no un elemento)
  const alArrastrar = (e: KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage()
    if (e.target === stage) setVista((v) => ({ ...v, x: stage.x(), y: stage.y() }))
  }

  // Clic en el fondo (sin arrastrar): deseleccionar / cerrar la mesa abierta
  const alClicFondo = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage()) onSeleccionar?.(null)
  }

  const seleccionado = elementos.find((e) => e.id === seleccionId)

  return (
    <div ref={contenedor} className="plano-lienzo">
      {tam.w > 0 && (
        <Stage
          ref={stageRef}
          width={tam.w}
          height={tam.h}
          x={vista.x}
          y={vista.y}
          scaleX={vista.escala}
          scaleY={vista.escala}
          draggable
          onWheel={alRueda}
          onDragMove={alArrastrar}
          onDragEnd={alArrastrar}
          onClick={alClicFondo}
          onTap={alClicFondo}
        >
          <Layer listening={false}>
            {/* Grilla de puntos: solo se dibuja la parte visible */}
            <Shape
              sceneFunc={(ctx) => {
                const paso = vista.escala < 0.5 ? PASO_GRILLA * 2 : PASO_GRILLA
                const izq = Math.floor(-vista.x / vista.escala / paso) * paso
                const arr = Math.floor(-vista.y / vista.escala / paso) * paso
                const der = izq + tam.w / vista.escala + paso
                const aba = arr + tam.h / vista.escala + paso
                const r = 1.2 / vista.escala
                ctx.fillStyle = colores.punto
                for (let x = izq; x <= der; x += paso)
                  for (let y = arr; y <= aba; y += paso) ctx.fillRect(x - r, y - r, r * 2, r * 2)
              }}
            />
          </Layer>
          <Layer>
            {elementos.map((el) => (
              <FiguraElemento
                key={el.id}
                el={el}
                colores={colores}
                editable={editable}
                estado={editable ? 'libre' : (estados[el.id] ?? 'libre')}
                resaltada={!editable && el.id === seleccionId}
                onSeleccionar={onSeleccionar}
                onCambiar={onCambiar}
                onTocarMesa={onSeleccionar}
              />
            ))}
            {editable && (
              <Transformer
                ref={transformador}
                keepRatio={mantieneProporcion(seleccionado)}
                enabledAnchors={
                  mantieneProporcion(seleccionado)
                    ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                    : undefined
                }
                rotationSnaps={GIROS_IMAN}
                rotationSnapTolerance={8}
                borderStroke={colores.seleccion}
                anchorStroke={colores.seleccion}
                anchorFill={colores.fondo}
                anchorSize={9}
                anchorCornerRadius={2}
                flipEnabled={false}
                // No dejar achicar a menos de 10 px en pantalla
                boundBoxFunc={(viejo, nuevo) => (nuevo.width < 10 || nuevo.height < 10 ? viejo : nuevo)}
              />
            )}
          </Layer>
        </Stage>
      )}

      <div className="plano-controles">
        <button className="icono" title="Alejar" onClick={() => zoomEn(1 / 1.2, tam.w / 2, tam.h / 2)}>
          −
        </button>
        <span className="plano-zoom">{Math.round(vista.escala * 100)}%</span>
        <button className="icono" title="Acercar" onClick={() => zoomEn(1.2, tam.w / 2, tam.h / 2)}>
          +
        </button>
        <button className="secundario" onClick={encuadrar}>
          Encuadrar
        </button>
      </div>
    </div>
  )
}
