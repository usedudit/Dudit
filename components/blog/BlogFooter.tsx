import Link from "next/link"
import { InstagramIcon, TwitterIcon } from "@/lib/icons"
import { BLOG_CATEGORIES } from "@/lib/blog/categories"

export default function BlogFooter() {
    return (
        <footer className="mt-auto w-full border-t border-white/10 bg-brand-dark py-14">
            <div className="mx-auto w-full max-w-[1400px] px-4 lg:px-6">
                <div className="flex flex-col justify-between gap-12 md:flex-row">
                    <div className="md:w-1/3">
                        <Link href="/" prefetch={false} className="mb-5 inline-block">
                            <img
                                src="https://img.dudit.com.br/static/Logo.png"
                                alt="Dudit"
                                width={140}
                                height={40}
                                className="h-10 w-auto object-contain"
                            />
                        </Link>
                        <p className="max-w-sm text-sm leading-relaxed text-gray-400">
                            O Blog do Dino reúne dicas práticas para quem vende, atende e administra um pequeno negócio no Brasil.
                        </p>
                        <div className="mt-6 flex gap-3">
                            <a
                                href="https://instagram.com/usedudit"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-gray-400 transition-all hover:border-white/30 hover:bg-white/5 hover:text-white"
                                aria-label="Instagram da Dudit"
                            >
                                <InstagramIcon size={16} />
                            </a>
                            <a
                                href="https://twitter.com/usedudit"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-gray-400 transition-all hover:border-white/30 hover:bg-white/5 hover:text-white"
                                aria-label="Twitter da Dudit"
                            >
                                <TwitterIcon size={16} />
                            </a>
                        </div>
                    </div>

                    <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3">
                        <div>
                            <h3 className="mb-4 text-sm font-semibold text-white">Dicas</h3>
                            <ul className="space-y-3">
                                <li><Link href="/blog" prefetch={false} className="text-sm text-gray-400 transition-colors hover:text-brand-green">Todos os artigos</Link></li>
                                {BLOG_CATEGORIES.slice(0, 4).map((category) => (
                                    <li key={category.id}>
                                        <Link href={`/blog/categoria/${category.id}`} prefetch={false} className="text-sm text-gray-400 transition-colors hover:text-brand-green">
                                            {category.shortLabel}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h3 className="mb-4 text-sm font-semibold text-white">Ajuda</h3>
                            <ul className="space-y-3">
                                <li><Link href="/ajuda" prefetch={false} className="text-sm text-gray-400 transition-colors hover:text-brand-green">Central de Ajuda</Link></li>
                                <li><Link href="/ajuda/financeiro/primeiros-passos-financeiro" prefetch={false} className="text-sm text-gray-400 transition-colors hover:text-brand-green">Primeiros passos</Link></li>
                                <li><Link href="/ferramentas" prefetch={false} className="text-sm text-gray-400 transition-colors hover:text-brand-green">Ferramentas grátis</Link></li>
                                <li><Link href="/institucional/contato" prefetch={false} className="text-sm text-gray-400 transition-colors hover:text-brand-green">Fale com a gente</Link></li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="mb-4 text-sm font-semibold text-white">Dudit</h3>
                            <ul className="space-y-3">
                                <li><Link href="/institucional/inicio" prefetch={false} className="text-sm text-gray-400 transition-colors hover:text-brand-green">Como funciona</Link></li>
                                <li><Link href="/institucional/segmentos" prefetch={false} className="text-sm text-gray-400 transition-colors hover:text-brand-green">Segmentos</Link></li>
                                <li><Link href="/institucional/planos" prefetch={false} className="text-sm text-gray-400 transition-colors hover:text-brand-green">Planos</Link></li>
                                <li><Link href="/mapa-do-site" prefetch={false} className="text-sm text-gray-400 transition-colors hover:text-brand-green">Mapa do site</Link></li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
                    <p className="text-center text-xs text-gray-400 md:text-left">
                        © {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os direitos reservados.
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                        <Link href="/institucional/termos" prefetch={false} className="transition-colors hover:text-brand-green">Termos</Link>
                        <span>•</span>
                        <Link href="/institucional/privacidade" prefetch={false} className="transition-colors hover:text-brand-green">Privacidade</Link>
                        <span>•</span>
                        <Link href="/blog/feed.xml" prefetch={false} className="transition-colors hover:text-brand-green">RSS</Link>
                    </div>
                </div>
            </div>
        </footer>
    )
}
