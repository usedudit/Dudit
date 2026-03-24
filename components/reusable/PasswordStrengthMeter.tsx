"use client"

import { motion } from "framer-motion"
import { CheckCircle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

import { calculatePasswordScore } from "@/lib/utils"

export { calculatePasswordScore }

export const PasswordStrengthMeter = ({ password }: { password: string }) => {
    if (!password || password.length === 0) return null

    const score = calculatePasswordScore(password)
    const hasMinLen = password.length >= 8
    const hasNumber = /[0-9]/.test(password)
    const hasUpper = /[A-Z]/.test(password)
    const hasSpecial = /[^A-Za-z0-9]/.test(password)

    let width = 0
    let color = "bg-gray-200"
    let text = ""

    if (score <= 1) {
        width = 33
        color = "bg-brand-red"
        text = "Fraca"
    } else if (score >= 2 && score <= 3) {
        width = 66
        color = "bg-brand-yellow"
        text = "Média"
    } else if (score === 4) {
        width = 100
        color = "bg-brand-green"
        text = "Forte"
    }

    const reqs = [
        { met: hasMinLen, text: "Mínimo 8 carac." },
        { met: hasUpper, text: "Maiúscula" },
        { met: hasNumber, text: "Número" },
        { met: hasSpecial, text: "Símbolo" },
    ]

    return (
        <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex justify-between items-center mb-1.5">
                <span className={`text-xs font-semibold ${color.replace("bg-", "text-")}`}>
                    {text}
                </span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-3">
                <motion.div
                    className={`h-full ${color}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
                {reqs.map((req, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                        {req.met ? (
                            <CheckCircle size={12} className="text-brand-green shrink-0" />
                        ) : (
                            <XCircle size={12} className="text-brand-red shrink-0" />
                        )}
                        <span className={cn("text-xs", req.met ? "text-brand-inactive-text font-medium" : "text-brand-inactive-text/50")}>
                            {req.text}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
