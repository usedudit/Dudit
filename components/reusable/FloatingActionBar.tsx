import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/reusable"
import Portal from "@/components/Portal"
import { X, Settings2Icon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import BottomSheet from "@/components/BottomSheet"

interface FloatingActionBarProps {
  selectedCount: number
  onClearSelection: () => void
  children?: React.ReactNode // Aqui entram seus botões personalizados
}

const FloatingActionBar: React.FC<FloatingActionBarProps> = ({
  selectedCount,
  onClearSelection,
  children
}) => {
  const isMobile = useMediaQuery("(max-width: 767px)")
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  // Se o sheet abrir, a barra flutuante deve sumir para não sobrepor
  const showBar = selectedCount > 0 && !isSheetOpen

  return (
    <>
      <AnimatePresence>
        {showBar && (
          <Portal>
            <motion.div
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] 
                        flex items-center gap-2 pl-5 pr-2 py-1.5 rounded-full shadow-lg shadow-black/5
                        bg-white border border-brand-border text-brand-dark
                        dark:bg-dark-surface dark:border-dark-border dark:text-dark-heading"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold whitespace-nowrap">
                  {selectedCount} <span className="hidden sm:inline">selecionado(s)</span>
                </span>

                {isMobile && (
                  <div className="h-5 w-px bg-brand-border dark:bg-dark-border mx-1" />
                )}
              </div>

              {!isMobile ? (
                <>
                  {/* Divisória Inicial Desktop */}
                  <div className="h-5 w-px bg-brand-border dark:bg-dark-border mx-1" />

                  {/* Área dinâmica para botões (passados pelo pai) */}
                  <div className="flex items-center gap-1">
                    {children}
                  </div>
                </>
              ) : (
                <Button
                  variant="ghost"
                  className="h-9 px-3 gap-2 font-bold text-brand-primary"
                  onClick={() => setIsSheetOpen(true)}
                >
                  <Settings2Icon className="w-4 h-4" />
                  Ações
                </Button>
              )}

              {/* Divisória Final */}
              <div className="h-5 w-px bg-brand-border dark:bg-dark-border mx-1" />

              {/* Botão Fechar (X) - Sempre presente */}
              <Button
                variant="ghost"
                onClick={onClearSelection}
                className="ml-1 h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border"
              >
                <X className="w-5 h-5" />
              </Button>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>

      <BottomSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title="Ações em Massa"
      >
        <div className="flex flex-col gap-2 py-2">
          {React.Children.map(children, (child) => {
            if (!child || !React.isValidElement(child)) return null;
            // Se for um botão, vamos garantir que ele feche o sheet ao ser clicado
            return React.cloneElement(child as React.ReactElement<any>, {
              onClick: (e: any) => {
                const originalOnClick = (child as any).props.onClick;
                if (originalOnClick) originalOnClick(e);
                setIsSheetOpen(false);
              },
              // No mobile as opções do bottomsheet ficam melhores em linha cheia
              className: `${(child as any).props.className || ""} !w-full !justify-start !h-12 !px-4 !text-[15px]`
            });
          })}
        </div>
      </BottomSheet>
    </>
  )
}

export default FloatingActionBar
