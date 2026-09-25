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
        const isThermal58 = formatParam === "thermal-58"
        const isThermal = formatParam === "thermal" || isThermal58 || urlObj.pathname.includes("/print/caixa")

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
            // Thermal receipt width: 80mm (~302px at 96 DPI) or 58mm (~219px at 96 DPI) for narrow bobina.
            // deviceScaleFactor 2 for crisp fonts & barcodes
            await page.setViewport({
                width: isThermal58 ? 219 : 302,
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

        // Emulate light color scheme
        await page.emulateMediaFeatures([
            { name: "prefers-color-scheme", value: "light" },
        ])

        // Open internal print URL - fast DOM lifecycle
        await page.goto(urlObj.toString(), {
            waitUntil: "domcontentloaded",
            timeout: 10000,
        })

        // Wait for main print container or thermal receipt element to be rendered in DOM
        try {
            await page.waitForSelector(".sale-receipt-thermal-print, .pdf-print-container, .pdf-print-page", {
                timeout: 4000,
            })
        } catch { }

        // Remove dark mode classes and force light color scheme on document
        await page.evaluate(() => {
            document.documentElement.classList.remove("dark")
            document.body.classList.remove("dark")
            document.documentElement.style.colorScheme = "light"
        })

        // Fast check: wait for fonts and images to be ready
        await page.evaluate(async () => {
            await Promise.race([
                document.fonts ? document.fonts.ready : Promise.resolve(),
                new Promise((r) => setTimeout(r, 400)),
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

        // Inject styles ensuring .no-print is removed, dark mode is neutralized, and text is pure black #000000
        await page.addStyleTag({
            content: `
                .no-print { display: none !important; }
                html, body, :root, .dark {
                    background-color: #ffffff !important;
                    color: #000000 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    color-scheme: light !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                .sale-receipt-thermal-print,
                .sale-receipt-thermal-print *,
                .thermal-receipt-root,
                .thermal-receipt-root * {
                    color: #000000 !important;
                    border-color: #000000 !important;
                    -webkit-text-fill-color: #000000 !important;
                    text-shadow: none !important;
                    opacity: 1 !important;
                }
                .sale-receipt-thermal-print {
                    margin: 0 auto !important;
                    background-color: #ffffff !important;
                    box-shadow: none !important;
                    border: none !important;
                }

                /* DRE: prevent table rows and sections from splitting across pages */
                .dre-a4-print .dre-content {
                    overflow: visible !important;
                }
                .dre-a4-print tr,
                .dre-a4-print .break-inside-avoid,
                .dre-a4-print thead tr,
                .dre-a4-print tbody tr {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }
                .dre-a4-print .dre-table {
                    break-inside: auto !important;
                }

                /* Force each page iteration to split into a new page in the PDF */
                .pdf-print-page {
                    page-break-after: always !important;
                    break-after: page !important;
                    position: relative !important;
                    box-shadow: none !important;
                    border: none !important;
                    border-radius: 0 !important;
                }
                .pdf-print-page:last-child {
                    page-break-after: avoid !important;
                    break-after: avoid !important;
                }
            `,
        })

        if (isThermal) {
            // Emulate screen media to ensure layout and dimensions exactly match thermal receipt preview
            await page.emulateMediaType("screen")

            // Calculate exact height of thermal receipt content to create a continuous roll PDF
            const contentHeightPx = await page.evaluate(() => {
                const thermalEl = document.querySelector(".sale-receipt-thermal-print") as HTMLElement | null
                if (thermalEl) {
                    const rect = thermalEl.getBoundingClientRect()
                    return Math.max(thermalEl.scrollHeight, thermalEl.offsetHeight, Math.ceil(rect.height))
                }
                const containerEl = document.querySelector(".pdf-print-container") as HTMLElement | null
                if (containerEl) {
                    const rect = containerEl.getBoundingClientRect()
                    return Math.max(containerEl.scrollHeight, containerEl.offsetHeight, Math.ceil(rect.height))
                }
                return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 400)
            })

            const targetHeightPx = Math.max(Math.ceil(contentHeightPx + 4), 100)

            // Generate exact-width thermal receipt PDF (80mm or narrow 58mm) with continuous height
            const pdfWidth = isThermal58 ? "58mm" : "80mm"
            const pdfBuffer = await page.pdf({
                width: pdfWidth,
                height: `${targetHeightPx}px`,
                printBackground: true,
                margin: {
                    top: "0mm",
                    right: "0mm",
                    bottom: "0mm",
                    left: "0mm",
                },
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
