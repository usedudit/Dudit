"use client"

import React, { useState, useEffect, useRef } from "react"
import { Input } from "@/components/reusable"
import { consultarCEP } from "@/lib/nuvem-fiscal"
import { Spinner } from "@/components/reusable/Spinner"

interface CepResponse {
    logradouro?: string
    bairro?: string
    localidade?: string
    municipio?: string
    uf?: string
    erro?: boolean
    error?: string
}

interface CepInputProps extends Omit<React.ComponentProps<typeof Input>, "onChange" | "onBlur"> {
    value: string
    onChange: (value: string) => void
    onAddressFetched?: (addressData: { street: string; neighborhood: string; city: string; state: string }) => void
}

export const CepInput: React.FC<CepInputProps> = ({
    value,
    onChange,
    onAddressFetched,
    ...props
}) => {
    const [loading, setLoading] = useState(false)
    const [lastFetchedCep, setLastFetchedCep] = useState("")
    const fetchingCepRef = useRef("")

    // Formata o CEP enquando o usuário digita
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        let text = e.target.value.replace(/\D/g, "")
        if (text.length > 8) text = text.substring(0, 8)
        if (text.length > 5) {
            text = `${text.substring(0, 5)}-${text.substring(5, 8)}`
        }
        onChange(text)
    }

    // Busca o endereço pelo CEP
    const fetchAddressByCep = async (cepToFetch: string) => {
        const cleanCep = cepToFetch.replace(/\D/g, "")
        if (cleanCep.length !== 8 || cleanCep === lastFetchedCep || cleanCep === fetchingCepRef.current) return

        fetchingCepRef.current = cleanCep
        setLoading(true)
        try {
            // Usando a API consolidada que já tem fallback automático
            const response = await fetch(`/api/cep?cep=${cleanCep}`)
            const data: CepResponse = await response.json()

            if (data && !data.error && !data.erro) {
                setLastFetchedCep(cleanCep)
                onAddressFetched?.({
                    street: data.logradouro || "",
                    neighborhood: data.bairro || "",
                    city: data.localidade || data.municipio || "",
                    state: data.uf || "",
                })
            } else {
                fetchingCepRef.current = ""
            }
        } catch (e) {
            console.error("Erro ao buscar CEP:", e)
            fetchingCepRef.current = ""
        } finally {
            setLoading(false)
        }
    }

    // Dispara busca se o blur for focado com 8 dígitos e onAddressFetched passado
    const handleBlur = () => {
        if (onAddressFetched) {
            fetchAddressByCep(value)
        }
    }

    // Option: Fetch auto if we have complete CEP without waiting for blur
    useEffect(() => {
        const cleanCep = value.replace(/\D/g, "")
        if (cleanCep.length === 8 && onAddressFetched && cleanCep !== lastFetchedCep) {
            fetchAddressByCep(value)
        }
    }, [value, onAddressFetched])

    return (
        <div className="relative">
            <Input
                {...props}
                value={value}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={loading || props.disabled}
                maxLength={9}
                placeholder={props.placeholder || "00000-000"}
            />
            {loading && (
                <Spinner className="absolute right-3 top-9 w-4 h-4 text-gray-400" size={16} />
            )}
        </div>
    )
}