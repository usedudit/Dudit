import InviteView from "@/components/InviteView"

const ERROR_MESSAGES: Record<string, string> = {
    invalid: "Este convite é inválido ou não foi encontrado.",
    used: "Este convite já foi utilizado.",
    expired: "Este convite expirou.",
}

export default async function InviteErrorPage({
    searchParams,
}: {
    searchParams: Promise<{ reason?: string; message?: string }>
}) {
    const { reason, message: customMessage } = await searchParams

    const displayMessage = customMessage
        ? decodeURIComponent(customMessage)
        : ERROR_MESSAGES[reason || ""] || "Convite inválido."

    return <InviteView mode="error" message={displayMessage} />
}