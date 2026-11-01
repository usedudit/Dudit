"use client";

import React, { useEffect, useRef, useState } from "react";
import Portal from "@/components/Portal";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { useModalLayer, useBodyScrollLock } from "@/lib/modal-stack";
import { useSwipeToDismiss } from "@/hooks/use-swipe-to-dismiss";

interface BottomSheetProps {
    children: React.ReactNode;
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    /** Optional guard function - if returns false, close is prevented (e.g., during entrance animation) */
    closeGuard?: () => boolean;
    /** Time in ms to wait after opening before allowing swipe-to-dismiss/backdrop-close. Default 500ms. */
    settleMs?: number;
}

const BottomSheet: React.FC<BottomSheetProps> = ({
    children,
    isOpen,
    onClose,
    title,
    closeGuard,
    settleMs = 500
}) => {

    const sheetRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const [windowHeight, setWindowHeight] = useState(() =>
        typeof window !== "undefined" ? window.innerHeight : 800
    );

    // y=0 → sheet colada no bottom, visível por completo
    // y=windowHeight → sheet fora da tela (embaixo)
    const y = useMotionValue(windowHeight);

    // z-index dinâmico: esta sheet fica acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen);

    // Trava o scroll do body só enquanto houver sheet aberta (compartilhado
    // entre várias: fechar uma não destrava a outra que ainda está aberta).
    useBodyScrollLock(isOpen);

    useEffect(() => {
        setWindowHeight(window.innerHeight);
    }, []);

    const handleClose = () => {
        if (closeGuard && !closeGuard()) return;
        onClose();
    };

    // Arrastar pelo handle para fechar (gesto nativo de bottom sheet).
    const swipe = useSwipeToDismiss({ y, onDismiss: handleClose, armKey: isOpen, settleMs });

    return (
        <Portal>
            <AnimatePresence>

                {isOpen && (
                    <motion.div
                        className="fixed inset-0 z-[100] flex items-end pointer-events-none"
                        style={{ zIndex }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >

                        {/* Overlay (backdrop click-to-close) */}
                        <motion.div
                            className="absolute inset-0 bg-black/60 pointer-events-auto"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.6 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={handleClose}
                        />

                        {/* Sheet */}
                        <motion.div
                            ref={sheetRef}
                            style={{ y }}
                            initial={{ y: windowHeight }}
                            animate={{ y: 0 }}
                            exit={{ y: windowHeight }}
                            transition={{
                                type: "spring",
                                stiffness: 260,
                                damping: 30
                            }}
                            {...swipe.layerProps}
                            className="relative w-full bg-white dark:bg-dark-background rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh] pointer-events-auto"
                        >

                            {/* Handle - só aqui inicia o arrasto, o conteúdo rola normal */}
                            <div
                                {...swipe.handleProps}
                                className="shrink-0 p-4 cursor-grab active:cursor-grab select-none touch-none"
                            >

                                <div className="w-10 h-1.5 bg-gray-300 dark:bg-dark-border rounded-full mx-auto mb-3" />

                                {title && (
                                    <h2 className="text-lg font-bold text-center">
                                        {title}
                                    </h2>
                                )}

                            </div>

                            {/* Conteúdo scrollável - overflow-y-auto cuida do resto */}
                            <div
                                ref={contentRef}
                                // onPointerDown para o evento aqui não subir até a sheet
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 overflow-y-auto px-4 pb-6 custom-scrollbar"
                                style={{ overscrollBehavior: "contain" }}
                            >
                                {children}
                            </div>

                        </motion.div>

                    </motion.div>
                )}

            </AnimatePresence>
        </Portal>
    );
};

export default BottomSheet;
