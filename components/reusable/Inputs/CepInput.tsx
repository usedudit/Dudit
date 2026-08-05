"use client"

import React, { useState, useEffect, useRef } from "react"
import { Input } from "@/components/reusable"
import { Spinner } from "@/components/reusable/Spinner"
import { Button } from "@/components/reusable/Button"

interface CepResponse {
    logradouro?: string
    bairro?: string
    localidade?: string
    municipio?: string
    uf?: string
    numero?: string
    ibge?: string
    latitude?: number | null
    longitude?: number | null
    erro?: boolean
    error?: string
}

interface CepInputProps extends Omit<React.ComponentProps<typeof Input>, "onChange" | "onBlur"> {
    value: string
    onChange: (value: string) => void
    onAddressFetched?: (addressData: {
        street: string
        neighborhood: string
        city: string
        state: string
        number: string
        ibge?: string
        latitude?: number | null
        longitude?: number | null
    }) => void
}

export const CepInput: React.FC<CepInputProps> = ({
    value,
    onChange,
    onAddressFetched,
    label = "CEP",
    placeholder = "00000-000",
    ...props
}) => {
    const [loading, setLoading] = useState(false)
    const [lastFetchedCep, setLastFetchedCep] = useState(value?.replace(/\D/g, "") || "")
    const fetchingCepRef = useRef("")

    // Formata o CEP enquanto o usuário digita
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        let text = e.target.value.replace(/\D/g, "")
        if (text.length > 8) text = text.substring(0, 8)
        if (text.length > 5) {
            text = `${text.substring(0, 5)}-${text.substring(5, 8)}`
        }
        onChange(text)
    }

    // Busca o endereço pelo CEP via /api/cep
    const fetchAddressByCep = async (cepToFetch: string) => {
        const cleanCep = cepToFetch.replace(/\D/g, "")
        if (cleanCep.length !== 8 || cleanCep === lastFetchedCep || cleanCep === fetchingCepRef.current) return

        fetchingCepRef.current = cleanCep
        setLoading(true)
        try {
            const response = await fetch(`/api/cep?cep=${cleanCep}`)
            const data: CepResponse = await response.json()

            if (data && !data.error && !data.erro) {
                setLastFetchedCep(cleanCep)
                onAddressFetched?.({
                    street: data.logradouro || "",
                    neighborhood: data.bairro || "",
                    city: data.localidade || data.municipio || "",
                    state: data.uf || "",
                    number: data.numero || "",
                    ibge: data.ibge || "",
                    latitude: data.latitude ?? null,
                    longitude: data.longitude ?? null,
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

    // Busca automática se tiver 8 dígitos
    useEffect(() => {
        const cleanCep = value.replace(/\D/g, "")
        if (cleanCep.length === 8 && onAddressFetched && cleanCep !== lastFetchedCep) {
            fetchAddressByCep(value)
        }
    }, [value, onAddressFetched])

    return (
        <div className="relative">
            <Input
                label={label}
                placeholder={placeholder}
                labelAddon={
                    <Button
                        type="button"
                        variant="link"
                        onClick={() => window.open("https://buscacepinter.correios.com.br/app/endereco/index.php", "_blank")}
                        className="text-xs font-bold p-0 h-auto min-h-0 bg-transparent hover:bg-transparent text-brand-dark dark:text-dark-heading hover:text-brand-green"
                    >
                        Não sei meu CEP
                    </Button>
                }
                {...props}
                value={value}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={loading || props.disabled}
                maxLength={9}
            />
            {loading && (
                <Spinner className="absolute right-3 top-9 w-4 h-4 text-gray-400" size={16} />
            )}
        </div>
    )
}