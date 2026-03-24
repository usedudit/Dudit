"use client"

import { useState } from "react"
import { sendEmailAction } from "@/app/actions/emails"

interface EmailFormData {
  recipientEmail: string
  subject: string
  message: string
}

export function EmailSenderExample() {
  const [formData, setFormData] = useState<EmailFormData>({
    recipientEmail: "",
    subject: "",
    message: "",
  })
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{
    type: "success" | "error" | "warning" | null
    message: string
    messageId?: string
  }>({
    type: null,
    message: "",
  })

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setStatus({ type: null, message: "" })

    try {
      // Validação básica
      if (!formData.recipientEmail || !formData.subject || !formData.message) {
        setStatus({
          type: "error",
          message: "Por favor, preencha todos os campos",
        })
        return
      }

      // Validar email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.recipientEmail)) {
        setStatus({
          type: "error",
          message: "Email inválido",
        })
        return
      }

      // Enviar email via server action
      const result = await sendEmailAction({
        to: formData.recipientEmail,
        subject: formData.subject,
        html: `<p>${formData.message.replace(/\n/g, "<br>")}</p>`,
      })

      if (result.success) {
        setStatus({
          type: "success",
          message: "Email enviado com sucesso!",
          messageId: result.messageId,
        })

        // Limpar formulário após sucesso
        setFormData({
          recipientEmail: "",
          subject: "",
          message: "",
        })
      } else if (result.error?.includes("duplicado")) {
        // Se foi um email duplicado, ainda consideramos como sucesso
        setStatus({
          type: "warning",
          message: result.error || "Email duplicado foi bloqueado (já foi enviado nos últimos 5 minutos)",
          messageId: result.messageId,
        })
      } else {
        setStatus({
          type: "error",
          message: result.error || "Erro ao enviar email",
        })
      }
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Erro desconhecido ao enviar email",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Enviar Email</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email do Destinatário */}
        <div>
          <label htmlFor="recipientEmail" className="block text-sm font-medium text-gray-700 mb-1">
            Email do Destinatário
          </label>
          <input
            id="recipientEmail"
            type="email"
            name="recipientEmail"
            value={formData.recipientEmail}
            onChange={handleInputChange}
            placeholder="usuario@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        {/* Assunto */}
        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
            Assunto
          </label>
          <input
            id="subject"
            type="text"
            name="subject"
            value={formData.subject}
            onChange={handleInputChange}
            placeholder="Bem-vindo!"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        {/* Mensagem */}
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
            Mensagem
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleInputChange}
            placeholder="Digite sua mensagem aqui..."
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={loading}
          />
        </div>

        {/* Status Message */}
        {status.type && (
          <div
            className={`p-3 rounded-md text-sm ${
              status.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : status.type === "warning"
                  ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
                  : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <p className="font-medium">{status.message}</p>
            {status.messageId && (
              <p className="text-xs mt-1 opacity-75">ID: {status.messageId}</p>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full px-4 py-2 rounded-md font-medium text-white transition-colors ${
            loading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
          }`}
        >
          {loading ? "Enviando..." : "Enviar Email"}
        </button>
      </form>

      {/* Helper Text */}
      <div className="mt-4 p-3 rounded-md bg-blue-50 text-blue-700 text-xs">
        <p className="font-medium mb-1">ℹ️ Informações:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Máximo 30 emails por hora</li>
          <li>Emails duplicados são bloqueados por 5 minutos</li>
          <li>Validação de email automática</li>
        </ul>
      </div>
    </div>
  )
}
