import { IconPlaceholder } from "@/components/reusable"

export function DeliveryAccessDenied({ userEmail }: { userEmail?: string }) {
    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-4 text-center">
            <div className="flex flex-col items-center">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                    imageAlt="Acesso Restrito"
                    title="Acesso Restrito ao Portal do Entregador"
                    subtitle={
                        userEmail
                            ? `A conta (${userEmail}) não está cadastrada como entregador ativo na Dudit. Se você recebeu um convite, utilize o link de convite enviado por e-mail para ativar seu acesso.`
                            : "Sua conta não está cadastrada como entregador ativo na Dudit. Se você recebeu um convite, utilize o link de convite enviado por e-mail para ativar seu acesso."
                    }
                    buttons={[
                        {
                            text: "Voltar para o Início",
                            action: "/",
                            variant: "default",
                        },
                    ]}
                />
            </div>
        </div>
    )
}
