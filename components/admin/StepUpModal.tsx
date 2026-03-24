"use client"

/**
 * Step-Up Re-Authentication Modal.
 *
 * Used for critical admin actions (ban, suspend, delete, etc).
 * Shows a password field, validates via server, returns a single-use token.
 */

import React, { useState } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { InfoCard, Button, Input } from "@/components/reusable"
import { EyeIcon } from "@/lib/icons"
import { requestStepUpToken } from "@/app/actions/admin/step-up"

interface StepUpModalProps {
    isOpen: boolean
    onClose: () => void
    onAuthenticated: (token: string) => void
    title?: string
    description?: string
}

const StepUpModal = ({
    isOpen,
    onClose,
    onAuthenticated,
    title = "Autenticação Adicional",
    description = "Por segurança, confirme sua senha para executar esta ação crítica.",
}: StepUpModalProps) => {
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!password.trim()) return

        setIsLoading(true)
        setError(null)

        try {
            const result = await requestStepUpToken(password)

            if (result.success && result.token) {
                setPassword("")
                setError(null)
                onAuthenticated(result.token)
            } else {
                setError(result.error || "Autenticação falhou")
            }
        } catch (err: any) {
            setError(err?.message || "Erro inesperado")
        } finally {
            setIsLoading(false)
        }
    }

    const handleClose = () => {
        setPassword("")
        setError(null)
        onClose()
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={handleClose}
            title={title}
            maxWidth="sm"
            footer={
                <>
                    <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button
                        variant="default"
                        onClick={() => handleSubmit()}
                        disabled={isLoading || !password.trim()}
                    >
                        {isLoading ? "Verificando..." : "Confirmar Identidade"}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                    {description}
                </p>

                <div>
                    <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5">
                        Senha <span className="text-brand-red">*</span>
                    </label>
                    <div className="relative">
                        <Input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setPassword(e.target.value)}
                            placeholder="Digite sua senha..."
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === "Enter" && password.trim()) handleSubmit()
                            }}
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                        >
                            <EyeIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {error && <InfoCard message={error} color="red" />}
            </div>
        </DefaultModal>
    )
}

export default StepUpModal
