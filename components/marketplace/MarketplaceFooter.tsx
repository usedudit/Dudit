import type React from "react"
import Link from "next/link"
import { InstagramIcon, TwitterIcon } from "@/lib/icons"

interface FooterProps {
    setView?: (view: any) => void
}

const Footer: React.FC<FooterProps> = ({ setView }) => {
    return (
        <footer className="bg-brand-dark py-16 border-t border-white/10 relative mt-auto w-full">
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

                {/* Seção Superior */}
                <div className="flex flex-col md:flex-row justify-between gap-12 mb-16">

                    {/* Logo + Descrição */}
                    <div className="md:w-1/3">
                        <Link href="/" prefetch={true} className="inline-block mb-6">
                            <img
                                src="https://img.dudit.com.br/static/Logo.png"
                                alt="Dudit"
                                width={140}
                                height={40}
                                className="h-10 w-auto object-contain"
                            />
                        </Link>
                        <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
                            Descubra produtos, serviços e negócios da sua cidade - ou mostre o que você oferece na Dudit.
                        </p>
                    </div>

                    {/* Colunas de Links */}
                    <div className="flex-1 flex flex-wrap justify-between gap-8">

                        {/* Coluna 1: Institucional */}
                        <div>
                            <h4 className="text-white font-semibold mb-6 uppercase tracking-wider text-xs">Institucional</h4>
                            <ul className="space-y-4">
                                <li><Link href="/institucional/inicio" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Conheça mais</Link></li>
                                <li><Link href="/institucional/sobre" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Sobre a Dudit</Link></li>
                                <li><Link href="/institucional/segmentos" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Segmentos</Link></li>
                                <li><Link href="/institucional/planos" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Nossos Planos</Link></li>
                            </ul>
                        </div>

                        {/* Coluna 2: Para Lojistas (O "ouro" do seu ERP) */}
                        <div>
                            <h4 className="text-white font-semibold mb-6 uppercase tracking-wider text-xs">Para Lojistas</h4>
                            <ul className="space-y-4">
                                <li><Link href="/erp/vender" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Como Vender</Link></li>
                                <li><Link href="/erp/dashboard" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Painel de Gestão</Link></li>
                                <li><Link href="/auth/login" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors font-bold text-brand-green">Cadastrar minha Loja</Link></li>
                            </ul>
                        </div>

                        {/* Coluna 3: Suporte */}
                        <div>
                            <h4 className="text-white font-semibold mb-6 uppercase tracking-wider text-xs">Suporte</h4>
                            <ul className="space-y-4">
                                <li><Link href="/ajuda" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Central de Ajuda</Link></li>
                                <li><Link href="/contato" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Fale Conosco</Link></li>
                                <li><Link href="/status" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Status do Sistema</Link></li>
                                <li><Link href="/faq" prefetch={false} className="text-sm text-gray-400 hover:text-brand-green transition-colors">Perguntas Frequentes</Link></li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Barra Inferior: Legal + Redes Sociais */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-t border-white/10 pt-8">
                    <div className="text-center md:text-left order-2 md:order-1">
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2 mb-3 text-sm text-gray-400">
                            <Link href="/institucional/termos" prefetch={false} className="hover:text-brand-green transition-colors">Termos de Uso</Link>
                            <Link href="/institucional/privacidade" prefetch={false} className="hover:text-brand-green transition-colors">Política de Privacidade</Link>
                        </div>
                        <p className="text-gray-500 text-xs">
                            © {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os direitos reservados.
                        </p>
                    </div>

                    {/* Redes Sociais com Links Reais e Target Blank */}
                    <div className="flex gap-4 order-1 md:order-2">
                        <a
                            href="https://instagram.com/usedudit"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-white/30 transition-all group"
                            title="Siga a Dudit no Instagram"
                        >
                            <InstagramIcon className="w-4 h-4 text-gray-400 group-hover:text-white" />
                        </a>
                        <a
                            href="https://twitter.com/usedudit"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-white/30 transition-all group"
                            title="Siga a Dudit no Twitter"
                        >
                            <TwitterIcon className="w-4 h-4 text-gray-400 group-hover:text-white" />
                        </a>
                    </div>
                </div>

            </div>
        </footer>
    )
}

export { Footer as MarketplaceFooter }
export default Footer
