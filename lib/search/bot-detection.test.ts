import { describe, expect, it } from "vitest"
import { isBotSearch } from "./bot-detection"

describe("isBotSearch", () => {
    it("identifies scanner file extensions", () => {
        expect(isBotSearch("phpinfo.php")).toBe(true)
        expect(isBotSearch("index.php/test")).toBe(true)
        expect(isBotSearch(".env")).toBe(true)
        expect(isBotSearch("config.json")).toBe(true)
        expect(isBotSearch("dump.sql")).toBe(true)
    })

    it("identifies known scanner probe strings", () => {
        expect(isBotSearch("wp-admin")).toBe(true)
        expect(isBotSearch("wp-login")).toBe(true)
        expect(isBotSearch("xmlrpc")).toBe(true)
        expect(isBotSearch("/etc/passwd")).toBe(true)
        expect(isBotSearch("eval(")).toBe(true)
    })

    it("identifies path-like queries with file extensions", () => {
        expect(isBotSearch("some/path/file.txt")).toBe(true)
    })

    it("identifies queries that are too short", () => {
        expect(isBotSearch("a")).toBe(true)
        expect(isBotSearch("")).toBe(true)
    })

    it("allows valid search queries", () => {
        expect(isBotSearch("camiseta")).toBe(false)
        expect(isBotSearch("iphone 15 pro max")).toBe(false)
        expect(isBotSearch("reparo de celular")).toBe(false)
        expect(isBotSearch("pizzaria")).toBe(false)
    })
})
