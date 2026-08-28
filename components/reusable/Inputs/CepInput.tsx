"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
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

export interface FetchedAddressData {
    street: string
    neighborhood: string
    city: string
    state: string
    number: string
    ibge?: string
    latitude?: number | null
    longitude?: number | null
}

interface CepInputProps extends Omit<React.ComponentProps<typeof Input>, "onChange" | "onBlur"> {
    value: string
    onChange: (value: string) => void
    onAddressFetched?: (addressData: FetchedAddressData) => void
    onLoadingChange?: (loading: boolean) => void
}

export const CepInput: React.FC<CepInputProps> = ({
    value,
    onChange,
    onAddressFetched,
    onLoadingChange,
    label = "CEP",
    placeholder = "00000-000",
    disabled,
    ...props
}) => {
    const [loading, setLoading] = useState(false)
    const lastFetchedCepRef = useRef<string>("")
    const abortControllerRef = useRef<AbortController | null>(null)
    const onAddressFetchedRef = useRef(onAddressFetched)
    const onLoadingChangeRef = useRef(onLoadingChange)

    useEffect(() => {
        onAddressFetchedRef.current = onAddressFetched
    }, [onAddressFetched])

    useEffect(() => {
        onLoadingChangeRef.current = onLoadingChange
    }, [onLoadingChange])

    // Sincronizar / resetar o último CEP se o valor mudar externamente para menos de 8 dígitos
    useEffect(() => {
        const clean = value?.replace(/\D/g, "") || ""
        if (clean.length < 8) {
            lastFetchedCepRef.current = ""
        }
    }, [value])

    // Cleanup abort controller on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
            }
        }
    }, [])

    // Busca o endereço pelo CEP via /api/cep
    const fetchAddressByCep = useCallback(async (cepToFetch: string) => {
        const cleanCep = cepToFetch.replace(/\D/g, "")
        if (cleanCep.length !== 8 || cleanCep === lastFetchedCepRef.current) {
            return
        }

        // Abort previous in-flight request if any
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }
        const controller = new AbortController()
        abortControllerRef.current = controller

        setLoading(true)
        onLoadingChangeRef.current?.(true)

        try {
            const response = await fetch(`/api/cep?cep=${cleanCep}`, {
                signal: controller.signal,
            })
            const data: CepResponse = await response.json()

            if (data && !data.error && !data.erro) {
                lastFetchedCepRef.current = cleanCep
                onAddressFetchedRef.current?.({
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
                // Se a API retornar erro ou não encontrar, libera o ref para permitir retentativa
                lastFetchedCepRef.current = ""
            }
        } catch (e: any) {
            if (e?.name !== "AbortError") {
                console.error("Erro ao buscar CEP:", e)
                lastFetchedCepRef.current = ""
            }
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null
                setLoading(false)
                onLoadingChangeRef.current?.(false)
            }
        }
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        let text = e.target.value.replace(/\D/g, "")
        if (text.length > 8) text = text.substring(0, 8)

        let formatted = text
        if (text.length > 5) {
            formatted = `${text.substring(0, 5)}-${text.substring(5, 8)}`
        }
        onChange(formatted)

        if (text.length < 8) {
            lastFetchedCepRef.current = ""
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
                abortControllerRef.current = null
                setLoading(false)
                onLoadingChangeRef.current?.(false)
            }
        } else if (text.length === 8) {
            void fetchAddressByCep(text)
        }
    }

    const handleBlur = () => {
        const clean = value?.replace(/\D/g, "") || ""
        if (clean.length === 8 && clean !== lastFetchedCepRef.current) {
            void fetchAddressByCep(clean)
        }
    }

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
                disabled={disabled}
                maxLength={9}
            />
            {loading && (
                <div className="absolute right-3 top-[38px] flex items-center pointer-events-none">
                    <Spinner size={16} className="text-brand-green" />
                </div>
            )}
        </div>
    )
}