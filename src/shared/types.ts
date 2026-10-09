export type Tema = 'oscuro' | 'claro'

// ---------- Plano de mesas ----------

export type TipoElemento = 'mesa' | 'pared' | 'barra' | 'puerta' | 'columna' | 'planta' | 'texto'

export type FormaMesa = 'cuadrada' | 'rectangular'

/** Mesas y barras se comandan: se tocan en el plano, tienen estado y nombre único entre ellas. */
export const esComandable = (tipo: TipoElemento): boolean => tipo === 'mesa' || tipo === 'barra'

/** libre: sin comanda · activa: comanda abierta · cobrando: se imprimió el ticket de cuenta */
export type EstadoMesa = 'libre' | 'activa' | 'cobrando'

/** salon: mesas del local · pedidosya / delivery: pestañas especiales para pedidos de afuera */
export type TipoSalon = 'salon' | 'pedidosya' | 'delivery'

/** Por dónde entró la comanda (según el tipo de pestaña donde está la mesa) */
export type Canal = TipoSalon

export interface Salon {
  id: number
  nombre: string
  orden: number
  tipo: TipoSalon
}

export interface Elemento {
  id: number
  salon_id: number
  tipo: TipoElemento
  /** Solo mesas */
  forma: FormaMesa | null
  /** Nombre de la mesa o barra (único entre ellas), o contenido de un texto */
  nombre: string | null
  /** Solo mesas: cantidad de personas */
  lugares: number | null
  /** Posición del CENTRO del elemento en el plano (así rota sobre sí mismo) */
  x: number
  y: number
  ancho: number
  alto: number
  /** Grados */
  rotacion: number
  capa: number
}

/** Datos para crear un elemento: lo que no se indica lo completa el proceso principal. */
export interface NuevoElemento {
  salon_id: number
  tipo: TipoElemento
  forma?: FormaMesa
  nombre?: string
  x: number
  y: number
}

/** Campos que se pueden modificar de un elemento existente. */
export type CambiosElemento = Partial<
  Pick<Elemento, 'forma' | 'nombre' | 'lugares' | 'x' | 'y' | 'ancho' | 'alto' | 'rotacion' | 'capa'>
>

// ---------- Ítems ----------

/** Dónde se prepara (a qué impresora va la comanda) */
export type Destino = 'cocina' | 'barra'

export interface Categoria {
  id: number
  nombre: string
  orden: number
}

export interface Producto {
  id: number
  categoria_id: number
  nombre: string
  /** En CENTAVOS: $9.000 = 900000 */
  precio: number
  destino: Destino
  /** Inactivo = fuera de la carta (no se puede comandar), pero se conserva el historial */
  activo: boolean
  orden: number
}

export interface NuevoProducto {
  categoria_id: number
  nombre: string
  precio: number
  destino?: Destino
}

export type CambiosProducto = Partial<Pick<Producto, 'categoria_id' | 'nombre' | 'precio' | 'destino' | 'activo'>>

// ---------- Stock ----------

/** Unidades base: u (unidades), g (gramos), ml (mililitros). Siempre se guarda en estas. */
export type Unidad = 'u' | 'g' | 'ml'

export interface Insumo {
  id: number
  nombre: string
  unidad: Unidad
  stock: number
  stock_minimo: number
}

export interface NuevoInsumo {
  nombre: string
  unidad: Unidad
  stock_minimo: number
  stock_inicial?: number
}

export type CambiosInsumo = Partial<Pick<Insumo, 'nombre' | 'stock_minimo'>>

/** Un renglón de receta: cuánto de un insumo consume una unidad del producto */
export interface ItemReceta {
  insumo_id: number
  cantidad: number
}

export interface ItemRecetaDetalle extends ItemReceta {
  nombre: string
  unidad: Unidad
}

export type MotivoMovimiento = 'inicial' | 'ingreso' | 'venta' | 'ajuste'

export interface MovimientoStock {
  id: number
  insumo_id: number
  /** Positivo entra, negativo sale */
  cantidad: number
  motivo: MotivoMovimiento
  nota: string | null
  fecha: string
}

// ---------- Comandas ----------

export type RolPersonal = 'mozo' | 'cocina' | 'barra' | 'otro'

export const ROLES: RolPersonal[] = ['mozo', 'cocina', 'barra', 'otro']

export const NOMBRE_ROL: Record<RolPersonal, string> = { mozo: 'Mozo', cocina: 'Cocina', barra: 'Barra', otro: 'Otro' }

/** Una persona del personal (el nombre "Mozo" quedó de cuando solo había mozos) */
export interface Mozo {
  id: number
  nombre: string
  rol: RolPersonal
  activo: boolean
}

export type CambiosPersonal = { nombre?: string; activo?: boolean; rol?: RolPersonal }

