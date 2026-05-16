"use client"

import React, { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { TextFirstlineRightIcon } from "@/lib/icons"

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
            const offset = 100
            const bodyRect = document.body.getBoundingClientRect().top
            const elementRect = element.getBoundingClientRect().top
            const elementPosition = elementRect - bodyRect
            const offsetPosition = elementPosition - offset

            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            })
        }
    }

    return (
        <aside className="hidden xl:block w-64 shrink-0 py-8 px-6 sticky top-[72px] h-[calc(100vh-72px)] overflow-y-auto custom-scrollbar">
            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4 flex items-center gap-2">
                <TextFirstlineRightIcon className="h-4 w-4" />
                Nesta página
            </h4>

            <ul className="space-y-1">
                {items.map((item) => {
                    const isActive = activeId === item.id
                    return (
                        <li
                            key={item.id}
                            style={{ paddingLeft: item.level === 3 ? "0.75rem" : "0" }}
                        >
                            <button
                                onClick={() => scrollTo(item.id)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] transition-all cursor-pointer text-left group relative",
                                    isActive
                                        ? "bg-brand-green/10 text-brand-green font-semibold"
                                        : "text-brand-inactive-text dark:text-dark-body hover:bg-brand-gray dark:hover:bg-dark-border/40 hover:text-brand-dark dark:hover:text-dark-heading"
                                )}
                            >
                                {isActive && (
                                    <div className="bg-brand-green w-1 rounded-full self-stretch shrink-0 min-h-5" />
                                )}
                                <span className="truncate">{item.text}</span>
                            </button>
                        </li>
                    )
                })}
            </ul>

            <div className="mt-10 pt-8 border-t border-gray-100 dark:border-dark-border">
                <p className="text-[13px] text-gray-500 dark:text-dark-body mb-4">Isto foi útil?</p>
                <div className="flex gap-2">
                    {["😊", "😐", "🙁"].map((emoji, i) => (
                        <button
                            key={i}
                            className="w-10 h-10 rounded-full border border-gray-100 dark:border-dark-border flex items-center justify-center hover:bg-gray-50 dark:hover:bg-dark-surface transition-all hover:scale-110 active:scale-95 text-xl"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    )
}
