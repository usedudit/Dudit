"use client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen flex items-center justify-center bg-white font-sans p-6">
        <div className="max-w-xl w-full flex flex-col items-center text-center">

          {/* Mascote */}
          <img
            src="https://img.dudit.com.br/static/mascots/Ops.png"
            alt="Ops"
            className="w-48 h-48 md:w-64 md:h-64 object-contain mb-6"
          />

          {/* Título */}
          <h1 className="text-2xl md:text-3xl font-bold text-brand-dark mb-2">
            Ops! Algo deu errado por aqui
          </h1>

          {/* Subtítulo */}
          <p className="text-brand-inactive-text text-lg mb-8">
            Algo inesperado aconteceu. Tente novamente em alguns instantes.
          </p>

          {/* Botão */}
          <button
            onClick={() => reset()}
            className="bg-brand-green text-white px-6 py-2.5 rounded-full font-semibold hover:bg-brand-green/90 transition"
          >
            Tentar novamente
          </button>

          {/* Card erro */}
          <div className="w-full mt-12 max-w-lg">
            <div className="bg-brand-red/10 rounded-lg px-4 py-3 flex gap-3 items-start border border-brand-red">
              <div className="bg-brand-red w-1 rounded-full self-stretch" />

              <div className="text-left">
                <p className="text-sm font-bold text-brand-red mb-0.5">
                  Detalhes do erro
                </p>

                <p className="text-xs text-brand-red break-all">
                  {error?.message || "Erro crítico no sistema"}
                </p>

                {error?.digest && (
                  <p className="text-[10px] opacity-70 text-brand-red mt-1">
                    ID: {error.digest}
                  </p>
                )}
              </div>
            </div>
          </div>

        </div>
      </body>
    </html>
  )
}