"use client";

import React, { useEffect, useRef, useState } from "react";
import Portal from "@/components/Portal";
import {
    motion,
    AnimatePresence,
    useMotionValue,
    useTransform,
    animate
} from "framer-motion";

interface BottomSheetProps {
    children: React.ReactNode;
    isOpen: boolean;
    onClose: () => void;
    title?: string;
}

const BottomSheet: React.FC<BottomSheetProps> = ({
    children,
    isOpen,
    onClose,
    title
}) => {

    const sheetRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const [windowHeight, setWindowHeight] = useState(800);
    const [isMounted, setIsMounted] = useState(false);

    // y=0 → sheet colada no bottom, visível por completo
    // y=windowHeight → sheet fora da tela (embaixo)
    const y = useMotionValue(windowHeight);

    const overlayOpacity = useTransform(y, [0, windowHeight], [0.6, 0]);

    useEffect(() => {
        setWindowHeight(window.innerHeight);
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }

        return () => {
            document.body.style.overflow = "auto";
        };
    }, [isOpen]);

    const handleDragEnd = (_: any, info: any) => {
        const currentY = y.get();

        // Fecha se arrastou mais de 120px pra baixo OU velocidade alta
        if (currentY > 120 || info.velocity.y > 500) {
            onClose();
        } else {
            // Volta pro topo (y=0 = totalmente visível)
            animate(y, 0, {
                type: "spring",
                stiffness: 300,
                damping: 35
            });
        }
    };

    return (
        <Portal>
            <AnimatePresence>

                {isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end pointer-events-none">

                        {/* Overlay */}
                        <motion.div
                            className="absolute inset-0 bg-black pointer-events-auto"
                            style={{ opacity: overlayOpacity }}
                            onClick={onClose}
                        />

                        {/* Sheet */}
                        {isMounted && (
                            <motion.div
                                ref={sheetRef}
                                style={{ y }}
                                drag="y"
                                // Impede arrastar pra cima (y negativo) - o scroll interno cuida disso
                                // Permite arrastar pra baixo livremente para fechar
                                dragConstraints={{ top: 0, bottom: 0 }}
                                dragElastic={{ top: 0.05, bottom: 0.8 }}
                                onDragEnd={handleDragEnd}
                                initial={{ y: windowHeight }}
                                animate={{ y: 0 }}
                                exit={{ y: windowHeight }}
                                transition={{
                                    type: "spring",
                                    stiffness: 260,
                                    damping: 30
                                }}
                                className="relative w-full bg-white dark:bg-dark-background rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh] pointer-events-auto"
                            >

                                {/* Handle - área de drag, não permite scroll aqui */}
                                <div className="shrink-0 p-4 cursor-grab active:cursor-grabbing">

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
                                    // onPointerDown para o evento aqui pra não competir com o drag da sheet
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="flex-1 overflow-y-auto px-4 pb-6"
                                    style={{ overscrollBehavior: "contain" }}
                                >
                                    {children}
                                </div>

                            </motion.div>
                        )}

                    </div>
                )}

            </AnimatePresence>
        </Portal>
    );
};

export default BottomSheet;