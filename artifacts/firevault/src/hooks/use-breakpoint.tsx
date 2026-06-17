import * as React from "react"

const TABLET_MIN  = 768
const DESKTOP_MIN = 1200

export type Breakpoint = "mobile" | "tablet" | "desktop"

function getBreakpoint(width: number): Breakpoint {
  if (width < TABLET_MIN)  return "mobile"
  if (width < DESKTOP_MIN) return "tablet"
  return "desktop"
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = React.useState<Breakpoint>(() =>
    typeof window !== "undefined" ? getBreakpoint(window.innerWidth) : "desktop"
  )

  React.useEffect(() => {
    const mqlTablet  = window.matchMedia(`(min-width: ${TABLET_MIN}px)`)
    const mqlDesktop = window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`)
    const update = () => setBp(getBreakpoint(window.innerWidth))
    mqlTablet.addEventListener("change", update)
    mqlDesktop.addEventListener("change", update)
    update()
    return () => {
      mqlTablet.removeEventListener("change", update)
      mqlDesktop.removeEventListener("change", update)
    }
  }, [])

  return bp
}

export function useIsMobile()  { return useBreakpoint() === "mobile"  }
export function useIsTablet()  { return useBreakpoint() === "tablet"  }
export function useIsDesktop() { return useBreakpoint() === "desktop" }
