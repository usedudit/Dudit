"use client"

import React from "react"

import { motion, type Transition } from "framer-motion"
import type { ReactNode } from "react"

const pageTransition: Transition = { duration: 0.2, ease: [0.2, 0, 0.2, 1] }

interface FadeInProps {
  children: ReactNode
  className?: string
  delay?: number
}

export const FadeIn: React.FC<FadeInProps> = ({ children, className = "", delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ ...pageTransition, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export const FadeInStagger: React.FC<{ children: ReactNode; className?: string; staggerDelay?: number }> = ({
  children,
  className = "",
  staggerDelay = 0.05,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={pageTransition}
      className={className}
    >
      {React.Children.map(children, (child, index) => (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...pageTransition, delay: index * staggerDelay }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}
