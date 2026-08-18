"use client"

import { useEffect } from "react"
export type PrintPaperSize = "a4" | "letter" | "thermal"

interface PrintLayoutProps {
    children: React.ReactNode
    paperSize?: PrintPaperSize
}

export default function PrintLayout({ children, paperSize = "a4" }: PrintLayoutProps) {
    useEffect(() => {
        // Skip automatic print dialog when rendering inside Puppeteer / headless browser
        const isHeadless =
            typeof navigator !== "undefined" &&
            (navigator.userAgent.includes("Headless") || window.location.search.includes("headless=true"))
        if (isHeadless) return

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

    const isThermal = paperSize === "thermal"
    const paperWidth = isThermal ? "80mm" : paperSize === "letter" ? "215.9mm" : "210mm"
    const paperHeight = isThermal ? "auto" : paperSize === "letter" ? "279.4mm" : "297mm"
    const pageSize = isThermal ? "80mm auto" : paperSize === "letter" ? "Letter" : "A4"

    return (
        <div className={`bg-white text-black print:bg-white print:text-black ${isThermal ? "w-[80mm] max-w-[80mm] min-h-0 h-auto" : "min-h-screen"}`}>
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
                                ${isThermal ? "min-height: auto !important; height: auto !important;" : `height: ${paperHeight} !important;`}
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