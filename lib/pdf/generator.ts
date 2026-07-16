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

    if (isProd) {
        let executablePath = process.env.CHROMIUM_PATH || ""

        if (!executablePath) {
            try {
                executablePath = execSync("which chromium")
                    .toString()
                    .trim()
            } catch { }

            if (!executablePath) {
                try {
                    executablePath = execSync("which chromium-browser")
                        .toString()
                        .trim()
                } catch { }
            }

            if (!executablePath) {
                try {
                    executablePath = execSync("which google-chrome")
                        .toString()
                        .trim()
                } catch { }
            }
        }

        if (!executablePath) {
            throw new Error("Chromium não encontrado no PATH.")
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
                "--single-process",
            ],
            protocolTimeout: 60000,
        })) as unknown as Browser
    } else {
        // Local Windows environment browser fallback
        const fs = await import("fs")
        const paths = [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]

        let executablePath = ""
        for (const p of paths) {
            if (fs.existsSync(p)) {
                executablePath = p
                break
            }
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
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        })) as unknown as Browser
    }

    try {
        const page = await browser.newPage()
        const urlObj = new URL(url)
        const domain = urlObj.hostname

        // Apply session cookies to authenticate the puppeteer browser request
        const puppeteerCookies = nextCookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            domain: domain,
            path: "/",
            secure: urlObj.protocol === "https:",
            httpOnly: true,
        }))

        await page.setCookie(...puppeteerCookies)

        // Standard A4 rendering dimensions (794px width at 96 DPI)
        await page.setViewport({
            width: 794,
            height: 1078,
            deviceScaleFactor: 1,
        })

        // Open internal print URL
        await page.goto(url, {
            waitUntil: ["networkidle0", "load", "domcontentloaded"],
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
