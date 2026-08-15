import { describe, expect, it } from "vitest"
import { createBackupFileName, parseBackupTimestamp } from "./format"

describe("database backup format", () => {
  it("creates a timestamped encrypted backup name", () => {
    const name = createBackupFileName(new Date("2026-08-15T12:34:56.000Z"))
    expect(name).toBe("dudit-db-backup-2026-08-15T12-34-56Z.dump.gz.enc")
  })

  it("parses backup dates for retention", () => {
    expect(parseBackupTimestamp("backups/dudit-db-backup-2026-08-15T12-34-56Z.dump.gz.enc")?.toISOString())
      .toBe("2026-08-15T12:34:56.000Z")
    expect(parseBackupTimestamp("backups/unrelated-file.txt")).toBeNull()
  })
})
