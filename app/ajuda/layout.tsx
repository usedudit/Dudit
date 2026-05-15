import React from "react"
import { ThemeProvider } from "@/components/theme-provider"

export default function HelpLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <ThemeProvider 
            attribute="class" 
            defaultTheme="light" 
            enableSystem={false}
        >
            {children}
        </ThemeProvider>
    )
}
