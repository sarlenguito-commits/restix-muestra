import { useEffect, useMemo, useState } from 'react'
import type { Categoria, Comanda, ComandaItem, Mozo, Producto, Resultado } from '@shared/types'
import { etiquetaComanda, ticketCuenta, ticketEnvio, ticketsAnulacion, type Ticket } from '@shared/ticket'
import { formatearPrecio } from '../formato'
import { imprimirDirecto } from '../impresion'
import ModalCobro from './cobro/ModalCobro'
import GrillaProductos from './GrillaProductos'
import ModalAnular from './ModalAnular'
import ModalAnularPedido from './ModalAnularPedido'
import { avisarCocina } from '../cocina/PantallaCocina'
import { confirmar } from '../components/Confirmar'
import { pedirPin } from '../components/ModalPin'
import ModalApertura from './ModalApertura'
import ModalTickets from './ModalTickets'
import Pedido, { hora } from './Pedido'

const DURACION_AVISO_MS = 5000

interface Aviso {
  texto: string
  tipo: 'info' | 'alerta'
}

interface Props {
  elementoId: number
  onVolver: () => void
  /** Pasar o unir con otra mesa: se vuelve al plano para elegir el destino */
  onTrasladar: (comanda: Comanda) => void
}

/** Minutos desde que se abrió la mesa ("hace 12 min"). */
function hace(fecha: string): string {
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(fecha.replace(' ', 'T')).getTime()) / 60000))
  if (minutos < 60) return `hace ${minutos} min`
  return `hace ${Math.floor(minutos / 60)} h ${minutos % 60} min`
}

