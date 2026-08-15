import { describe, expect, it } from "vitest"
import { parseDatabaseUrl } from "./service"

describe("database backup connection handling", () => {
  it("removes the database password from the pg_dump argument", () => {
    const parsed = parseDatabaseUrl("postgresql://backup-user:p%40ssword@db.example.test:5432/postgres?sslmode=require")

    expect(parsed.password).toBe("p@ssword")
    expect(parsed.safeConnectionString).toContain("backup-user@db.example.test")
    expect(parsed.safeConnectionString).not.toContain("p%40ssword")
    expect(parsed.sslMode).toBe("require")
  })
})