/** abierta = verde · cobrando = rojo (cuenta impresa) · cerrada = pagada · unida = sus ítems pasaron a otra mesa */
export type EstadoComanda = 'abierta' | 'cobrando' | 'cerrada' | 'unida'

/** pendiente = cargado sin enviar · enviado = salió a cocina/barra (descontó stock) · anulado */
export type EstadoItem = 'pendiente' | 'enviado' | 'anulado'

export interface ComandaItem {
  id: number
  comanda_id: number
  producto_id: number
  /** Copia del nombre y precio (centavos) al momento de pedirlo */
  nombre: string
  precio: number
  cantidad: number
  nota: string | null
  destino: Destino
  estado: EstadoItem
  /** Número de envío dentro de la comanda (lo que salió junto) */
  envio: number | null
  creado_en: string
  enviado_en: string | null
  anulado_motivo: string | null
  stock_devuelto: boolean | null
  /** Cocina: cuándo se tocó "✓ En mesa" / "✓ Entregado" (null = todavía en cocina) */
  entregado_en: string | null
  /** Unidades que tenía al enviarse (para devolver al stock lo mismo que se descontó). null: enviado antes de la v0.2 */
  cantidad_enviada: number | null
}

/** Pestaña Cocina: lo que salió junto en un envío (solo los platos de cocina) */
export interface EnvioCocina {
  comanda_id: number
  envio: number
  canal: Canal
  mesa_nombre: string
  pedido_ref: string | null
  cliente_nombre: string | null
  enviado_en: string
  entregado_en: string | null
  items: { id: number; nombre: string; cantidad: number; nota: string | null }[]
}

export interface Comanda {
  id: number
  elemento_id: number | null
  mesa_nombre: string
  mozo_id: number | null
  mozo_nombre: string | null
  comensales: number | null
  estado: EstadoComanda
  abierta_en: string
  cuenta_impresa_en: string | null
  cerrada_en: string | null
  items: ComandaItem[]
  /** Suma de los ítems no anulados, en centavos */
  total: number
  canal: Canal
  /** Pedidos Ya: número de pedido de la app */
  pedido_ref: string | null
  /** Delivery: datos del cliente */
  cliente_nombre: string | null
  cliente_direccion: string | null
  cliente_telefono: string | null
}

/** Al abrir una mesa: mozo y comensales (salón), n.º de pedido (Pedidos Ya) o datos del cliente (Delivery) */
export interface DatosApertura {
  mozo_id: number | null
  comensales: number | null
  pedido_ref?: string | null
  cliente_nombre?: string | null
  cliente_direccion?: string | null
  cliente_telefono?: string | null
}

/** Lo que sale junto a cocina y/o barra al tocar "Enviar" */
export interface Envio {
  comanda: Comanda
  numero: number
  items: ComandaItem[]
  /** Insumos que quedaron en cero o negativo después de descontar */
  alertasStock: string[]
}

// ---------- Cobros y caja ----------

export type MedioPago = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'pedidosya'

export const MEDIOS_PAGO: MedioPago[] = ['efectivo', 'transferencia', 'debito', 'credito', 'pedidosya']

/** Los que se ofrecen al cobrar una mesa del salón (Pedidos Ya se usa en los pedidos de delivery) */
export const MEDIOS_SALON: MedioPago[] = ['efectivo', 'transferencia', 'debito', 'credito']

export const NOMBRE_MEDIO: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  pedidosya: 'Pedidos Ya online'
}

export interface Pago {
  medio: MedioPago
  /** Lo que se aplica a la cuenta, en centavos */
  monto: number
  /** Solo efectivo: con cuánto pagó (vuelto = recibido - monto) */
  recibido: number | null
}

/** Una parte de un ítem dentro de una cuenta (cantidad puede ser ½ si se compartió) */
export interface ParteItem {
  comanda_item_id: number
  nombre: string
  precio: number
  cantidad: number
  importe: number
}

export type TipoDescuento = 'porcentaje' | 'monto'

export interface Cuenta {
  id: number
  comanda_id: number
  nombre: string
  /** true = cuenta separada con ítems asignados; false = toda la mesa */
  por_items: boolean
  estado: 'pendiente' | 'cobrada'
  descuento_tipo: TipoDescuento | null
  /** porcentaje: 0 a 100 · monto: centavos */
  descuento_valor: number | null
  descuento_motivo: string | null
  items: ParteItem[]
  subtotal: number
  descuento: number
  total: number
  pagos: Pago[]
  cobrada_en: string | null
}

/** Ranking de productos de un mes (Resúmenes) */
export interface ProductosDelMes {
  /** Del más al menos vendido. importe: precio de lista × cantidad (antes de descuentos) */
  vendidos: { nombre: string; cantidad: number; importe: number }[]
  /** Productos en carta que no se vendieron en el mes */
  sinVentas: string[]
}