export default function PantallaComanda({ elementoId, onVolver, onTrasladar }: Props) {
  const [comanda, setComanda] = useState<Comanda | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [mozos, setMozos] = useState<Mozo[]>([])
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [anulando, setAnulando] = useState<ComandaItem | null>(null)
  const [editandoApertura, setEditandoApertura] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  /** PIN de ADMIN ya verificado para anular la mesa o pedido entero (null: no se está anulando) */
  const [anulandoPedido, setAnulandoPedido] = useState<string | null>(null)
  /** Vista previa de tickets. alCerrar: qué hacer después (ej. volver al plano si la mesa quedó libre) */
  const [tickets, setTickets] = useState<{ titulo: string; tickets: Ticket[]; error?: string | null; alCerrar?: () => void } | null>(
    null
  )
  const [cobrando, setCobrando] = useState(false)
  const [, setReloj] = useState(0)

  useEffect(() => {
    Promise.all([
      window.restix.comandas.enCurso(elementoId),
      window.restix.categorias.listar(),
      window.restix.productos.listar(),
      window.restix.mozos.listar()
    ]).then(([c, cats, prods, ms]) => {
      if (!c) return onVolver() // La mesa se cerró mientras tanto
      setComanda(c)
      setCategorias(cats)
      setProductos(prods.filter((p) => p.activo))
      setMozos(ms)
    })
  }, [elementoId, onVolver])

  // Actualiza el "hace X min" cada minuto
  useEffect(() => {
    const t = setInterval(() => setReloj((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), DURACION_AVISO_MS)
    return () => clearTimeout(t)
  }, [aviso])

  /** Aplica el resultado de una operación: comanda nueva o aviso con el motivo. */
  async function aplicar(promesa: Promise<Resultado<Comanda>>): Promise<boolean> {
    const r = await promesa
    if (r.ok) setComanda(r.dato)
    else setAviso({ texto: r.error, tipo: 'alerta' })
    avisarCocina()
    // Ej.: se anuló lo último que faltaba cobrar de una mesa dividida: la mesa ya quedó libre
    if (r.ok && r.dato.estado === 'cerrada') onVolver()
    return r.ok
  }

  const enPedido = useMemo(() => {
    const cantidades: Record<number, number> = {}
    for (const i of comanda?.items ?? [])
      if (i.estado !== 'anulado') cantidades[i.producto_id] = (cantidades[i.producto_id] ?? 0) + i.cantidad
    return cantidades
  }, [comanda])

  if (!comanda) return <div className="cargando">Cargando…</div>

  const pendientes = comanda.items.filter((i) => i.estado === 'pendiente')
  const cantidadPendiente = pendientes.reduce((s, i) => s + i.cantidad, 0)
  // Sin nada enviado vigente (o todo lo enviado se anuló) la mesa se cancela sin PIN
  const nadaEnviado = !comanda.items.some((i) => i.estado === 'enviado')
  const c = window.restix.comandas

  /** Tickets de cocina y barra de un envío (nuevo o para reimprimir). */
  const ticketsEnvio = (envio: { comanda: Comanda; numero: number; items: ComandaItem[] }) =>
    (['cocina', 'barra'] as const)
      .map((d) => ticketEnvio(envio.comanda, envio.numero, envio.items, d))
      .filter((t): t is Ticket => t !== null)

  /**
   * Imprime directo lo que tiene impresora elegida (Ajustes) y avisa; lo que no, va a la vista previa como antes.
   * Si una impresora falló (ej. apagada), su ticket aparece en la vista previa con el motivo.
   */
  const imprimirOMostrar = async (lista: Ticket[], titulo: string, hecho: string, alCerrar?: () => void): Promise<boolean> => {
    const { impresos, pendientes, error } = await imprimirDirecto(lista)
    if (impresos.length && !error) setAviso({ texto: `🖨 ${hecho}: ${impresos.map((t) => t.titulo.toLowerCase()).join(' y ')}`, tipo: 'info' })
    if (error) setAviso({ texto: `⚠ ${error} Revisá la impresora o elegí otra.`, tipo: 'alerta' })
    if (pendientes.length) setTickets({ titulo, tickets: pendientes, error, alCerrar })
    else alCerrar?.()
    return !error
  }

  /** Anula una parte de un ítem enviado y avisa a cocina/barra con el ticket "ANULADO". */
  const anularItem = async (item: ComandaItem, cantidad: number, motivo: string, devolver: boolean): Promise<boolean> => {
    const r = await c.anularItem(item.id, cantidad, motivo, devolver)
    avisarCocina()
    if (!r.ok) {
      setAviso({ texto: r.error, tipo: 'alerta' })
      return false
    }
    setComanda(r.dato)
    // Si con esto la mesa quedó libre (lo demás ya estaba cobrado), se vuelve al plano después del ticket
    const volver = r.dato.estado === 'cerrada' ? onVolver : undefined
    const lista = ticketsAnulacion(r.dato, [{ ...item, cantidad }], motivo)
    if (lista.length) await imprimirOMostrar(lista, 'Anulación', 'Anulación impresa', volver)
    else volver?.()
    return true
  }

  const enviar = async () => {
    const r = await c.enviar(comanda.id)
    if (!r.ok) return setAviso({ texto: r.error, tipo: 'alerta' })
    setComanda(r.dato.comanda)
    avisarCocina()
    const impresoBien = await imprimirOMostrar(ticketsEnvio(r.dato), `Envío ${r.dato.numero} enviado`, `Envío ${r.dato.numero} impreso`)
    // La falta de stock se avisa igual (si la impresora también falló, ese aviso tiene prioridad)
    if (impresoBien && r.dato.alertasStock.length)
      setAviso({ texto: `⚠ Sin stock: ${r.dato.alertasStock.join(', ')}. Revisá o ingresá mercadería.`, tipo: 'alerta' })
  }

  // Reimprimir es a pedido: se muestra la vista previa (su botón Imprimir usa la impresora elegida)
  const reimprimirEnvio = async (numero: number) => {
    const r = await c.verEnvio(comanda.id, numero)
    if (!r.ok) return setAviso({ texto: r.error, tipo: 'alerta' })
    setTickets({ titulo: `Reimprimir envío ${numero}`, tickets: ticketsEnvio(r.dato) })
  }

  const imprimirCuenta = async () => {
    const r = await c.imprimirCuenta(comanda.id)
    if (!r.ok) return setAviso({ texto: r.error, tipo: 'alerta' })
    setComanda(r.dato)
    const local = await window.restix.local.ver()
    await imprimirOMostrar([ticketCuenta(r.dato, local)], 'Cuenta', 'Cuenta impresa')
  }

  const cancelar = async () => {
    setMenuAbierto(false)
    const pregunta = `¿Cancelar ${etiquetaComanda(comanda)}? Se borra el pedido sin enviar.`
    if (!(await confirmar(pregunta, { boton: 'Cancelar el pedido', peligro: true }))) return
    const r = await c.cancelar(comanda.id)
    if (r.ok) onVolver()
    else setAviso({ texto: r.error, tipo: 'alerta' })
  }

  const hayEnviado = comanda.items.some((i) => i.estado === 'enviado')

  const terminarCobro = async (liberada: boolean) => {
    setCobrando(false)
    if (liberada) return onVolver()
    // Cobro parcial (cuentas separadas) o cancelado: se relee la comanda
    const actual = await c.enCurso(elementoId)
    if (actual) setComanda(actual)
    else onVolver()
  }

  return (
    <div className="pantalla-comanda">
      <header className="comanda-encabezado">
        <button className="secundario" onClick={onVolver}>
          ← Plano
        </button>
        <button className="datos-mesa" onClick={() => setEditandoApertura(true)} title="Cambiar los datos">
          <strong>{etiquetaComanda(comanda)}</strong>
          {comanda.canal === 'salon' && (
            <>
              <span>{comanda.mozo_nombre ?? 'Sin mozo'}</span>
              <span>{comanda.comensales ? `${comanda.comensales} comensales` : 'Comensales —'}</span>
            </>
          )}
          {comanda.canal === 'delivery' && (
            <>
              {comanda.cliente_direccion && <span>{comanda.cliente_direccion}</span>}
              {comanda.cliente_telefono && <span>Tel. {comanda.cliente_telefono}</span>}
            </>
          )}
          {comanda.canal !== 'salon' && <span className="tenue">{comanda.mesa_nombre}</span>}
          <span className="tenue">abierta {hace(comanda.abierta_en)}</span>
          <span className="lapiz">✎</span>
        </button>
        {comanda.estado === 'cobrando' && (
          <span className="insignia estado-cobrando">Cuenta impresa {hora(comanda.cuenta_impresa_en)}</span>
        )}
      </header>

      <div className="comanda-cuerpo">
        <GrillaProductos
          categorias={categorias}
          productos={productos}
          enPedido={enPedido}
          onAgregar={(id) => aplicar(c.agregar(comanda.id, id))}
        />

        <aside className="pedido">
          <h3>Pedido</h3>
          <Pedido
            comanda={comanda}
            onCantidad={(i, cantidad) => aplicar(c.cambiarItem(i.id, { cantidad }))}
            onNota={(i, nota) => aplicar(c.cambiarItem(i.id, { nota }))}
            onQuitar={(i) => aplicar(c.quitarItem(i.id))}
            onAnular={setAnulando}
            onReimprimir={reimprimirEnvio}
          />

          <footer className="pedido-pie">
            <div className="total">
              <span>Total</span>
              <strong>{formatearPrecio(comanda.total)}</strong>
            </div>
            <div className="acciones-pedido">
              <div className="menu-mas">
                <button className="icono" title="Más opciones" onClick={() => setMenuAbierto((v) => !v)}>
                  ⋯
                </button>
                {menuAbierto && (
                  <div className="menu-desplegable">
                    <button onClick={() => onTrasladar(comanda)}>Pasar a otra mesa…</button>
                    <button onClick={() => onTrasladar(comanda)}>Unir con otra mesa…</button>
                    {!nadaEnviado ? (
                      <button
                        onClick={async () => {
                          setMenuAbierto(false)
                          setAnulandoPedido(await pedirPin(`anular ${etiquetaComanda(comanda)}`))
                        }}
                      >
                        {comanda.canal === 'salon' ? 'Anular mesa…' : 'Anular pedido…'}
                      </button>
                    ) : (
                      <button disabled={!nadaEnviado} onClick={cancelar}>
                        {comanda.canal === 'salon' ? 'Cancelar mesa' : 'Cancelar pedido'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button className="secundario" onClick={imprimirCuenta}>
                {comanda.estado === 'cobrando' ? 'Reimprimir cuenta' : 'Imprimir cuenta'}
              </button>
              {cantidadPendiente > 0 || !hayEnviado ? (
                <button className="enviar" disabled={!cantidadPendiente} onClick={enviar}>
                  Enviar{cantidadPendiente ? ` (${cantidadPendiente})` : ''}
                </button>
              ) : (
                <button className="enviar cobrar" onClick={() => setCobrando(true)}>
                  Cobrar {formatearPrecio(comanda.total)}
                </button>
              )}
            </div>
          </footer>
        </aside>
      </div>

      {anulando && (
        <ModalAnular
          item={anulando}
          onConfirmar={(cantidad, motivo, devolver) => anularItem(anulando, cantidad, motivo, devolver)}
          onCerrar={() => setAnulando(null)}
        />
      )}

      {anulandoPedido && (
        <ModalAnularPedido
          etiqueta={etiquetaComanda(comanda)}
          esMesa={comanda.canal === 'salon'}
          onConfirmar={async (motivo, devolver) => {
            const enviados = comanda.items.filter((i) => i.estado === 'enviado')
            const r = await c.anularPedido(comanda.id, motivo, devolver, anulandoPedido)
            avisarCocina()
            if (!r.ok) {
              setAviso({ texto: r.error, tipo: 'alerta' })
              return false
            }
            // Cocina y barra se enteran de que no sigan preparando; después se vuelve al plano
            const lista = ticketsAnulacion(comanda, enviados, motivo)
            if (lista.length) await imprimirOMostrar(lista, 'Anulación', 'Anulación impresa', onVolver)
            else onVolver()
            return true
          }}
          onCerrar={() => setAnulandoPedido(null)}
        />
      )}

      {editandoApertura && (
        <ModalApertura
          titulo={comanda.canal === 'salon' ? `${comanda.mesa_nombre}: mozo y comensales` : etiquetaComanda(comanda)}
          boton="Guardar"
          canal={comanda.canal}
          mozos={mozos}
          inicial={{
            mozo_id: comanda.mozo_id,
            comensales: comanda.comensales,
            pedido_ref: comanda.pedido_ref,
            cliente_nombre: comanda.cliente_nombre,
            cliente_direccion: comanda.cliente_direccion,
            cliente_telefono: comanda.cliente_telefono
          }}
          onConfirmar={(datos) => aplicar(c.actualizarApertura(comanda.id, datos))}
          onCerrar={() => setEditandoApertura(false)}
        />
      )}

      {cobrando && <ModalCobro comanda={comanda} onCerrar={terminarCobro} />}

      {tickets && (
        <ModalTickets
          titulo={tickets.titulo}
          tickets={tickets.tickets}
          errorInicial={tickets.error}
          onCerrar={() => {
            setTickets(null)
            tickets.alCerrar?.()
          }}
        />
      )}

      {aviso && (
        <div className={`aviso-flotante ${aviso.tipo}`} role="alert">
          {aviso.texto}
        </div>
      )}
    </div>
  )
}
