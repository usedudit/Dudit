import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="lg:flex flex-col w-full bg-brand-dark sticky top-0 z-50 shadow-md">
        <div className="w-full h-[68px] flex items-center justify-between max-w-[1300px] px-2 mx-auto gap-4">
          <Link href="/" prefetch={false} className="cursor-pointer shrink-0 z-[110] pt-1">
            <img
              src="https://img.dudit.com.br/static/Logo.png"
              alt="Dudit"
              width={140}
              height={40}
              className="h-10 w-auto object-contain"
            />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 mb-6 md:p-8 mt-20 md:mt-32">
        <div className="max-w-2xl w-full flex flex-col items-center">
          <IconPlaceholder
            placeholderType="image"
            imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
            imageAlt="Não encontrado"
            title="Ops! Essa página não está na vitrine."
            subtitle="Não encontramos a página ou o item que você buscou."
            itemButton={{
              text: "Voltar para o início",
              action: "/"
            }}
          />
        </div>
      </main>

      <footer className="w-full py-8 border-t border-white/10 bg-brand-dark">
        <div className="max-w-[1300px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <a href="/" className="opacity-80 hover:opacity-100 transition-opacity">
            <img
              src="https://img.dudit.com.br/static/Logo.png"
              alt="Dudit"
              width={110}
              height={32}
              className="h-8 w-auto object-contain"
            />
          </a>
          <p className="text-gray-500 text-xs sm:text-sm font-medium tracking-tight">
            © 2026 Dudit Tecnologia Ltda. Todos os direitos reservados.
          </p>

        </div>
      </footer>
    </div>
  )
}
