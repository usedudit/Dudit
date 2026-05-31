"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import Script from "next/script"
import { Button } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import {
  prepareWhatsappEmbeddedSignupAction,
  completeWhatsappEmbeddedSignupAction,
} from "@/app/actions/whatsapp"

type EmbeddedSignupSession = {
  wabaId: string
  phoneNumberId: string
}

type FbLoginResponse = {
  authResponse?: { code?: string }
  status?: string
}

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void
      login: (callback: (response: FbLoginResponse) => void, options: Record<string, unknown>) => void
    }
    fbAsyncInit?: () => void
  }
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID
const META_GRAPH_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION || "v21.0"

function waitForSignupSession(
  getSession: () => EmbeddedSignupSession | null,
  timeoutMs = 120_000,
): Promise<EmbeddedSignupSession> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const session = getSession()
      if (session?.wabaId && session?.phoneNumberId) {
        resolve(session)
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Tempo esgotado aguardando confirmação da Meta"))
        return
      }
      setTimeout(tick, 200)
    }
    tick()
  })
}

export function WhatsappConnectButton({
  onSuccess,
  disabled,
  className,
  children,
}: {
  onSuccess?: () => void
  disabled?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const [sdkReady, setSdkReady] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const signupSessionRef = useRef<EmbeddedSignupSession | null>(null)

  const initSdk = useCallback(() => {
    if (!window.FB || !META_APP_ID) return
    window.FB.init({
      appId: META_APP_ID,
      autoLogAppEvents: true,
      xfbml: false,
      version: META_GRAPH_VERSION,
    })
    setSdkReady(true)
  }, [])

  useEffect(() => {
    window.fbAsyncInit = initSdk
    if (window.FB) initSdk()
  }, [initSdk])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return

        if (data.event === "CANCEL") {
          const errMsg = data.data?.error_message || "Conexão cancelada na Meta"
          toast.error(String(errMsg))
          setIsConnecting(false)
          return
        }

        const payload = data.data || {}
        const wabaId = String(payload.waba_id || payload.waba_ids?.[0] || "")
        const phoneNumberId = String(payload.phone_number_id || "")
        if (wabaId && phoneNumberId) {
          signupSessionRef.current = { wabaId, phoneNumberId }
        }
      } catch {
        // ignore non-JSON messages
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const handleConnect = async () => {
    if (!META_APP_ID || !META_CONFIG_ID) {
      toast.error("Integração WhatsApp não configurada. Contate o suporte.")
      return
    }
    if (!sdkReady || !window.FB) {
      toast.error("Aguarde o carregamento da Meta e tente novamente")
      return
    }

    setIsConnecting(true)
    signupSessionRef.current = null

    try {
      const prepared = await prepareWhatsappEmbeddedSignupAction()
      if (!prepared.success) {
        toast.error(prepared.error || "Não foi possível iniciar a conexão")
        setIsConnecting(false)
        return
      }

      const codePromise = new Promise<string>((resolve, reject) => {
        window.FB!.login(
          (response) => {
            const code = response.authResponse?.code
            if (code) {
              resolve(code)
              return
            }
            if (response.status === "unknown") {
              reject(new Error("Autorização cancelada"))
              return
            }
            reject(new Error("Não foi possível obter autorização da Meta"))
          },
          {
            config_id: META_CONFIG_ID,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {}, sessionInfoVersion: "3" },
          },
        )
      })

      const [code, session] = await Promise.all([
        codePromise,
        waitForSignupSession(() => signupSessionRef.current),
      ])

      const result = await completeWhatsappEmbeddedSignupAction({
        code,
        wabaId: session.wabaId,
        phoneNumberId: session.phoneNumberId,
      })

      if (!result.success) {
        toast.error(result.error || "Erro ao conectar WhatsApp")
        return
      }

      toast.success("WhatsApp conectado com sucesso")
      onSuccess?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao conectar WhatsApp"
      toast.error(message)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <>
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="lazyOnload"
        crossOrigin="anonymous"
        onLoad={initSdk}
      />
      <Button
        type="button"
        onClick={handleConnect}
        disabled={disabled || isConnecting || !META_APP_ID || !META_CONFIG_ID}
        isLoading={isConnecting}
        className={className}
      >
        {children ?? "Conectar WhatsApp"}
      </Button>
    </>
  )
}
