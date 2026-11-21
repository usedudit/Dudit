"use client"

import { useEffect, useState } from "react"

/**
 * Search state with a debounced mirror value.
 *
 * Declare this BEFORE calling `useEntityPage` and pass the debounced value into
 * the hook (`search: debouncedSearch`) so the query key and fetch function only
 * change after the user stops typing.
 */
export function useDebouncedSearch(delay = 300) {
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), delay)
        return () => clearTimeout(timer)
    }, [search, delay])

    return { search, setSearch, debouncedSearch }
}
