import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { pushUrl, replaceUrl, updateUrl } from "./history"

function resetLocation() {
  window.history.replaceState(null, "", "/erp/produtos")
}

describe("navigation history helpers", () => {
  beforeEach(() => {
    resetLocation()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("pushUrl passes null instead of Next.js internal state", () => {
    const pushState = vi.spyOn(window.history, "pushState")

    pushUrl("/erp/produtos?edit=123")

    expect(pushState).toHaveBeenCalledTimes(1)
    expect(pushState.mock.calls[0][0]).toBeNull()
    expect(pushState.mock.calls[0][2]).toBe("/erp/produtos?edit=123")
    expect(window.location.pathname + window.location.search).toBe("/erp/produtos?edit=123")
  })

  it("replaceUrl passes null instead of Next.js internal state", () => {
    const replaceState = vi.spyOn(window.history, "replaceState")

    replaceUrl("/erp/clientes?view=999")

    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState.mock.calls[0][0]).toBeNull()
    expect(replaceState.mock.calls[0][2]).toBe("/erp/clientes?view=999")
  })

  it("does not touch history when the URL is unchanged", () => {
    const pushState = vi.spyOn(window.history, "pushState")
    const replaceState = vi.spyOn(window.history, "replaceState")

    pushUrl("/erp/produtos")
    replaceUrl("http://localhost:3000/erp/produtos")

    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it("updateUrl respects the requested mode", () => {
    const pushState = vi.spyOn(window.history, "pushState")
    const replaceState = vi.spyOn(window.history, "replaceState")

    updateUrl("/erp/produtos?view=1", "push")
    updateUrl("/erp/produtos?view=2", "replace")

    expect(pushState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledTimes(1)
  })

  it("preserves hash and search when resolving relative URLs", () => {
    const pushState = vi.spyOn(window.history, "pushState")

    pushUrl("?tab=empresa#dados")

    expect(pushState.mock.calls[0][2]).toBe("/erp/produtos?tab=empresa#dados")
  })
})
