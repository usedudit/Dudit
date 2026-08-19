import type { Browser } from "puppeteer-core"
import { execSync } from "node:child_process"

/**
 * Server-side function that launches a headless browser, sets authentication cookies,
 * navigates to the print template, and returns a binary PDF buffer.
 */
let globalBrowserPromise: Promise<Browser> | null = null
let globalBrowser: Browser | null = null

async function getBrowser(): Promise<Browser> {
    if (globalBrowser && globalBrowser.isConnected()) {
        return globalBrowser
    }
    if (globalBrowserPromise) {
        return globalBrowserPromise
    }

    globalBrowserPromise = (async () => {
        const puppeteer = (await import("puppeteer-core")).default
        const isProd = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT
        const fs = await import("fs")
        let executablePath = ""

        if (isProd) {
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

            if (!executablePath) {
                try {
                    const sparticuzChromium = (await import("@sparticuz/chromium")).default
                    executablePath = await sparticuzChromium.executablePath()
                } catch { }
            }

            if (!executablePath) {
                throw new Error("Chromium não encontrado no servidor.")
            }
        } else {
            // Local environment browser fallback (Windows / macOS / Linux)
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
        }

        const browserInstance = (await puppeteer.launch({
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
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-breakpad",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-domain-reliability",
                "--disable-extensions",
                "--disable-features=AudioServiceOutOfProcess,TranslateUI",
                "--disable-hang-monitor",
                "--disable-ipc-flooding-protection",
                "--disable-notifications",
                "--disable-offer-store-unmasked-wallet-cards",
                "--disable-popup-blocking",
                "--disable-print-preview",
                "--disable-prompt-on-repost",
                "--disable-renderer-backgrounding",
                "--disable-speech-api",
                "--disable-sync",
                "--hide-scrollbars",
                "--metrics-recording-only",
                "--mute-audio",
                "--no-default-browser-check",
                "--no-first-run",
                "--no-pings",
                "--password-store=basic",
                "--use-mock-keychain",
            ],
            protocolTimeout: 60000,
        })) as unknown as Browser

        browserInstance.on("disconnected", () => {
            globalBrowser = null
            globalBrowserPromise = null
        })

        globalBrowser = browserInstance
        return browserInstance
    })()

    try {
        return await globalBrowserPromise
    } catch (err) {
        globalBrowserPromise = null
        globalBrowser = null
        throw err
    }
}

/**
 * Server-side function that launches a headless browser, sets authentication cookies,
 * navigates to the print template, and returns a binary PDF buffer.
 */
export async function generatePdf(url: string, nextCookies: any[]): Promise<Buffer> {
    const browser = await getBrowser()
    const page = await browser.newPage()

    try {
        const urlObj = new URL(url)
        const formatParam = urlObj.searchParams.get("format")
        const isThermal = formatParam === "thermal" || urlObj.pathname.includes("/print/caixa")

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

        if (isThermal) {
            // Standard thermal receipt width: 80mm (~302px width at 96 DPI, deviceScaleFactor 2 for crisp fonts & barcodes)
            await page.setViewport({
                width: 302,
                height: 800,
                deviceScaleFactor: 2,
            })
        } else {
            // Standard A4 rendering dimensions (794px width at 96 DPI)
            await page.setViewport({
                width: 794,
                height: 1078,
                deviceScaleFactor: 2,
            })
        }

        // Set headless flag so PrintLayout doesn't trigger auto-print timer
        urlObj.searchParams.set("headless", "true")

        // Intercept network requests to abort heavy ads, trackers, media and analytics
        await page.setRequestInterception(true)
        page.on("request", (req) => {
            const resourceType = req.resourceType()
            const reqUrl = req.url()
            if (
                resourceType === "media" ||
                resourceType === "eventsource" ||
                resourceType === "websocket" ||
                reqUrl.includes("googlesyndication") ||
                reqUrl.includes("googleadservices") ||
                reqUrl.includes("doubleclick") ||
                reqUrl.includes("analytics") ||
                reqUrl.includes("sentry")
            ) {
                req.abort().catch(() => {})
                return
            }
            req.continue().catch(() => {})
        })

        // Open internal print URL - fast DOM lifecycle
        await page.goto(urlObj.toString(), {
            waitUntil: "domcontentloaded",
            timeout: 10000,
        })

        // Fast check: wait max 300ms for fonts and images to be ready
        await page.evaluate(async () => {
            await Promise.race([
                document.fonts ? document.fonts.ready : Promise.resolve(),
                new Promise((r) => setTimeout(r, 300)),
            ])
            const images = Array.from(document.images)
            await Promise.all(
                images.map((img) => {
                    if (img.complete) return Promise.resolve()
                    return new Promise((resolve) => {
                        img.onload = resolve
                        img.onerror = resolve
                        setTimeout(resolve, 300)
                    })
                })
            )
        })

        if (isThermal) {
            // Calculate exact height of thermal receipt content to create a continuous roll PDF
            const contentHeightPx = await page.evaluate(() => {
                const thermalEl = document.querySelector(".sale-receipt-thermal-print")
                if (thermalEl) {
                    const rect = thermalEl.getBoundingClientRect()
                    return Math.max(Math.ceil(rect.height), Math.ceil(thermalEl.scrollHeight))
                }
                const containerEl = document.querySelector(".pdf-print-container")
                if (containerEl) {
                    const rect = containerEl.getBoundingClientRect()
                    return Math.max(Math.ceil(rect.height), Math.ceil(containerEl.scrollHeight))
                }
                return Math.max(Math.ceil(document.body.scrollHeight), Math.ceil(document.documentElement.scrollHeight))
            })

            // Generate exact 80mm thermal receipt PDF with continuous height (no A4 white gaps)
            const pdfBuffer = await page.pdf({
                width: "80mm",
                height: `${contentHeightPx + 6}px`,
                printBackground: true,
                margin: {
                    top: "0mm",
                    right: "0mm",
                    bottom: "0mm",
                    left: "0mm",
                },
                pageRanges: "1",
                preferCSSPageSize: false,
            })

            return Buffer.from(pdfBuffer)
        } else {
            // Render standard A4 PDF
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
        }
    } finally {
        await page.close().catch(() => { })
    }
}
