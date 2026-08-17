import type { Browser } from "puppeteer-core"
import { execSync } from "node:child_process"

/**
 * Server-side function that launches a headless browser, sets authentication cookies,
 * navigates to the print template, and returns a binary PDF buffer.
 */
export async function generatePdf(url: string, nextCookies: any[]): Promise<Buffer> {
    const puppeteer = (await import("puppeteer-core")).default
    let browser: Browser

    const isProd = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT

    const fs = await import("fs")

    if (isProd) {
        let executablePath = ""

        if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
            executablePath = process.env.CHROMIUM_PATH
        }

        if (!executablePath) {
            const linuxCandidates = [
                "/usr/bin/chromium",
                "/usr/bin/chromium-browser",
                "/usr/bin/google-chrome-stable",
                "/usr/bin/google-chrome",
            ]
            for (const candidate of linuxCandidates) {
                if (fs.existsSync(candidate)) {
                    executablePath = candidate
                    break
                }
            }
        }

        if (!executablePath) {
            const commands = ["which chromium", "which chromium-browser", "which google-chrome", "which google-chrome-stable"]
            for (const cmd of commands) {
                try {
                    const result = execSync(cmd).toString().trim()
                    if (result && fs.existsSync(result)) {
                        executablePath = result
                        break
                    }
                } catch { }
            }
        }

        // Fallback to @sparticuz/chromium if installed
        if (!executablePath) {
            try {
                const sparticuzChromium = (await import("@sparticuz/chromium")).default
                executablePath = await sparticuzChromium.executablePath()
            } catch { }
        }

        if (!executablePath) {
            throw new Error(
                "Chromium não encontrado no servidor. Verifique se o pacote 'chromium' está configurado no railpack.json ou na variável RAILPACK_DEPLOY_APT_PACKAGES."
            )
        }

        browser = (await puppeteer.launch({
            executablePath,
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--font-render-hinting=none",
                "--no-zygote",
                "--ignore-certificate-errors",
                "--allow-running-insecure-content",
            ],
            protocolTimeout: 60000,
        })) as unknown as Browser
    } else {
        // Local environment browser fallback (Windows / macOS / Linux)
        let executablePath = ""

        if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
            executablePath = process.env.CHROMIUM_PATH
        }

        if (!executablePath) {
            const paths = [
                "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
                "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
                "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/usr/bin/google-chrome",
                "/usr/bin/chromium",
                "/usr/bin/chromium-browser",
            ]

            for (const p of paths) {
                if (fs.existsSync(p)) {
                    executablePath = p
                    break
                }
            }
        }

        if (!executablePath) {
            try {
                const sparticuzChromium = (await import("@sparticuz/chromium")).default
                executablePath = await sparticuzChromium.executablePath()
            } catch { }
        }

        if (!executablePath) {
            throw new Error(
                "Nenhum executável de navegador local encontrado (Chrome ou Edge). " +
                "Por favor, instale o Google Chrome ou Microsoft Edge para desenvolvimento local."
            )
        }

        browser = (await puppeteer.launch({
            executablePath,
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--ignore-certificate-errors",
                "--allow-running-insecure-content",
            ],
        })) as unknown as Browser
    }

    try {
        const page = await browser.newPage()
        const urlObj = new URL(url)

        // Forward raw Cookie header directly to ensure all requests made by Chromium include session authentication
        if (Array.isArray(nextCookies) && nextCookies.length > 0) {
            const cookieHeader = nextCookies.map((c) => `${c.name}=${c.value}`).join("; ")
            if (cookieHeader) {
                await page.setExtraHTTPHeaders({
                    Cookie: cookieHeader,
                })
            }

            // Also set cookies explicitly for the target origin
            const puppeteerCookies = nextCookies.map((cookie) => ({
                name: cookie.name,
                value: cookie.value,
                url: urlObj.origin,
                domain: urlObj.hostname,
                path: "/",
                secure: urlObj.protocol === "https:",
                httpOnly: false,
            }))

            try {
                await page.setCookie(...puppeteerCookies)
            } catch { }
        }

        // Standard A4 rendering dimensions (794px width at 96 DPI)
        await page.setViewport({
            width: 794,
            height: 1078,
            deviceScaleFactor: 1,
        })

        // Open internal print URL
        await page.goto(url, {
            waitUntil: ["domcontentloaded", "networkidle2"],
            timeout: 30000,
        })

        // Ensure custom fonts are fully loaded prior to printing
        await page.evaluateHandle(() => document.fonts.ready)

        // Render PDF
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "0mm",
                right: "0mm",
                bottom: "0mm",
                left: "0mm",
            },
            preferCSSPageSize: true,
        })

        return Buffer.from(pdfBuffer)
    } finally {
        if (browser) {
            await browser.close()
        }
    }
}
