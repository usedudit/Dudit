"use client"

import React, { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface TOCItem {
    id: string
    text: string
    level: number
}

export default function HelpTOC({ content }: { content: string }) {
    const [items, setItems] = useState<TOCItem[]>([])
    const [activeId, setActiveId] = useState<string>("")

    useEffect(() => {
        // Simple regex to find markdown headings (## and ###)
        const headingLines = content.split("\n").filter(line => line.startsWith("## ") || line.startsWith("### "))
        
        const tocItems = headingLines.map(line => {
            const level = line.startsWith("### ") ? 3 : 2
            const text = line.replace(/^#{2,3} /, "").trim()
            const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-")
            return { id, text, level }
        })

        setItems(tocItems)
    }, [content])

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveId(entry.target.id)
                    }
                })
            },
            { rootMargin: "0% 0% -80% 0%" }
        )

        items.forEach((item) => {
            const element = document.getElementById(item.id)
            if (element) observer.observe(element)
        })

        return () => observer.disconnect()
    }, [items])

    if (items.length === 0) return null

    const scrollTo = (id: string) => {
        const element = document.getElementById(id)
        if (element) {
            window.scrollTo({
                top: element.offsetTop - 100,
                behavior: "smooth"
            })
        }
    }

    return (
        <aside className="hidden xl:block w-64 shrink-0 py-8 px-6 sticky top-0 h-fit">
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                Nesta página
            </h4>
            
            <ul className="space-y-3">
                {items.map((item) => (
                    <li 
                        key={item.id} 
                        style={{ paddingLeft: item.level === 3 ? "1rem" : "0" }}
                    >
                        <button
                            onClick={() => scrollTo(item.id)}
                            className={cn(
                                "text-[13px] text-left transition-colors hover:text-brand-green",
                                activeId === item.id 
                                    ? "text-brand-green font-medium" 
                                    : "text-gray-500"
                            )}
                        >
                            {item.text}
                        </button>
                    </li>
                ))}
            </ul>

            <div className="mt-10 pt-8 border-t border-gray-100">
                <p className="text-[13px] text-gray-500 mb-4">Isto foi útil?</p>
                <div className="flex gap-2">
                    {["😊", "😐", "🙁"].map((emoji, i) => (
                        <button 
                            key={i} 
                            className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center hover:bg-gray-50 transition-all hover:scale-110 active:scale-95"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    )
}
