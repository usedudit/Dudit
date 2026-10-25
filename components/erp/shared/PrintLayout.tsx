"use client"

import { Button } from "@/components/reusable"
import { useEffect, useState } from "react"
export type PrintPaperSize = "a4" | "letter" | "thermal" | "thermal-58"

interface PrintLayoutProps {
    children: React.ReactNode
    paperSize?: PrintPaperSize
}

export default function PrintLayout({ children, paperSize = "a4" }: PrintLayoutProps) {
    const [isHeadless, setIsHeadless] = useState(false)

    useEffect(() => {
        // Remove dark mode class from html/body on print view
        if (typeof document !== "undefined") {
            document.documentElement.classList.remove("dark")
            document.body.classList.remove("dark")
        }

        const headlessDetected =
            typeof window !== "undefined" &&
            (window.location.search.includes("headless=true") ||
                (typeof navigator !== "undefined" && navigator.userAgent.includes("Headless")))

        if (headlessDetected) {
            setIsHeadless(true)
            return
        }

        let timer: NodeJS.Timeout

        const triggerPrint = () => {
            timer = setTimeout(() => {
                window.print()
            }, 600)
        }

        if (typeof document !== "undefined" && document.fonts) {
            document.fonts.ready.then(triggerPrint).catch(triggerPrint)
        } else {
            triggerPrint()
        }

        return () => {
            if (timer) clearTimeout(timer)
        }
    }, [])

    const isThermal = paperSize === "thermal"
    const isThermal58 = paperSize === "thermal-58"
    const paperWidth = isThermal58 ? "58mm" : isThermal ? "80mm" : paperSize === "letter" ? "215.9mm" : "210mm"
    const paperHeight = isThermal || isThermal58 ? "auto" : paperSize === "letter" ? "279.4mm" : "297mm"
    const pageSize = isThermal || isThermal58 ? "auto" : paperSize === "letter" ? "Letter" : "A4"
    const thermalLabel = isThermal58 ? "Recibo Térmico (58mm)" : "Recibo Térmico (80mm)"

    return (
        <div className={`bg-white text-black print:bg-white print:text-black ${isThermal ? "w-full max-w-[80mm] mx-auto min-h-0 h-auto" : isThermal58 ? "w-full max-w-[58mm] mx-auto min-h-0 h-auto" : "min-h-screen"}`}>
            <style
                dangerouslySetInnerHTML={{
                    __html: `
                        /* Global print and dark-mode override */
                        html, body, :root, .dark {
                            color-scheme: light !important;
                            background-color: #ffffff !important;
                            color: #000000 !important;
                        }

                        .sale-receipt-thermal-print,
                        .sale-receipt-thermal-print *,
                        .thermal-receipt-root,
                        .thermal-receipt-root * {
                            color: #000000 !important;
                            border-color: #000000 !important;
                            -webkit-text-fill-color: #000000 !important;
                            text-shadow: none !important;
                            opacity: 1 !important;
                        }

                        /* DRE: prevent table rows from splitting across pages (applies during Puppeteer screen-media PDF rendering) */
                        .dre-a4-print tr,
                        .dre-a4-print .break-inside-avoid,
                        .dre-a4-print thead tr,
                        .dre-a4-print tbody tr {
                            break-inside: avoid !important;
                            page-break-inside: avoid !important;
                        }

                        /* All A4 receipt print classes: prevent table row splitting */
                        .sale-receipt-a4-print tr,
                        .sale-receipt-a4-print thead tr,
                        .sale-receipt-a4-print tbody tr,
                        .quote-a4-print tr,
                        .quote-a4-print thead tr,
                        .quote-a4-print tbody tr {
                            break-inside: avoid !important;
                            page-break-inside: avoid !important;
                        }

                        @media print {
                            html, body {
                                background-color: #ffffff !important;
                                color: #000000 !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                ${isThermal58
                                    ? "width: 58mm !important; min-height: auto !important; height: auto !important; max-width: 58mm !important;"
                                    : isThermal
                                    ? "min-height: auto !important; height: auto !important; max-width: 80mm !important;"
                                    : `height: ${paperHeight} !important;`}
                            }

                            /* Hide browser-added headers and footers with valid page size */
                            @page {
                                size: ${pageSize};
                                margin: 0 !important;
                            }

                            /* Ensure backgrounds and colors are rendered in the PDF / printer */
                            * {
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }

                            .no-print {
                                display: none !important;
                            }

                            .pdf-print-container {
                                ${isThermal
                                    ? "display: block !important; width: 80mm !important; max-width: 80mm !important; margin: 0 auto !important;"
                                    : isThermal58
                                    ? "display: block !important; width: 58mm !important; max-width: 58mm !important; margin: 0 auto !important;"
                                    : ""}
                            }
                            .sale-receipt-thermal-print {
                                width: 80mm !important;
                                max-width: 80mm !important;
                                margin: 0 auto !important;
                                break-inside: avoid !important;
                                page-break-inside: avoid !important;
                                background-color: #ffffff !important;
                                color: #000000 !important;
                            }
                        }

                        /* Container styling for PDF preview & print */
                        .pdf-print-container {
                            width: 100%;
                            ${isThermal || isThermal58 ? "display: block;" : "display: flex; flex-direction: column; align-items: center;"}
                            background-color: #ffffff;
                            margin: 0 auto;
                        }

                        /* Force each page iteration to split into a new page in the PDF */
                        .pdf-print-page {
                            page-break-after: always !important;
                            break-after: page !important;
                            position: relative !important;
                            box-shadow: none !important;
                            border: none !important;
                            border-radius: 0 !important;
                        }

                        .pdf-print-page:last-child {
                            page-break-after: avoid !important;
                            break-after: avoid !important;
                        }
                    `,
                }}
            />

            {/* Top Toolbar for manual print & close (hidden in print and headless mode) */}
            {!isHeadless && (
                <div className="no-print sticky top-0 z-50 bg-dark-surface text-white px-4 py-2.5 flex items-center justify-between mb-3 text-xs font-sans">
                    <span className="font-semibold">{isThermal || isThermal58 ? thermalLabel : "Documento para Impressão"}</span>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={() => window.print()}
                        >
                            Imprimir
                        </Button>
                        <Button
                            onClick={() => window.close()}
                            variant="outline"
                        >
                            Fechar
                        </Button>
                    </div>
                </div>
            )}

            <div className="pdf-print-container">
                {children}
            </div>
        </div>
    )
}