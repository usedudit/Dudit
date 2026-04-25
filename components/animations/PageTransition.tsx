"use client"

import React, { Suspense } from "react"
import { motion, Variants } from "framer-motion"
import { usePathname, useSearchParams } from "next/navigation"
import { useTransitionDirection } from "@/providers/transition-provider"

interface PageTransitionProps {
  children: React.ReactNode
}

function PageTransitionInner({ children }: PageTransitionProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { direction } = useTransitionDirection()
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // 768px is the md breakpoint (tablet/mobile)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Only apply to marketplace routes and mobile/tablet
  const isMarketplace = pathname ? (!pathname.startsWith("/erp") && !pathname.startsWith("/ddt-admin")) : false

  if (!pathname || !isMarketplace || !isMobile) {
    return <>{children}</>
  }

  const variants: Variants = {
    initial: {
      opacity: 0,
    },
    animate: {
      opacity: 1,
      transition: {
        duration: 0.2,
        ease: "easeOut",
      },
    },
    exit: {
      opacity: 0,
      transition: {
        duration: 0.15,
        ease: "easeIn",
      },
    },
  }

  return (
    <motion.div
      key={`${pathname}${searchParams?.toString()}`}
      custom={direction}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      className="w-full flex-1 flex flex-col"
      // Apply only on mobile/tablet (lg is 1024px)
      style={{
        overflowX: "hidden"
      }}
    >
      <div className="md:contents">
        {/* On desktop, we might want to skip the animation or keep it subtle */}
        {/* But the user specifically asked for tablet/mobile */}
        <div className="md:block contents">
          {children}
        </div>
      </div>
    </motion.div>
  )
}

export function PageTransition(props: PageTransitionProps) {
  return (
    <Suspense fallback={<>{props.children}</>}>
      <PageTransitionInner {...props} />
    </Suspense>
  )
}
