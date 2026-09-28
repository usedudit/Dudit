"use client"

import * as React from "react"
import { animate, useDragControls, type DragControls, type MotionValue, type PanInfo } from "framer-motion"

interface UseSwipeToDismissOptions {
    /** Motion value de `y` vinculado ao estilo da sheet. */
    y: MotionValue<number>
    /** Chamado quando o gesto deve fechar a sheet. */
    onDismiss: () => void
    /** Distância (px) arrastada para baixo que fecha a sheet. */
    threshold?: number
    /** Velocidade (px/s) para baixo que fecha mesmo com pouco arrasto. */
    velocityThreshold?: number
    /** Limite (px) que a sheet pode descer seguindo o dedo. */
    maxDrag?: number
    /**
     * Ignora o gesto logo após a abertura, enquanto a animação de entrada roda
     * (arrastar nesse meio tempo faz o `animate` da entrada brigar com o drag).
     */
    settleMs?: number
    /**
     * Muda a cada abertura (ex.: `isOpen`): reinicia a janela de "assentamento".
     * Necessário quando o componente que usa o hook fica montado o tempo todo.
     */
    armKey?: unknown
    onDragStart?: () => void
    onDragComplete?: () => void
}

export interface SwipeToDismiss {
    /** Spread no elemento arrastável (motion.div da sheet). */
    layerProps: {
        drag: "y"
        dragListener: false
        dragControls: DragControls
        dragConstraints: { top: number; bottom: number }
        dragElastic: { top: number; bottom: number }
        dragMomentum: false
        onDragStart: () => void
        onDragEnd: (_event: unknown, info: PanInfo) => void
    }
    /** Spread na área de arrasto (handle/cabeçalho da sheet). */
    handleProps: {
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
        style: React.CSSProperties
        role: "button"
        tabIndex: number
        "aria-label": string
    }
}

/**
 * Gesto de arrastar para fechar bottom sheets, igual às sheets nativas.
 *
 * O drag só começa na área do handle (dragListener: false + dragControls), então
 * o conteúdo continua rolando normalmente com o dedo (o framer só aplica
 * `touch-action` quando o listener do drag está ligado no elemento inteiro).
 */
export function useSwipeToDismiss({
    y,
    onDismiss,
    threshold = 100,
    velocityThreshold = 700,
    maxDrag,
    settleMs = 500,
    armKey,
    onDragStart,
    onDragComplete,
}: UseSwipeToDismissOptions): SwipeToDismiss {
    const controls = useDragControls()
    const mountedAtRef = React.useRef<number>(Date.now())
    const draggingRef = React.useRef(false)

    // Rearma a janela de assentamento toda vez que a camada (re)abre.
    React.useEffect(() => {
        mountedAtRef.current = Date.now()
    }, [armKey])

    const [dragLimit, setDragLimit] = React.useState(
        () => maxDrag ?? (typeof window !== "undefined" ? Math.round(window.innerHeight * 0.5) : 400)
    )

    React.useEffect(() => {
        if (maxDrag !== undefined) return
        const update = () => setDragLimit(Math.round(window.innerHeight * 0.5))
        update()
        window.addEventListener("resize", update)
        return () => window.removeEventListener("resize", update)
    }, [maxDrag])

    const handlePointerDown = React.useCallback(
        (event: React.PointerEvent<HTMLElement>) => {
            if (Date.now() - mountedAtRef.current < settleMs) return
            draggingRef.current = true
            onDragStart?.()
            controls.start(event)
        },
        [controls, onDragStart, settleMs]
    )

    const layerProps = React.useMemo(
        () => ({
            drag: "y" as const,
            dragListener: false as const,
            dragControls: controls,
            dragConstraints: { top: 0, bottom: maxDrag ?? dragLimit },
            // Resistência sutil tentando arrastar para cima; segue o dedo ao descer.
            dragElastic: { top: 0.05, bottom: 0.6 },
            dragMomentum: false as const,
            onDragStart: () => {
                draggingRef.current = true
            },
            onDragEnd: (_event: unknown, info: PanInfo) => {
                draggingRef.current = false
                onDragComplete?.()

                const distance = info.offset.y
                const velocity = info.velocity.y

                // Fecha se arrastou o suficiente para baixo ou com velocidade alta.
                if (distance > threshold || (distance > 10 && velocity > velocityThreshold)) {
                    onDismiss()
                    return
                }

                // Volta para a posição de repouso (y=0 = totalmente visível).
                animate(y, 0, { type: "spring", stiffness: 300, damping: 35 })
            },
        }),
        [controls, dragLimit, maxDrag, onDismiss, onDragComplete, onDragStart, threshold, velocityThreshold, y]
    )

    const handleProps = React.useMemo(
        () => ({
            onPointerDown: handlePointerDown,
            // Teclado: Enter/Espaço fecha a sheet (mesmo gesto do mouse).
            onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                onDismiss()
            },
            // O navegador não deve roubar o gesto do handle.
            style: { touchAction: "none" as const, userSelect: "none" as const },
            role: "button" as const,
            tabIndex: 0,
            "aria-label": "Arrastar para fechar",
        }),
        [handlePointerDown, onDismiss]
    )

    return { layerProps, handleProps }
}
