/**
 * Utility to download a PDF file generated on the server.
 * Handles parsing error responses and triggers a client-side file save.
 */
export async function downloadPdf(apiPath: string, filename: string): Promise<void> {
    const response = await fetch(apiPath)
    
    if (!response.ok) {
        let errorMessage = "Erro ao gerar PDF"
        try {
            const errorJson = await response.json()
            errorMessage = errorJson.error || errorJson.details || errorMessage
        } catch {
            try {
                const errorText = await response.text()
                if (errorText) errorMessage = errorText
            } catch {}
        }
        throw new Error(errorMessage)
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    
    link.click()
    
    // Cleanup
    link.remove()
    window.URL.revokeObjectURL(url)
}
