import { useCallback, useEffect, useRef, useState } from 'react'
import { esComandable, type CambiosElemento, type Comanda, type DatosApertura, type Elemento, type EstadoMesa, type Mozo, type Salon } from '@shared/types'
import { nombreMesa } from '@shared/ticket'
import ModalApertura from '../comanda/ModalApertura'
import { confirmar } from '../components/Confirmar'
import PantallaComanda from '../comanda/PantallaComanda'
import { alinear } from './FiguraElemento'
import Paleta, { type OpcionPaleta } from './Paleta'
import PanelPropiedades from './PanelPropiedades'
import Pestanas from './Pestanas'
import Plano, { type PlanoHandle } from './Plano'

const DURACION_AVISO_MS = 4000

const NOMBRE_ESTADO: Record<EstadoMesa, string> = { libre: 'Libre', activa: 'Activa', cobrando: 'Cobrando' }

export default function PantallaPlano() {
  const [salones, setSalones] = useState<Salon[]>([])
  const [salonId, setSalonId] = useState<number | null>(null)
  const [elementos, setElementos] = useState<Elemento[] | null>(null)
  const [estados, setEstados] = useState<Record<number, EstadoMesa>>({})
  const [editando, setEditando] = useState(false)
  const [seleccionId, setSeleccionId] = useState<number | null>(null)
  const [renombrarId, setRenombrarId] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [mozos, setMozos] = useState<Mozo[]>([])
  /** Mesa libre que se está por abrir (tarjeta de mozo y comensales) */
  const [aAbrir, setAAbrir] = useState<Elemento | null>(null)
  /** Mesa cuya comanda se está mostrando */
  const [comandaDe, setComandaDe] = useState<number | null>(null)
  /** Mesa que se está pasando o uniendo a otra: se espera que se toque el destino */
  const [trasladando, setTrasladando] = useState<{ comandaId: number; elementoId: number; nombre: string } | null>(null)
  const plano = useRef<PlanoHandle>(null)

  // ---------- Carga ----------

  useEffect(() => {
    window.restix.salones.listar().then((lista) => {
      setSalones(lista)
      setSalonId(lista[0]?.id ?? null)
    })
    window.restix.mozos.listar().then(setMozos)
  }, [])

  useEffect(() => {
    if (salonId === null) return
    let vigente = true // evita mostrar datos de un salón si mientras tanto se eligió otro
    setElementos(null)
    setSeleccionId(null)
    Promise.all([window.restix.elementos.listar(salonId), window.restix.mesas.estados(salonId)]).then(
      ([lista, est]) => {
        if (!vigente) return
        setElementos(lista)
        setEstados(est)
      }
    )
    return () => {
      vigente = false
    }
  }, [salonId])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), DURACION_AVISO_MS)
    return () => clearTimeout(t)
  }, [aviso])

  // ---------- Elementos ----------

  const reemplazar = (el: Elemento) => setElementos((lista) => lista?.map((e) => (e.id === el.id ? el : e)) ?? null)

  /**
   * Cambia un elemento: se muestra al instante y se guarda en segundo plano.
   * Si la base lo rechaza, vuelve a como estaba y se muestra el motivo.
   */
  const cambiar = useCallback(
    async (id: number, cambios: CambiosElemento): Promise<boolean> => {
      const antes = elementos?.find((e) => e.id === id)
      if (!antes) return false
      reemplazar({ ...antes, ...cambios })
      const r = await window.restix.elementos.actualizar(id, cambios)
      if (r.ok) {
        reemplazar(r.dato)
        return true
      }
      reemplazar(antes)
      setAviso(r.error)
      return false
    },
    [elementos]
  )

  const agregar = async (opcion: OpcionPaleta) => {
    if (salonId === null || !elementos) return
    // En el centro de lo que se está viendo; si ya hay algo ahí, se corre en diagonal
    const centro = plano.current?.centroVista() ?? { x: 0, y: 0 }
    let x = alinear(centro.x, 20)
    let y = alinear(centro.y, 20)
    while (elementos.some((e) => e.x === x && e.y === y)) {
      x += 20
      y += 20
    }
    const r = await window.restix.elementos.crear({ salon_id: salonId, tipo: opcion.tipo, forma: opcion.forma, x, y })
    if (!r.ok) return setAviso(r.error)
    setElementos((lista) => [...(lista ?? []), r.dato])
    setSeleccionId(r.dato.id)
  }

  const duplicar = async (el: Elemento) => {
    const r = await window.restix.elementos.crear({
      salon_id: el.salon_id,
      tipo: el.tipo,
      forma: el.forma ?? undefined,
      // Mesas y barras reciben el siguiente nombre libre; los textos copian su contenido
      nombre: el.tipo === 'texto' ? (el.nombre ?? undefined) : undefined,
      x: el.x + 20,
      y: el.y + 20
    })
    if (!r.ok) return setAviso(r.error)
    const copia = await window.restix.elementos.actualizar(r.dato.id, {
      ancho: el.ancho,
      alto: el.alto,
      rotacion: el.rotacion,
      ...(el.tipo === 'mesa' ? { lugares: el.lugares } : {})
    })
    const nuevo = copia.ok ? copia.dato : r.dato
    setElementos((lista) => [...(lista ?? []), nuevo])
    setSeleccionId(nuevo.id)
  }

  const borrar = useCallback(async (id: number) => {
    // Primero se pregunta a la base: puede rechazarlo (ej. mesa con comanda en curso)
    const r = await window.restix.elementos.borrar(id)
    if (!r.ok) return setAviso(r.error)
    setElementos((lista) => lista?.filter((e) => e.id !== id) ?? null)
    setSeleccionId(null)
  }, [])

  // ---------- Salones ----------

  const agregarSalon = async () => {
    // Se numera entre los salones comunes (Pedidos Ya y Delivery no cuentan)
    const r = await window.restix.salones.crear(`Salón ${salones.filter((s) => s.tipo === 'salon').length + 1}`)
    if (!r.ok) return setAviso(r.error)
    setSalones(await window.restix.salones.listar()) // los salones comunes van antes que Pedidos Ya y Delivery
    setSalonId(r.dato.id)
    setRenombrarId(r.dato.id)
  }

  const renombrarSalon = async (id: number, nombre: string): Promise<boolean> => {
    const r = await window.restix.salones.renombrar(id, nombre)
    if (!r.ok) {
      setAviso(r.error)
      return false
    }
    setSalones((lista) => lista.map((s) => (s.id === id ? r.dato : s)))
    return true
  }

  const salon = salones.find((s) => s.id === salonId) ?? null

  const borrarSalon = async () => {
    if (!salon) return
    const cantidad = elementos?.length ?? 0
    const detalle = cantidad ? ` y los ${cantidad} elementos que tiene` : ''
    const pregunta = `¿Borrar el salón "${salon.nombre}"${detalle}? No se puede deshacer.`
    if (!(await confirmar(pregunta, { boton: 'Borrar', peligro: true }))) return
    const r = await window.restix.salones.borrar(salon.id)
    if (!r.ok) return setAviso(r.error)
    const resto = salones.filter((s) => s.id !== salon.id)
    setSalones(resto)
    setSalonId(resto[0]?.id ?? null)
  }

  // ---------- Teclado ----------

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const enCampo = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      // Con una tarjeta abierta (ej. "¿Pasar Mesa 4 a Mesa 7?") las teclas son para ella
      if (enCampo || document.querySelector('.modal-fondo')) return
      if (e.key === 'Delete' && editando && seleccionId !== null) borrar(seleccionId)
      if (e.key === 'Escape') {
        setSeleccionId(null)
        setTrasladando(null)
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [editando, seleccionId, borrar])

  // ---------- Modo servicio ----------

  // Mesas y barras: lo que se puede tocar para comandar
  const mesas = elementos?.filter((e) => esComandable(e.tipo)) ?? []
  const estadoDe = (id: number): EstadoMesa => estados[id] ?? 'libre'
  const cuenta = (estado: EstadoMesa) => mesas.filter((m) => estadoDe(m.id) === estado).length

  const recargarEstados = useCallback(() => {
    if (salonId !== null) window.restix.mesas.estados(salonId).then(setEstados)
  }, [salonId])

  /**
   * Destino elegido para pasar/unir: si está libre se pasa, si está ocupada se ofrece unir las cuentas.
   * Al terminar se abre la comanda en la mesa de destino.
   */
  const trasladarA = async (destino: Elemento) => {
    if (!trasladando) return
    if (destino.id === trasladando.elementoId) return setTrasladando(null)
    const origen = nombreMesa(trasladando.nombre)
    const hacia = nombreMesa(destino.nombre ?? '')
    const libre = estadoDe(destino.id) === 'libre'
    const pregunta = libre
      ? `¿Pasar ${origen} a ${hacia}?`
      : `${hacia} ya tiene pedidos. ¿Unir las cuentas? Todo lo de ${origen} pasa a ${hacia}.`
    if (!(await confirmar(pregunta, { boton: libre ? 'Pasar' : 'Unir' }))) return
    const r = libre
      ? await window.restix.comandas.pasar(trasladando.comandaId, destino.id)
      : await window.restix.comandas.unir(trasladando.comandaId, destino.id)
    recargarEstados()
    if (!r.ok) return setAviso(r.error)
    setTrasladando(null)
    setComandaDe(destino.id)
  }

  const empezarTraslado = useCallback((comanda: Comanda) => {
    setComandaDe(null)
    if (comanda.elemento_id !== null)
      setTrasladando({ comandaId: comanda.id, elementoId: comanda.elemento_id, nombre: comanda.mesa_nombre })
  }, [])

  /** Fuera del modo diseño: mesa libre → elegir mozo y comensales; ocupada → su comanda. */
  const tocarMesa = (id: number | null) => {
    const mesa = mesas.find((m) => m.id === id)
    if (!mesa) return
    if (trasladando) return trasladarA(mesa)
    if (estadoDe(mesa.id) === 'libre') {
      window.restix.mozos.listar().then(setMozos)
      setAAbrir(mesa)
    }
    else setComandaDe(mesa.id)
  }

  const abrirMesa = async (datos: DatosApertura) => {
    if (!aAbrir) return false
    const r = await window.restix.comandas.abrir(aAbrir.id, datos)
    if (!r.ok) {
      setAviso(r.error)
      recargarEstados() // quizás otro la abrió mientras tanto
      return false
    }
    setComandaDe(aAbrir.id)
    recargarEstados()
    return true
  }

  const volverAlPlano = useCallback(() => {
    setComandaDe(null)
    recargarEstados()
  }, [recargarEstados])

  const alternarEdicion = () => {
    setTrasladando(null)
    setEditando((v) => !v)
    setSeleccionId(null)
  }

  return (
    <div className="pantalla-plano">
      <Pestanas
        salones={salones}
        salonId={salonId}
        editando={editando}
        renombrarId={renombrarId}
        onElegir={setSalonId}
        onAgregar={agregarSalon}
        onRenombrar={renombrarSalon}
        onFinRenombrar={() => setRenombrarId(null)}
      >
        {!editando && (
          <span className="resumen-estados">
            {(['libre', 'activa', 'cobrando'] as const).map((e) => (
              <span key={e}>
                <i className={`punto estado-${e}`} />
                {cuenta(e)} {NOMBRE_ESTADO[e].toLowerCase()}
              </span>
            ))}
          </span>
        )}
        <button className={editando ? '' : 'secundario'} onClick={alternarEdicion}>
          {editando ? '✓ Salir de diseño' : '✎ Modo diseño'}
        </button>
      </Pestanas>

      <div className="plano-cuerpo">
        {/* key: al cambiar de salón el plano se crea de nuevo y se encuadra */}
        {elementos && (
          <Plano
            key={salonId}
            ref={plano}
            elementos={elementos}
            estados={estados}
            editable={editando}
            seleccionId={editando ? seleccionId : (trasladando?.elementoId ?? null)}
            onSeleccionar={editando ? setSeleccionId : tocarMesa}
            onCambiar={cambiar}
          />
        )}
        {editando && <Paleta onAgregar={agregar} />}
        {trasladando && (
          <div className="franja-traslado">
            <span>
              Tocá la mesa de destino para <strong>{nombreMesa(trasladando.nombre)}</strong> (libre: se pasa · ocupada: se
              unen las cuentas)
            </span>
            <button className="secundario" onClick={() => setTrasladando(null)}>
              Cancelar
            </button>
          </div>
        )}
        {editando && (
          <PanelPropiedades
            elemento={elementos?.find((e) => e.id === seleccionId) ?? null}
            salon={salon}
            puedeBorrarSalon={salones.filter((s) => s.tipo === 'salon').length > 1}
            onCambiar={cambiar}
            onDuplicar={duplicar}
            onBorrar={borrar}
            onRenombrarSalon={(nombre) => (salon ? renombrarSalon(salon.id, nombre) : Promise.resolve(false))}
            onBorrarSalon={borrarSalon}
          />
        )}
        {aviso && (
          <div className="aviso-flotante" role="alert">
            {aviso}
          </div>
        )}
      </div>

      {aAbrir && (
        <ModalApertura
          titulo={
            salon?.tipo === 'pedidosya'
              ? `Nuevo pedido de Pedidos Ya · ${aAbrir.nombre}`
              : salon?.tipo === 'delivery'
                ? `Nuevo delivery · ${aAbrir.nombre}`
                : `Abrir ${nombreMesa(aAbrir.nombre ?? '')}`
          }
          canal={salon?.tipo ?? 'salon'}
          boton="Abrir"
          mozos={mozos}
          onConfirmar={abrirMesa}
          onCerrar={() => setAAbrir(null)}
        />
      )}

      {/* La comanda se muestra encima del plano, que queda montado (mantiene zoom y posición) */}
      {comandaDe !== null && (
        <PantallaComanda elementoId={comandaDe} onVolver={volverAlPlano} onTrasladar={empezarTraslado} />
      )}
    </div>
  )
}
