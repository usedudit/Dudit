import * as React from 'react'

export function useHasHover() {
  const [hasHover, setHasHover] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    try {
      const mql = window.matchMedia('(hover: hover)')
      setHasHover(mql.matches)
      
      const onChange = (e: MediaQueryListEvent) => {
        setHasHover(e.matches)
      }
      
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    } catch {
      // Assume that if browser too old to support matchMedia it's likely not a touch device
      setHasHover(true)
    }
  }, [])

  return !!hasHover
}