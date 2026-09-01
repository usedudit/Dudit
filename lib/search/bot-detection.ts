/**
 * Detects bot/scanner searches that should not be recorded in telemetry.
 * These are typically security scanners, crawlers, or automated tools
 * that probe for files like phpinfo.php, manifest.json, etc.
 */
export function isBotSearch(query: string): boolean {
    const q = query.toLowerCase().trim()

    // File extensions commonly targeted by scanners
    const botFilePatterns = [
        /\.php$/i,
        /\.php\//i,
        /\.json$/i,
        /\.png$/i,
        /\.jpg$/i,
        /\.jpeg$/i,
        /\.gif$/i,
        /\.svg$/i,
        /\.css$/i,
        /\.js$/i,
        /\.txt$/i,
        /\.xml$/i,
        /\.env$/i,
        /\.git/i,
        /\.htaccess/i,
        /\.htpasswd/i,
        /\.sql$/i,
        /\.bak$/i,
        /\.old$/i,
        /\.tmp$/i,
        /\.log$/i,
        /\.config$/i,
    ]

    // Specific scanner probe patterns
    const scannerPatterns = [
        "phpinfo",
        "wp-admin",
        "wp-login",
        "wp-content",
        "wp-includes",
        "xmlrpc",
        "admin.php",
        "login.php",
        "config.php",
        "setup.php",
        "install.php",
        "backup",
        "shell",
        "webshell",
        "cmd.php",
        "c99",
        "r57",
        "eval(",
        "base64",
        "/etc/passwd",
        "/etc/shadow",
        "proc/self",
        "cgi-bin",
        ".git/",
        ".env",
        "debug",
        "test.php",
        "info.php",
        "server-status",
        "server-info",
        "elmah.axd",
        "trace.axd",
        "web.config",
        "crossdomain.xml",
        "favicon.ico",
        "robots.txt",
        "sitemap.xml",
        "manifest.json",
        "browserconfig.xml",
        "security.txt",
        "humans.txt",
    ]

    // Check for file extensions
    for (const pattern of botFilePatterns) {
        if (pattern.test(q)) return true
    }

    // Check for scanner probe patterns
    for (const pattern of scannerPatterns) {
        if (q.includes(pattern)) return true
    }

    // Check if query looks like a file path (contains slashes and file-like extensions)
    if (q.includes("/") && /\.\w{2,4}$/.test(q)) return true

    // Check for very short queries that are likely noise
    if (q.length < 2) return true

    return false
}
