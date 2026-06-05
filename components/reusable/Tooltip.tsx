import React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

interface TooltipProps {
    text: React.ReactNode
    children: React.ReactNode
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children }) => (
    <TooltipPrimitive.Provider delayDuration={100}>
        <TooltipPrimitive.Root>
            <TooltipPrimitive.Trigger asChild>
                {children}
            </TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                    side="top"
                    align="center"
                    sideOffset={8}
                    className="z-[9999] bg-dark-surface dark:bg-white text-white dark:text-brand-dark rounded-xl p-3 text-xs shadow-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 max-w-[min(100vw-32px,320px)] select-none"
                >
                    {text}
                    <TooltipPrimitive.Arrow className="fill-dark-surface dark:fill-white z-[9999] size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
                </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
)

