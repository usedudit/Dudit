import Link from "next/link"

/**
 * Inline "Access Denied" wrapper for ERP pages.
 * Renders in-place without redirect or error boundary — no extra edge/function invocations.
 */
export function AccessDenied() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[65vh] p-6 text-center select-none">
            <div className="relative mb-8">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center shadow-inner">
                    <img
                        src="https://img.dudit.com.br/static/Logo.png"
                        alt="Dudit"
                        width={56}
                        height={56}
                        className="w-14 h-auto opacity-20 dark:opacity-10 grayscale"
                    />
                </div>
                <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shadow-md">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-5 h-5 text-brand-red dark:text-red-400"
                    >
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Acesso Restrito
            </h2>

            <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-2 leading-relaxed">
                Você não tem permissão para acessar esta área. Se acredita que isso é um erro, entre em contato com o administrador da sua equipe.
            </p>

            <p className="text-xs text-gray-400 dark:text-gray-500 mb-8">
                Seu cargo atual não inclui acesso a este módulo.
            </p>

            <Link
                href="/erp/dashboard"
                prefetch={false}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#022C2B] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                >
                    <path d="m12 19-7-7 7-7" />
                    <path d="M19 12H5" />
                </svg>
                Voltar ao Início
            </Link>
        </div>
    )
}
