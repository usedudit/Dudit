import { describe, it, expect } from "vitest"
import {
  validateFileName,
  validateFileExtension,
  validateMagicBytes,
  validateUploadRequest,
} from "./file-validator"

describe("file-validator security checks", () => {
  describe("validateFileName", () => {
    it("should accept valid filenames", () => {
      expect(validateFileName("contrato.pdf").valid).toBe(true)
      expect(validateFileName("foto_produto.123.jpg").valid).toBe(true)
    })

    it("should reject filenames with path traversal", () => {
      expect(validateFileName("../../../etc/passwd").valid).toBe(false)
      expect(validateFileName("..\\secrets.txt").valid).toBe(false)
      expect(validateFileName("/usr/bin/sh").valid).toBe(false)
    })

    it("should reject filenames with null bytes", () => {
      expect(validateFileName("exploit.php\0.jpg").valid).toBe(false)
    })

    it("should reject filenames with control or RTLO chars", () => {
      expect(validateFileName("file\x00name.pdf").valid).toBe(false)
      expect(validateFileName("reverse\u202egoeg.txt").valid).toBe(false) // RTLO
    })

    it("should reject filenames that are too long", () => {
      expect(validateFileName("a".repeat(256) + ".pdf").valid).toBe(false)
    })
  })

  describe("validateFileExtension", () => {
    it("should accept allowed extensions", () => {
      expect(validateFileExtension("doc.pdf", [".pdf"]).valid).toBe(true)
      expect(validateFileExtension("sheet.xlsx", [".xlsx"]).valid).toBe(true)
    })

    it("should reject dangerous extensions", () => {
      expect(validateFileExtension("malware.exe", [".exe", ".pdf"]).valid).toBe(false)
      expect(validateFileExtension("shell.php", [".php", ".pdf"]).valid).toBe(false)
    })

    it("should reject double extensions matching known/dangerous types", () => {
      expect(validateFileExtension("contrato.pdf.exe", [".pdf", ".exe"])).toEqual(
        expect.objectContaining({ valid: false })
      )
      expect(validateFileExtension("foto.jpg.php", [".jpg", ".php"])).toEqual(
        expect.objectContaining({ valid: false })
      )
      expect(validateFileExtension("exploit.exe.pdf", [".pdf"])).toEqual(
        expect.objectContaining({ valid: false })
      )
    })

    it("should allow files with dots but no duplicate extensions", () => {
      expect(validateFileExtension("v1.0.final.pdf", [".pdf"]).valid).toBe(true)
    })
  })

  describe("validateMagicBytes", () => {
    it("should accept valid PDF header signature", () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // %PDF-1.4
      expect(validateMagicBytes(pdfBytes, "application/pdf").valid).toBe(true)
    })

    it("should reject forged PDF file starting with different bytes", () => {
      const badBytes = new Uint8Array([0x00, 0x00, 0x00, 0x25, 0x50, 0x44, 0x46])
      expect(validateMagicBytes(badBytes, "application/pdf").valid).toBe(false)
    })

    it("should reject executable signatures globally", () => {
      const mzBytes = new Uint8Array([0x4d, 0x5a, 0x00, 0x01, 0x25, 0x50, 0x44, 0x46]) // MZ signature + PDF payload
      expect(validateMagicBytes(mzBytes, "application/pdf").valid).toBe(false)

      const elfBytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x25, 0x50]) // ELF signature
      expect(validateMagicBytes(elfBytes, "application/pdf").valid).toBe(false)
    })

    it("should scan plain text/csv and reject script injections", () => {
      const safeText = new TextEncoder().encode("Nome,Idade,Cargo\nMurilo,25,Desenvolvedor")
      expect(validateMagicBytes(safeText, "text/csv").valid).toBe(true)

      const maliciousText = new TextEncoder().encode("<html><script>alert(1)</script></html>")
      expect(validateMagicBytes(maliciousText, "text/plain").valid).toBe(false)

      const xssCsv = new TextEncoder().encode('1,2,"<svg onload=alert(1)>"')
      expect(validateMagicBytes(xssCsv, "text/csv").valid).toBe(false)
    })
  })

  describe("validateUploadRequest", () => {
    it("should validate and return metadata for images", () => {
      const res = validateUploadRequest("foto.jpg", "image/jpeg", 2 * 1024 * 1024)
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.kind).toBe("image")
        expect(res.data.extension).toBe(".jpg")
      }
    })

    it("should validate and return metadata for documents", () => {
      const res = validateUploadRequest("contrato.pdf", "application/pdf", 4 * 1024 * 1024)
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.kind).toBe("document")
        expect(res.data.extension).toBe(".pdf")
      }
    })

    it("should reject size limits matching kind constraints", () => {
      // Document max is 10MB, check with 11MB
      const res = validateUploadRequest("grande.pdf", "application/pdf", 11 * 1024 * 1024)
      expect(res.success).toBe(false)
    })
  })
})
