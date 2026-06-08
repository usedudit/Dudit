"use client"

import { useEffect } from "react"

interface PrintLayoutProps {
    children: React.ReactNode
}

export default function PrintLayout({ children }: PrintLayoutProps) {
    useEffect(() => {
        const timer = setTimeout(() => {
            window.print()
        }, 500)
        return () => clearTimeout(timer)
    }, [])

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
                                width: 210mm !important;
                                height: 297mm !important;
                            }
                            
                            /* Hide browser-added headers and footers */
                            @page {
                                size: A4;
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
