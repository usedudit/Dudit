import { IconPlaceholder } from "@/components/reusable"

export function AccessDenied() {
    return (
        <div className="flex items-center justify-center h-screen p-4 text-center">
            <div className="flex flex-col items-center">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                    imageAlt="Acesso Restrito"
                    title="Acesso Restrito"
                    subtitle="Você não tem permissão para acessar esta área. Se acredita que isso é um erro, entre em contato com o administrador da sua equipe."
                    itemButton={{
                        text: "Voltar para o Início",
                        action: "/erp/inicio"
                    }}
                />
            </div>
        </div>
    )
}
