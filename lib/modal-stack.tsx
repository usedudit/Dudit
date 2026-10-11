"use client"

import * as React from "react"

/**
 * Pilha global de camadas (modais, bottom sheets, popovers, dropdowns...).
 *
 * Problema que resolve: cada camada usava um z-index estático na classe Tailwind
 * (z-50, z-[60], z-[100], z-[110], z-[130]...). Se um modal A estava aberto e o
 * usuário abria um modal B com z-index menor, o B ficava escondido atrás do A.
 *
 * Solução: toda camada que abre se registra aqui e recebe um z-index dinâmico,
 * sempre maior que o de todas as camadas que já estavam abertas. A última
 * camada a abrir fica sempre por cima - na ordem de abertura, nunca o contrário.
 *
 * Uso:
 *   const zIndex = useModalLayer(isOpen)        // componente tem prop isOpen/open
 *   const zIndex = useMountedModalLayer()       // só renderiza quando aberto
 *   <div style={{ zIndex }} ... />              // aplica no overlay e no conteúdo
 */

/**
 * Base da pilha: acima do chrome fixo da página (header z-100/z-110, sidebar
 * z-120, barras z-100) e dentro da faixa que os modais já usavam hoje
 * (z-[110]..z-[120]), para não mudar a relação com o resto da UI.
 * Fica abaixo dos popovers/dropdowns (z-130/z-150/z-9999), que precisam poder
 * abrir POR CIMA de um modal (ex.: DatePicker dentro de um formulário modal).
 */
export const LAYER_BASE_Z = 120

const LAYER_Z_STEP = 1

type Subscriber = () => void

let nextLayerId = 1
const openLayers: number[] = []
const refCounts = new Map<number, number>()
const subscribers = new Set<Subscriber>()

function notify() {
  subscribers.forEach((subscriber) => subscriber())
}

function subscribe(subscriber: Subscriber) {
  subscribers.add(subscriber)
  return () => {
    subscribers.delete(subscriber)
  }
}

function retain(layerId: number) {
  const count = refCounts.get(layerId) ?? 0
  refCounts.set(layerId, count + 1)
  if (count === 0) {
    openLayers.push(layerId)
    notify()
  }
}

function release(layerId: number) {
  const count = refCounts.get(layerId) ?? 0
  if (count > 1) {
    refCounts.set(layerId, count - 1)
    return
  }
  refCounts.delete(layerId)
  const index = openLayers.indexOf(layerId)
  if (index !== -1) {
    openLayers.splice(index, 1)
    notify()
  }
}

function zIndexOf(layerId: number) {
  const index = openLayers.indexOf(layerId)
  return index === -1 ? LAYER_BASE_Z : LAYER_BASE_Z + (index + 1) * LAYER_Z_STEP
}

// Layout effect no cliente (aplica antes do paint, sem "pisca" do z-index),
// effect no servidor (no-op) para não avisar em SSR.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

function useNewLayerId(): number {
  const ref = React.useRef<number | null>(null)
  if (ref.current === null) ref.current = nextLayerId++
  return ref.current
}

function useLayerStack(layerId: number, active: boolean): number | undefined {
  const [zIndex, setZIndex] = React.useState<number | undefined>(undefined)

  useIsomorphicLayoutEffect(() => {
    if (!active) {
      setZIndex(undefined)
      return
    }

    retain(layerId)
    const unsubscribe = subscribe(() => setZIndex(zIndexOf(layerId)))
    setZIndex(zIndexOf(layerId))

    return () => {
      unsubscribe()
      release(layerId)
    }
  }, [layerId, active])

  // Camada fechada: não sobrescreve o z-index da classe (mantém o comportamento atual).
  return active ? zIndex : undefined
}

/**
 * Camada controlada por uma prop de abertura (isOpen/open/isAnimating...).
 * Enquanto estiver aberta, fica acima de todas as camadas anteriores.
 */
export function useModalLayer(isOpen: boolean): number | undefined {
  const layerId = useNewLayerId()
  return useLayerStack(layerId, isOpen)
}

/**
 * Camada que fica registrada enquanto o componente estiver montado.
 * Use quando o componente só é renderizado enquanto está aberto
 * (ex.: `{isOpen && <Modal />}` dentro de um AnimatePresence).
 */
export function useMountedModalLayer(): number | undefined {
  const layerId = useNewLayerId()
  return useLayerStack(layerId, true)
}

/**
 * Trava o scroll do body enquanto houver pelo menos uma camada aberta.
 * Usa contador: fechar uma modal/sheet não destrava o scroll enquanto outra
 * ainda estiver aberta.
 */
let scrollLockCount = 0

export function useBodyScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active || typeof document === "undefined") return

    scrollLockCount += 1
    const body = document.body
    const previousOverflow = body.style.overflow
    body.style.overflow = "hidden"

    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1)
      if (scrollLockCount === 0) {
        body.style.overflow = previousOverflow
      }
    }
  }, [active])
}

const ModalLayerContext = React.createContext<number | null>(null)

/**
 * Fornece um id de camada compartilhado para os filhos. Use no Root de um
 * componente Radix: overlay e conteúdo registram o MESMO id, então os dois
 * recebem o mesmo z-index (o conteúdo fica acima do overlay pela ordem no DOM).
 */
export function ModalLayerProvider({ children }: { children: React.ReactNode }) {
  const layerId = useNewLayerId()
  return <ModalLayerContext.Provider value={layerId}>{children}</ModalLayerContext.Provider>
}

/**
 * Camada compartilhada com o provider mais próximo (se houver); caso contrário,
 * cria uma camada própria. Registrada enquanto o componente estiver montado.
 */
export function useSharedModalLayer(): number | undefined {
  const contextLayerId = React.useContext(ModalLayerContext)
  const ownLayerId = useNewLayerId()
  return useLayerStack(contextLayerId ?? ownLayerId, true)
}
