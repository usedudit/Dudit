"use client"

import { useEffect } from "react"
import type { PaperSize } from "@/lib/labels/presets"

interface PrintLayoutProps {
    children: React.ReactNode
    paperSize?: PaperSize
}

export default function PrintLayout({ children, paperSize = "a4" }: PrintLayoutProps) {
    useEffect(() => {
        const timer = setTimeout(() => {
            window.print()
        }, 500)

        const handleAfterPrint = () => {
            window.close()
        }
        window.addEventListener("afterprint", handleAfterPrint)

        return () => {
            clearTimeout(timer)
            window.removeEventListener("afterprint", handleAfterPrint)
        }
    }, [])

    const paperWidth = paperSize === "letter" ? "215.9mm" : "210mm"
    const paperHeight = paperSize === "letter" ? "279.4mm" : "297mm"
    const pageSize = paperSize === "letter" ? "Letter" : "A4"

    return (
        <div className="min-h-screen bg-white text-black print:bg-white print:text-black">
            <style
                dangerouslySetInnerHTML={{
                    __html: `
                        /* Global print overrides */
                        @media print {
                            html, body {
                                background-color: #ffffff !important;
                                color: #000000 !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                width: ${paperWidth} !important;
                                height: ${paperHeight} !important;
                            }
                            
                            /* Hide browser-added headers and footers */
                            @page {
                                size: ${pageSize};
                                margin: 0 !important;
                            }

                            /* Ensure backgrounds and colors are rendered in the PDF */
                            * {
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }

                            .no-print {
                                display: none !important;
                            }
                        }

                        /* Container styling for PDF preview & print */
                        .pdf-print-container {
                            width: 100%;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            background-color: #ffffff;
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
            <div className="pdf-print-container">
                {children}
            </div>
        </div>
    )
}