"use client"

import { useState } from "react"

export default function DevBillingSyncPage() {
    const [subscriptionIds, setSubscriptionIds] = useState("")
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    const handleSync = async () => {
        setLoading(true)
        setResults([])

        const ids = subscriptionIds
            .split("\n")
            .map(id => id.trim())
            .filter(Boolean)

        const res: any[] = []
        for (const id of ids) {
            try {
                const r = await fetch(`/dev/billing/sync?subscriptionId=${encodeURIComponent(id)}`)
                const data = await r.json()
                res.push({ id, ...data })
            } catch (err: any) {
                res.push({ id, error: err.message })
            }
        }
        setResults(res)
        setLoading(false)
    }

    return (
        <div className="max-w-2xl mx-auto p-8">
            <h1 className="text-2xl font-bold mb-2">Dev: Sincronizar Assinatura → Billing</h1>
            <p className="text-sm text-gray-500 mb-6">
                Cole um ou mais IDs de assinatura (um por linha) e clique em sincronizar.
            </p>

            <textarea
                className="w-full h-32 p-3 border rounded-lg text-sm font-mono mb-4"
                placeholder="sub_id_1&#10;sub_id_2&#10;sub_id_3"
                value={subscriptionIds}
                onChange={(e) => setSubscriptionIds(e.target.value)}
            />

            <button
                onClick={handleSync}
                disabled={loading || !subscriptionIds.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
                {loading ? "Sincronizando..." : "Sincronizar"}
            </button>

            {results.length > 0 && (
                <div className="mt-8 space-y-2">
                    <h2 className="font-semibold text-lg">Resultados</h2>
                    {results.map((r, i) => (
                        <div key={i} className={`p-3 rounded-lg border text-sm font-mono ${r.error ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                            <div><strong>ID:</strong> {r.id}</div>
                            {r.error && <div className="text-red-600"><strong>Erro:</strong> {r.error}</div>}
                            {r.purchaseId && <div><strong>Purchase:</strong> {r.purchaseId}</div>}
                            {r.created !== undefined && <div><strong>Criado:</strong> {r.created ? "Sim" : "Já existia (atualizado)"}</div>}
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-10 p-4 bg-gray-50 rounded-lg text-sm">
                <h3 className="font-semibold mb-2">Como testar pelo terminal:</h3>
                <code className="block bg-gray-800 text-green-400 p-3 rounded">
                    curl http://localhost:3000/dev/billing/sync?subscriptionId=SEU_ID_AQUI
                </code>
            </div>
        </div>
    )
}
