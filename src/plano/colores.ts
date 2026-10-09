import { useEffect, useState } from 'react'

/**
 * El canvas no entiende variables CSS: se leen los valores de styles.css
 * y se vuelven a leer cada vez que cambia el tema.
 */
const VARIABLES = {
  punto: '--plano-punto',
  mesa: '--plano-mesa',
  mesaBorde: '--plano-mesa-borde',
  mesaTexto: '--plano-mesa-texto',
  silla: '--plano-silla',
  pared: '--plano-pared',
  barra: '--plano-barra',
  barraTexto: '--plano-barra-texto',
  puerta: '--plano-puerta',
  columna: '--plano-columna',
  planta: '--plano-planta',
  plantaHoja: '--plano-planta-hoja',
  texto: '--plano-texto',
  fondo: '--plano-fondo',
  seleccion: '--primario',
  activa: '--mesa-activa',
  activaBorde: '--mesa-activa-borde',
  activaTexto: '--mesa-activa-texto',
  cobrando: '--mesa-cobrando',
  cobrandoBorde: '--mesa-cobrando-borde',
  cobrandoTexto: '--mesa-cobrando-texto'
} as const

export type ColoresPlano = Record<keyof typeof VARIABLES, string>

function leerColores(): ColoresPlano {
  const estilos = getComputedStyle(document.documentElement)
  const colores = {} as ColoresPlano
  for (const [clave, variable] of Object.entries(VARIABLES)) {
    colores[clave as keyof ColoresPlano] = estilos.getPropertyValue(variable).trim()
  }
  return colores
}

export function useColoresPlano(): ColoresPlano {
  const [colores, setColores] = useState(leerColores)
  useEffect(() => {
    const actualizar = () => setColores(leerColores())
    window.addEventListener('tema-cambiado', actualizar)
    return () => window.removeEventListener('tema-cambiado', actualizar)
  }, [])
  return colores
}
