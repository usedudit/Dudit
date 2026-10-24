/**
 * Downloads and extracts the Infisical CLI binary into node_modules/.bin/infisical.
 *
 * Why: Render/Railway build images lack `curl`/`wget`, and `npm install -g` is
 * blocked for non-root users. We use Node's `https` module (always available)
 * to fetch the tarball, then shell out to `tar` (always present on Linux build
 * images) to extract.
 *
 * The tarball `cli_0.44.6_linux_amd64.tar.gz` contains the binary at the root
 * level named `infisical`, so after extraction the path is predictable:
 *   <extractDir>/infisical
 *
 * Usage:
 *   node scripts/install-infisical.mjs           # downloads if binary missing
 *   node scripts/install-infisical.mjs --force   # downloads even if present
 *
 * Env overrides:
 *   INFISICAL_CLI_VERSION  (default: 0.44.6)
 *   INFISICAL_CLI_OS       (default: linux)
 *   INFISICAL_CLI_ARCH     (default: amd64)
 *   INFISICAL_INSTALL_DIR  (default: <repo>/node_modules/.bin)
 *   INFISICAL_TMP_DIR      (default: /tmp/infisical-download)
 */

import fs from "node:fs";
import https from "node:https";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const VERSION = process.env.INFISICAL_CLI_VERSION || "0.44.6";
const OS_ARCH_OS = process.env.INFISICAL_CLI_OS || "linux";
const ARCH = process.env.INFISICAL_CLI_ARCH || "amd64";
const INSTALL_DIR =
  process.env.INFISICAL_INSTALL_DIR || path.join(repoRoot, "node_modules", ".bin");
const TMP_DIR = process.env.INFISICAL_TMP_DIR || "/tmp/infisical-download";

const force = process.argv.includes("--force");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);

    https
      .get(url, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          console.log(`  ↳ Redirecting to ${res.headers.location}`);
          return download(res.headers.location, dest).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(
            new Error(`Download failed with status ${res.statusCode}: ${url}`),
          );
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", (err) => {
          file.close(() => onError(err));
        });
      })
      .on("error", onError);
  });
}

async function main() {
  const binPath = path.join(INSTALL_DIR, "infisical");

  // Skip if already installed and executable
  if (!force) {
    try {
      fs.accessSync(binPath, fs.constants.X_OK);
      console.log(`✅ infisical already installed at ${binPath}`);
      return;
    } catch {
      // not installed or not executable — continue
    }
  }

  const archiveName = `cli_${VERSION}_${OS_ARCH_OS}_${ARCH}.tar.gz`;
  const url = `https://github.com/Infisical/cli/releases/download/v${VERSION}/${archiveName}`;
  const archivePath = path.join(TMP_DIR, archiveName);

  ensureDir(TMP_DIR);
  ensureDir(INSTALL_DIR);

  console.log(`📥 Downloading infisical v${VERSION} (${OS_ARCH_OS}/${ARCH})...`);
  console.log(`  ${url}`);

  await download(url, archivePath);
  console.log(
    `  → Saved (${(fs.statSync(archivePath).size / 1e6).toFixed(1)} MB)`,
  );

  console.log("📦 Extracting...");
  execSync(`tar -xzf "${archivePath}" -C "${TMP_DIR}"`, { stdio: "pipe" });

  // The binary is at <TMP_DIR>/infisical (root of tarball)
  let extractedBinary = path.join(TMP_DIR, "infisical");

  if (!fs.existsSync(extractedBinary)) {
    // Fallback: search for it
    const found = execSync(`find "${TMP_DIR}" -name "infisical" -type f | head -1`, {
      encoding: "utf-8",
    }).trim();
    if (found) {
      extractedBinary = found;
    } else {
      throw new Error("Binary 'infisical' not found in extracted tarball");
    }
  }

  console.log(`📋 Installing to ${binPath}`);
  fs.copyFileSync(extractedBinary, binPath);
  fs.chmodSync(binPath, 0o755);

  console.log("✅ infisical installed successfully");
  const version = execSync(`"${binPath}" --version`, { encoding: "utf-8" }).trim();
  console.log(`  Version: ${version}`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message || err);
  process.exit(1);
});