/** Un cobro del turno (para la lista de Caja y para corregir sus medios de pago) */
export interface CobroDelTurno {
  cuenta_id: number
  comanda_id: number
  canal: Canal
  mesa_nombre: string
  pedido_ref: string | null
  cliente_nombre: string | null
  /** Nombre de la cuenta si la mesa se dividió ("Cuenta 2"); null si se cobró todo junto */
  cuenta: string | null
  total: number
  cobrada_en: string
  pagos: Pago[]
  /** Cuántas veces se corrigieron sus medios de pago */
  correcciones: number
}

export interface TurnoCaja {
  id: number
  estado: 'abierto' | 'cerrado'
  abierto_en: string
  efectivo_inicial: number
  cerrado_en: string | null
  efectivo_contado: number | null
  nota_cierre: string | null
}

/** Todo lo necesario para la ventana de cobro de una mesa */
export interface EstadoCobro {
  comanda: Comanda
  cuentas: Cuenta[]
  /** Partes de ítems que todavía no se asignaron a ninguna cuenta (solo si está dividida por ítems) */
  sinAsignar: ParteItem[]
  turno: TurnoCaja | null
}

/** chica: fondo para cambio (pasa al turno siguiente) · grande: ventas en efectivo · gastos: fondo aparte que sigue */
export type Caja = 'chica' | 'grande' | 'gastos'

export const NOMBRE_CAJA: Record<Caja, string> = { chica: 'Caja chica', grande: 'Caja grande', gastos: 'Caja de gastos' }

export type TipoMovimiento = 'ingreso' | 'retiro' | 'traspaso' | 'pago_personal' | 'gasto'

export const NOMBRE_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ingreso: 'Ingreso',
  retiro: 'Retiro',
  traspaso: 'Traspaso',
  pago_personal: 'Pago al personal',
  gasto: 'Gasto'
}

/** Saca plata de una caja (origen) y/o la pone en otra (destino) */
export interface MovimientoCaja {
  id: number
  turno_id: number | null
  tipo: TipoMovimiento
  caja_origen: Caja | null
  caja_destino: Caja | null
  monto: number
  motivo: string | null
  persona_id: number | null
  persona: string | null
  /** Mismo número = partes de un mismo pago (ej. al personal, de la chica y de la grande) */
  grupo: number | null
  fecha: string
}

/** Ingreso, retiro, traspaso o gasto (los pagos al personal van por PagoPersonal) */
export interface NuevoMovimiento {
  tipo: 'ingreso' | 'retiro' | 'traspaso' | 'gasto'
  origen?: Caja
  destino?: Caja
  monto: number
  motivo?: string
}

/** Un pago a una persona del personal, que puede salir en partes de la chica y de la grande */
export interface PagoPersonal {
  persona_id: number
  deChica: number
  deGrande: number
  motivo?: string
}

export interface EstadoCajaTurno {
  esperado: number
  contado: number | null
  /** contado - esperado (solo al cerrar) */
  diferencia: number | null
}

export interface ResumenTurno {
  turno: TurnoCaja
  /** Suma de los totales cobrados (ya con descuentos) */
  ventas: number
  descuentos: number
  cuentasCobradas: number
  porMedio: Record<MedioPago, number>
  porMozo: { mozo: string; total: number; cuentas: number }[]
  /** Pedidos Ya del turno: cobrado online (por la app) y en efectivo, y la comisión estimada con el % de Ajustes */
  pedidosYa: { online: number; efectivo: number; porcentaje: number; comision: number }
  movimientos: MovimientoCaja[]
  /** Chica: inicial + entradas − salidas · Grande: ventas en efectivo + entradas − salidas */
  cajas: { chica: EstadoCajaTurno; grande: EstadoCajaTurno }
  /** Saldo actual de la caja de gastos (fondo que sigue de turno en turno) */
  gastosSaldo: number
  /** Pagos al personal del turno, por persona, con el desglose por caja */
  pagosPersonal: { persona: string; total: number; deChica: number; deGrande: number }[]
  /** Efectivo que debe quedar entre la chica y la grande */
  efectivoEsperado: number
  /** Diferencia total del arqueo (chica + grande), solo si se cerró */
  diferencia: number | null
  /** Mesas que siguen abiertas en este momento, y cuánto suman todavía sin cobrar */
  mesasAbiertas: number
  enMesasAbiertas: number
  /** Cuántas veces se corrigieron medios de pago de cobros de este turno */
  correcciones: number
}

/** Respuesta de una operación que puede fallar por un dato del usuario. */
export type Resultado<T> = { ok: true; dato: T } | { ok: false; error: string }
