import { describe, it, expect } from "vitest"
import { getErrorMessage } from "./error-handlers"

describe("error-handlers: getErrorMessage", () => {
  it("translates 'New password should be different from the old password.' with and without trailing dot", () => {
    expect(getErrorMessage("New password should be different from the old password.")).toBe(
      "A nova senha deve ser diferente da senha anterior."
    )
    expect(getErrorMessage("New password should be different from the old password")).toBe(
      "A nova senha deve ser diferente da senha anterior."
    )
    expect(getErrorMessage({ message: "New password should be different from the old password." })).toBe(
      "A nova senha deve ser diferente da senha anterior."
    )
    expect(getErrorMessage({ code: "same_password" })).toBe(
      "A nova senha deve ser diferente da senha anterior."
    )
    expect(getErrorMessage({ message: "Auth error: new password should be different from the old password" })).toBe(
      "A nova senha deve ser diferente da senha anterior."
    )
  })

  it("translates PKCE and cross-device code verifier errors", () => {
    const pkceError1 = "PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared."
    expect(getErrorMessage(pkceError1)).toContain("mesmo navegador ou aparelho onde foi solicitado")

    const pkceError2 = "both auth code and code verifier should be non-empty"
    expect(getErrorMessage(pkceError2)).toContain("mesmo navegador ou aparelho onde foi solicitado")

    expect(getErrorMessage({ code: "pkce_code_verifier_not_found" })).toContain("mesmo navegador ou aparelho onde foi solicitado")
  })
})
