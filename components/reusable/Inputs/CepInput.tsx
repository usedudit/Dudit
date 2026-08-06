"use client"

import React, { useState, useRef, useEffect } from "react"
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
    const lastFetchedCepRef = useRef<string>(value?.replace(/\D/g, "") || "")
    const fetchingCepRef = useRef<string>("")
    const onAddressFetchedRef = useRef(onAddressFetched)

    // Manter callback sempre atualizado via ref sem disparar re-renders ou efeitos colaterais
    useEffect(() => {
        onAddressFetchedRef.current = onAddressFetched
    }, [onAddressFetched])

    // Sincronizar o último CEP buscado caso o valor inicial já venha preenchido da base
    useEffect(() => {
        const clean = value?.replace(/\D/g, "") || ""
        if (clean.length === 8 && !lastFetchedCepRef.current) {
            lastFetchedCepRef.current = clean
        }
    }, [value])

    // Busca o endereço pelo CEP via /api/cep
    const fetchAddressByCep = async (cepToFetch: string) => {
        const cleanCep = cepToFetch.replace(/\D/g, "")
        if (
            cleanCep.length !== 8 ||
            cleanCep === lastFetchedCepRef.current ||
            cleanCep === fetchingCepRef.current
        ) {
            return
        }

        fetchingCepRef.current = cleanCep
        setLoading(true)
        try {
            const response = await fetch(`/api/cep?cep=${cleanCep}`)
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
            }
        } catch (e) {
            console.error("Erro ao buscar CEP:", e)
        } finally {
            fetchingCepRef.current = ""
            setLoading(false)
        }
    }

    // Chamado EXCLUSIVAMENTE quando o usuário digita no input do CEP
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        let text = e.target.value.replace(/\D/g, "")
        if (text.length > 8) text = text.substring(0, 8)
        if (text.length > 5) {
            text = `${text.substring(0, 5)}-${text.substring(5, 8)}`
        }
        onChange(text)

        // Se o usuário digitou/colou exatamente 8 dígitos no campo CEP, busca o endereço
        if (text.replace(/\D/g, "").length === 8) {
            fetchAddressByCep(text)
        }
    }

    // Chamado EXCLUSIVAMENTE quando o foco sai do input de CEP
    const handleBlur = () => {
        const clean = value?.replace(/\D/g, "") || ""
        if (clean.length === 8 && clean !== lastFetchedCepRef.current) {
            fetchAddressByCep(clean)
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
                disabled={loading || props.disabled}
                maxLength={9}
            />
            {loading && (
                <Spinner className="absolute right-3 top-9 w-4 h-4 text-gray-400" size={16} />
            )}
        </div>
    )
}