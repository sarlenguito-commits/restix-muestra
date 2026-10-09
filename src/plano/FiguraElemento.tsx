import { Arc, Circle, Group, Line, Rect, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { esComandable, type CambiosElemento, type Elemento, type EstadoMesa, type FormaMesa } from '@shared/types'
import type { ColoresPlano } from './colores'

interface Props {
  el: Elemento
  colores: ColoresPlano
  editable?: boolean
  /** Solo mesas y barras, fuera del modo diseño */
  estado?: EstadoMesa
  /** Mesa o barra abierta en el panel (modo servicio) */
  resaltada?: boolean
  onSeleccionar?: (id: number) => void
  onCambiar?: (id: number, cambios: CambiosElemento) => void
  onTocarMesa?: (id: number) => void
}

/** Relleno, borde y texto según el estado. Libre usa los colores propios (mesa o barra). */
function coloresEstado(estado: EstadoMesa, c: ColoresPlano, libre: { fondo: string; borde: string; texto: string }) {
  if (estado === 'activa') return { fondo: c.activa, borde: c.activaBorde, texto: c.activaTexto }
  if (estado === 'cobrando') return { fondo: c.cobrando, borde: c.cobrandoBorde, texto: c.cobrandoTexto }
  return libre
}

/** Imán de la grilla al mover (en unidades del plano). */
export const PASO_IMAN = 10
export const alinear = (v: number, paso = PASO_IMAN) => Math.round(v / paso) * paso

// Medidas de las sillas dibujadas alrededor de las mesas
const SILLA_LARGO = 22
const SILLA_ANCHO = 9
const SILLA_SEPARACION = 6

interface Silla {
  x: number
  y: number
  vertical: boolean
}

/** Reparte los lugares alrededor de la mesa. Coordenadas relativas al centro. */
function posicionesSillas(forma: FormaMesa, w: number, h: number, n: number): Silla[] {
  const lados = { arriba: 0, abajo: 0, izq: 0, der: 0 }
  if (forma === 'cuadrada') {
    const orden = ['arriba', 'abajo', 'izq', 'der'] as const
    for (let i = 0; i < n; i++) lados[orden[i % 4]]++
  } else {
    // Rectangular: una silla en cada punta a partir de 5 lugares, el resto en los lados largos
    const puntas = n >= 5 ? 2 : 0
    const resto = n - puntas
    const largoA = Math.ceil(resto / 2)
    const largoB = Math.floor(resto / 2)
    if (w >= h) Object.assign(lados, { arriba: largoA, abajo: largoB, izq: puntas / 2, der: puntas / 2 })
    else Object.assign(lados, { izq: largoA, der: largoB, arriba: puntas / 2, abajo: puntas / 2 })
  }

  const d = SILLA_SEPARACION + SILLA_ANCHO / 2
  const sillas: Silla[] = []
  for (let i = 0; i < lados.arriba; i++)
    sillas.push({ x: -w / 2 + (w * (i + 0.5)) / lados.arriba, y: -h / 2 - d, vertical: false })
  for (let i = 0; i < lados.abajo; i++)
    sillas.push({ x: -w / 2 + (w * (i + 0.5)) / lados.abajo, y: h / 2 + d, vertical: false })
  for (let i = 0; i < lados.izq; i++)
    sillas.push({ x: -w / 2 - d, y: -h / 2 + (h * (i + 0.5)) / lados.izq, vertical: true })
  for (let i = 0; i < lados.der; i++)
    sillas.push({ x: w / 2 + d, y: -h / 2 + (h * (i + 0.5)) / lados.der, vertical: true })
  return sillas
}

function Mesa({ el, colores, estado = 'libre', resaltada = false }: Props) {
  const { ancho: w, alto: h } = el
  const sillas = posicionesSillas(el.forma ?? 'cuadrada', w, h, el.lugares ?? 0)
  const c = coloresEstado(estado, colores, { fondo: colores.mesa, borde: colores.mesaBorde, texto: colores.mesaTexto })
  return (
    <>
      {sillas.map((s, i) => {
        const sw = s.vertical ? SILLA_ANCHO : SILLA_LARGO
        const sh = s.vertical ? SILLA_LARGO : SILLA_ANCHO
        return (
          <Rect key={i} x={s.x - sw / 2} y={s.y - sh / 2} width={sw} height={sh} cornerRadius={3} fill={colores.silla} />
        )
      })}
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        cornerRadius={6}
        fill={c.fondo}
        stroke={resaltada ? colores.seleccion : c.borde}
        strokeWidth={resaltada ? 3.5 : 1.5}
      />
      {/* El número se contra-rota para que siempre se lea derecho */}
      <Group rotation={-el.rotacion}>
        <Text
          text={el.nombre ?? ''}
          x={-50}
          y={-12}
          width={100}
          height={24}
          align="center"
          verticalAlign="middle"
          fontSize={18}
          fontStyle="bold"
          fill={c.texto}
        />
      </Group>
    </>
  )
}

function Barra({ el, colores, estado = 'libre', resaltada = false }: Props) {
  const { ancho: w, alto: h } = el
  const c = coloresEstado(estado, colores, { fondo: colores.barra, borde: colores.barra, texto: colores.barraTexto })
  const vertical = h > w
  return (
    <>
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        cornerRadius={4}
        fill={c.fondo}
        stroke={resaltada ? colores.seleccion : c.borde}
        strokeWidth={resaltada ? 3.5 : 1.5}
      />
      {/* En una barra vertical el nombre se escribe a lo largo (girado desde la esquina inferior izquierda) */}
      <Text
        text={(el.nombre ?? 'Barra').toUpperCase()}
        x={-w / 2}
        y={vertical ? h / 2 : -h / 2}
        width={vertical ? h : w}
        height={vertical ? w : h}
        rotation={vertical ? -90 : 0}
        align="center"
        verticalAlign="middle"
        fontSize={13}
        fontStyle="bold"
        letterSpacing={3}
        fill={c.texto}
      />
    </>
  )
}

function Decoracion({ el, colores }: Props) {
  const { ancho: w, alto: h } = el
  switch (el.tipo) {
    case 'pared':
      return <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={colores.pared} />
    case 'columna':
      return <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={colores.columna} />
    case 'puerta':
      // Hueco en la pared + hoja abierta + recorrido de apertura
      return (
        <>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={colores.fondo} stroke={colores.puerta} strokeWidth={1} />
          <Line points={[-w / 2, 0, -w / 2, -w]} stroke={colores.puerta} strokeWidth={2} />
          <Arc
            x={-w / 2}
            y={0}
            innerRadius={w}
            outerRadius={w}
            angle={90}
            rotation={-90}
            stroke={colores.puerta}
            strokeWidth={1}
            dash={[4, 4]}
          />
        </>
      )
    case 'planta': {
      const r = Math.min(w, h) / 2
      return (
        <>
          <Circle radius={r} fill={colores.planta} />
          <Circle radius={r * 0.55} fill={colores.plantaHoja} />
        </>
      )
    }
    case 'texto':
      return (
        <Text
          text={el.nombre ?? ''}
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          align="center"
          verticalAlign="middle"
          fontSize={16}
          fill={colores.texto}
        />
      )
    default:
      return null
  }
}

function cursor(e: KonvaEventObject<MouseEvent>, valor: string) {
  const stage = e.target.getStage()
  if (stage) stage.container().style.cursor = valor
}

const normalizarGrados = (g: number) => ((Math.round(g) % 360) + 360) % 360

export default function FiguraElemento(props: Props) {
  const { el, editable = false, onSeleccionar, onCambiar, onTocarMesa } = props
  const comandable = esComandable(el.tipo)
  // Fuera del modo diseño solo mesas y barras responden al mouse; la decoración se ignora
  const interactivo = editable || comandable

  const alTocar = () => {
    if (editable) onSeleccionar?.(el.id)
    else if (comandable) onTocarMesa?.(el.id)
  }

  // Al soltar los cuadraditos del transformador: Konva estiró el grupo con "escala";
  // se convierte en ancho/alto reales y se vuelve la escala a 1
  const alTransformar = (e: KonvaEventObject<Event>) => {
    const nodo = e.target
    const sx = nodo.scaleX()
    const sy = nodo.scaleY()
    nodo.scaleX(1)
    nodo.scaleY(1)
    let ancho = Math.max(10, alinear(el.ancho * sx, 5))
    let alto = Math.max(10, alinear(el.alto * sy, 5))
    if (el.tipo === 'mesa' && el.forma === 'cuadrada') ancho = alto = Math.max(ancho, alto)
    onCambiar?.(el.id, { x: alinear(nodo.x()), y: alinear(nodo.y()), rotacion: normalizarGrados(nodo.rotation()), ancho, alto })
  }

  return (
    <Group
      id={`el-${el.id}`}
      x={el.x}
      y={el.y}
      rotation={el.rotacion}
      draggable={editable}
      listening={interactivo}
      // En diseño se selecciona al apretar (para poder arrastrar enseguida);
      // en servicio se abre la mesa al soltar, así arrastrar el plano no abre mesas
      onMouseDown={() => editable && alTocar()}
      onClick={() => !editable && alTocar()}
      onTap={alTocar}
      onDragMove={(e) => e.target.position({ x: alinear(e.target.x()), y: alinear(e.target.y()) })}
      onDragEnd={(e) => onCambiar?.(el.id, { x: e.target.x(), y: e.target.y() })}
      onTransformEnd={alTransformar}
      onMouseEnter={(e) => cursor(e, editable ? 'move' : 'pointer')}
      onMouseLeave={(e) => cursor(e, '')}
    >
      {el.tipo === 'mesa' ? <Mesa {...props} /> : el.tipo === 'barra' ? <Barra {...props} /> : <Decoracion {...props} />}
    </Group>
  )
}
