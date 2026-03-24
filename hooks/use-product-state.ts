"use client"

import { useState, useCallback } from "react"

export function useProductState<T>(initialState: T) {
  const [state, setState] = useState<T>(initialState)
  const [originalState, setOriginalState] = useState<T>(initialState)

  const handleChange = useCallback((name: string, value: any) => {
    setState((prev) => ({
      ...prev,
      [name]: value,
    }))
  }, [])

  const resetState = useCallback(() => {
    setState(originalState)
  }, [originalState])

  const updateOriginalState = useCallback((newState: T) => {
    setState(newState)
    setOriginalState(newState)
  }, [])

  const isDirty = JSON.stringify(state) !== JSON.stringify(originalState)

  return {
    state,
    setState,
    originalState,
    setOriginalState,
    handleChange,
    resetState,
    updateOriginalState,
    isDirty,
  }
}
