import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

const ROOT = process.cwd()
const SOURCE_DIRS = ["app", "components", "hooks", "lib", "providers"]
const SOURCE_EXTENSIONS = [".ts", ".tsx"]
const SKIPPED_FILES = new Set([
  join("lib", "navigation", "history.ts"),
])
const FORBIDDEN_PATTERN =
  /window\.history\.(?:push|replace)State\(\s*window\.history\.state/

function walk(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...walk(fullPath))
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      files.push(fullPath)
    }
  }

  return files
}

describe("history API usage", () => {
  it("never forwards Next.js internal history state through pushState/replaceState", () => {
    const offenders: string[] = []

    for (const dir of SOURCE_DIRS) {
      const absoluteDir = join(ROOT, dir)
      for (const file of walk(absoluteDir)) {
        const relativePath = relative(ROOT, file)
        if (SKIPPED_FILES.has(relativePath.split("/").join(sep))) continue

        const content = readFileSync(file, "utf8")
        if (FORBIDDEN_PATTERN.test(content)) {
          offenders.push(relativePath)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
