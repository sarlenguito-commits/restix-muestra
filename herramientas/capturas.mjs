// Saca las capturas del README (docs/capturas/*.png) con Chrome invisible, manejado por CDP.
// Prende su propio servidor de Vite, arranca con los datos de muestra limpios y recorre las pantallas.
// Cómo se corre (con Chrome instalado):  node herramientas/capturas.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const RAIZ = join(import.meta.dirname, '..')
const SALIDA = join(RAIZ, 'docs', 'capturas')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PUERTO_CHROME = 9500 + Math.floor(Math.random() * 300)
const ANCHO = 1280
const ALTO = 800
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const servidor = await createServer({ root: RAIZ, server: { port: 5190 + Math.floor(Math.random() * 50) }, logLevel: 'error' })
await servidor.listen()
const url = servidor.resolvedUrls.local[0]

const perfil = mkdtempSync(join(tmpdir(), 'restix-capturas-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PUERTO_CHROME}`, `--user-data-dir=${perfil}`, '--no-first-run', 'about:blank'], {
  stdio: 'ignore'
})

try {
  let lista
  for (let i = 0; i < 40 && !lista; i++) {
    try {
      lista = await (await fetch(`http://127.0.0.1:${PUERTO_CHROME}/json/list`)).json()
    } catch {
      await esperar(250)
    }
  }
  const ws = new WebSocket(lista.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pendientes = new Map()
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pendientes.has(d.id)) {
      pendientes.get(d.id)(d)
      pendientes.delete(d.id)
    }
  }
  const cdp = (method, params = {}) =>
    new Promise((r) => {
      pendientes.set(++id, r)
      ws.send(JSON.stringify({ id, method, params }))
    })
  /** Corre JavaScript en la página y devuelve el resultado */
  const js = async (codigo) => (await cdp('Runtime.evaluate', { expression: codigo, awaitPromise: true, returnByValue: true })).result?.result?.value
  const tocar = (texto) => js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(texto)}))?.click()`)
  /** Toca una mesa del plano (es un canvas de Konva: se busca dónde quedó dibujado su nombre) */
  const tocarMesa = async (nombre) => {
    const punto = await js(`(() => {
      const t = Konva.stages[0].find('Text').find((n) => n.text() === ${JSON.stringify(nombre)})
      const r = t.getClientRect()
      const c = Konva.stages[0].container().getBoundingClientRect()
      return { x: c.left + r.x + r.width / 2, y: c.top + r.y + r.height / 2 }
    })()`)
    for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: punto.x, y: punto.y, button: 'left', clickCount: 1 })
  }
  const capturar = async (nombre) => {
    await esperar(600)
    const { result } = await cdp('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(SALIDA, `${nombre}.png`), Buffer.from(result.data, 'base64'))
    console.log(`OK · ${nombre}.png`)
  }

  mkdirSync(SALIDA, { recursive: true })
  await cdp('Emulation.setDeviceMetricsOverride', { width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: false })
  // Sin animaciones: la captura sale con todo en su lugar
  await cdp('Page.navigate', { url })
  await esperar(2500)
  await js(`localStorage.clear(); location.reload()`)
  await esperar(2500)
  await js(`document.head.insertAdjacentHTML('beforeend', '<style>*{transition:none!important;animation:none!important}</style>')`)

  await tocar('Encuadrar')
  await capturar('plano')

  await tocarMesa('2')
  await capturar('comanda')

  await tocar('← Plano')
  await esperar(500)
  await tocarMesa('5')
  await esperar(500)
  await tocar('Cobrar')
  await esperar(500)
  await tocar('Por ítems')
  await capturar('cobro-por-items')
  await js(`document.querySelector('.modal button[aria-label], .modal .cerrar, dialog button')?.click()`)
  await cdp('Page.reload')
  await esperar(2500)

  for (const [boton, archivo] of [
    ['Cocina', 'cocina'],
    ['Caja', 'caja'],
    ['Resúmenes', 'resumenes'],
    ['Stock', 'stock']
  ]) {
    await tocar(boton)
    await capturar(archivo)
  }
} finally {
  chrome.kill()
  await servidor.close()
  await esperar(500)
  try {
    rmSync(perfil, { recursive: true, force: true })
  } catch {
    // Chrome a veces tarda en soltar la carpeta: queda en la carpeta temporal de Windows
  }
}
