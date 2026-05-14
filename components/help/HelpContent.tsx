"use client"

import React from "react"
import { HelpArticle } from "@/lib/help-data"
import { ChevronRightIcon, CopyIcon, InfoIcon, AlertCircleIcon, SparklesIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

export default function HelpContent({ article }: { article: HelpArticle }) {
    
    // Simple custom parser for markdown-like content
    const renderMarkdown = (content: string) => {
        const lines = content.split("\n")
        const elements: React.ReactNode[] = []
        let currentList: React.ReactNode[] = []
        let inTable = false
        let tableRows: string[][] = []

        const flushList = (key: number) => {
            if (currentList.length > 0) {
                elements.push(<ul key={`list-${key}`} className="list-disc pl-6 mb-6 space-y-2 text-gray-700">{currentList}</ul>)
                currentList = []
            }
        }

        const flushTable = (key: number) => {
            if (inTable && tableRows.length > 0) {
                elements.push(
                    <div key={`table-wrapper-${key}`} className="overflow-x-auto mb-8 border border-gray-100 rounded-xl">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    {tableRows[0].map((cell, i) => (
                                        <th key={i} className="px-6 py-4 font-bold text-gray-900">{cell.trim()}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {tableRows.slice(1).filter(row => !row.every(cell => cell.includes("---"))).map((row, ri) => (
                                    <tr key={ri} className="hover:bg-gray-50/50 transition-colors">
                                        {row.map((cell, ci) => (
                                            <td key={ci} className="px-6 py-4 text-gray-600 leading-relaxed">{cell.trim()}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
                tableRows = []
                inTable = false
            }
        }

        lines.forEach((line, i) => {
            const trimmedLine = line.trim()

            // Headings
            if (trimmedLine.startsWith("## ") || trimmedLine.startsWith("### ")) {
                flushList(i)
                flushTable(i)
                const level = trimmedLine.startsWith("### ") ? 3 : 2
                const text = trimmedLine.replace(/^#{2,3} /, "")
                const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-")
                
                if (level === 2) {
                    elements.push(<h2 id={id} key={i} className="text-2xl font-bold text-gray-900 mt-12 mb-6 scroll-mt-24">{text}</h2>)
                } else {
                    elements.push(<h3 id={id} key={i} className="text-xl font-bold text-gray-900 mt-8 mb-4 scroll-mt-24">{text}</h3>)
                }
            }
            // Lists
            else if (trimmedLine.startsWith("* ") || trimmedLine.startsWith("- ") || /^\d+\./.test(trimmedLine)) {
                flushTable(i)
                const text = trimmedLine.replace(/^(\*|-|\d+\.) /, "")
                currentList.push(<li key={i} className="leading-relaxed">{text}</li>)
            }
            // Tables
            else if (trimmedLine.startsWith("|")) {
                flushList(i)
                inTable = true
                tableRows.push(trimmedLine.split("|").filter(cell => cell.trim() !== "" || (trimmedLine.startsWith("|") && trimmedLine.endsWith("|"))).map(c => c.trim()).filter((_, idx, arr) => idx < arr.length))
            }
            // Alerts / Callouts
            else if (trimmedLine.startsWith("> [!")) {
                flushList(i)
                flushTable(i)
                const type = trimmedLine.includes("TIP") ? "TIP" : trimmedLine.includes("IMPORTANT") ? "IMPORTANT" : "NOTE"
                const nextLine = lines[i+1]?.trim() || ""
                
                elements.push(
                    <div key={i} className={cn(
                        "p-4 rounded-xl mb-8 flex gap-4 items-start",
                        type === "TIP" ? "bg-brand-green/5 border border-brand-green/20" : 
                        type === "IMPORTANT" ? "bg-red-50 border border-red-100" : "bg-blue-50 border border-blue-100"
                    )}>
                        <div className={cn(
                            "mt-0.5",
                            type === "TIP" ? "text-brand-green" : 
                            type === "IMPORTANT" ? "text-red-500" : "text-blue-500"
                        )}>
                            {type === "TIP" ? <SparklesIcon size={20} /> : 
                             type === "IMPORTANT" ? <AlertCircleIcon size={20} /> : <InfoIcon size={20} />}
                        </div>
                        <div className="text-sm leading-relaxed">
                            <strong className="block mb-1 uppercase tracking-wider text-[11px]">{type === "TIP" ? "Dica" : type === "IMPORTANT" ? "Importante" : "Nota"}</strong>
                            <span className="text-gray-700">{nextLine}</span>
                        </div>
                    </div>
                )
                // Skip next line as it's part of the alert
                lines[i+1] = "" 
            }
            // Paragraphs
            else if (trimmedLine !== "" && !trimmedLine.includes("---")) {
                flushList(i)
                flushTable(i)
                elements.push(<p key={i} className="text-gray-600 leading-relaxed mb-6 text-[15px]">{trimmedLine}</p>)
            }
            else if (trimmedLine === "") {
                flushList(i)
                flushTable(i)
            }
        })

        flushList(lines.length)
        flushTable(lines.length)
        return elements
    }

    return (
        <div className="max-w-3xl mx-auto py-8 lg:py-12 px-6 lg:px-12">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-8 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <span>Central de Ajuda</span>
                <ChevronRightIcon size={12} />
                <span className="capitalize">{article.category.replace("-", " ")}</span>
                <ChevronRightIcon size={12} />
                <span className="text-gray-900">{article.title}</span>
            </nav>

            {/* Header */}
            <header className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                    <span className="px-2 py-1 rounded bg-brand-green/10 text-brand-green text-[10px] font-bold uppercase tracking-widest">
                        🚀 {article.category.replace("-", " ")}
                    </span>
                    <button className="ml-auto flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-900 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 transition-all">
                        <CopyIcon size={14} />
                        Copiar link
                    </button>
                </div>
                <h1 className="text-4xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight leading-tight">
                    {article.title}
                </h1>
                {article.description && (
                    <p className="text-xl text-gray-500 font-medium leading-relaxed">
                        {article.description}
                    </p>
                )}
            </header>

            {/* Content Area */}
            <article className="prose prose-slate max-w-none">
                {renderMarkdown(article.content)}
            </article>

            {/* Footer Navigation */}
            <div className="mt-20 pt-10 border-t border-gray-100 flex justify-between items-center">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Anterior</span>
                    <button className="text-sm font-bold text-brand-green hover:underline">Acessando o sistema</button>
                </div>
                <div className="flex flex-col gap-1 text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Próximo</span>
                    <button className="text-sm font-bold text-brand-green hover:underline">Recuperação de senha</button>
                </div>
            </div>
        </div>
    )
}
