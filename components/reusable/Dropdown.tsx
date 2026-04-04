"use client"

import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from "react"
import { ChevronDownIcon } from "@/lib/icons"
import { useMediaQuery } from "../erp/hooks"
import BottomSheet from "@/components/BottomSheet"
import { createPortal } from "react-dom"

interface DropdownContextType {
  close: () => void
}

const DropdownContext = createContext<DropdownContextType | null>(null)

const useDropdownContext = () => {
  const context = useContext(DropdownContext)
  if (!context) {
    return { close: () => { } }
  }
  return context
}

interface DropdownProps {
  trigger: React.ReactElement<React.HTMLAttributes<HTMLElement>>
  children: React.ReactNode
  align?: "left" | "right"
  width?: string
  contentClasses?: string
  showChevron?: boolean
  onToggle?: (isOpen: boolean) => void
  className?: string
  fullWidth?: boolean
}

// ADICIONEI O 'export' AQUI EMBAIXO V
export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  children,
  align = "left",
  width = "w-56",
  contentClasses = "p-1",
  showChevron = true,
  onToggle,
  fullWidth = true,
  className,
}) => {
  const containerClassName = className
    ? className
    : `inline-block ${fullWidth ? "w-full" : "w-fit"}`;

  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<React.CSSProperties>({})
  const isMobile = useMediaQuery("(max-width: 768px)")

  const handleToggle = useCallback(
    (shouldOpen: boolean) => {
      if (isMobile) {
        setIsOpen(shouldOpen)
        if (onToggle) onToggle(shouldOpen)
        return
      }
      if (shouldOpen) {
        setIsMounted(true)
      } else {
        setIsOpen(false)
      }
      if (onToggle) {
        onToggle(shouldOpen)
      }
    },
    [onToggle, isMobile],
  )

  const updatePosition = useCallback(() => {
    if (triggerRef.current && menuRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const menuHeight = 300
      const shouldOpenUpward = spaceBelow < menuHeight && rect.top > menuHeight

      const styles: React.CSSProperties = {
        position: "fixed",
      }

      if (shouldOpenUpward) {
        styles.bottom = `${window.innerHeight - rect.top + 4}px`
      } else {
        styles.top = `${rect.bottom + 4}px`
      }

      if (width && width !== "w-full") {
        styles.width = width.startsWith("w-") ? "auto" : width
      } else {
        styles.width = `${rect.width}px`
      }

      if (align === "right") {
        styles.right = `${window.innerWidth - rect.right}px`
      } else {
        styles.left = `${rect.left}px`
      }
      setPosition(styles)
    }
  }, [align, width])

  useEffect(() => {
    if (isMounted && !isMobile) {
      const timer = setTimeout(() => {
        updatePosition()
        setIsOpen(true)
      }, 10)
      return () => clearTimeout(timer)
    }
  }, [isMounted, updatePosition, isMobile])

  useEffect(() => {
    if (!isOpen && isMounted && !isMobile) {
      const timer = setTimeout(() => {
        setIsMounted(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen, isMounted, isMobile])

  useEffect(() => {
    if (!isMobile) {
      window.addEventListener("resize", updatePosition)
      return () => window.removeEventListener("resize", updatePosition)
    }
  }, [updatePosition, isMobile])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        !isMobile &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        handleToggle(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)

    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, handleToggle, isMobile])

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleToggle(!isOpen)
  }

  const closeDropdown = useCallback(() => {
    handleToggle(false)
  }, [handleToggle])

  const triggerChildren = showChevron ? (
    <div className="flex items-center justify-between w-full">
      {trigger.props.children}
      <ChevronDownIcon
        className={`w-4 h-4 ml-2 text-brand-inactive-text dark:text-dark-body flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
      />
    </div>
  ) : (
    trigger.props.children
  )

  const clonedTrigger = React.cloneElement(trigger, {
    onClick: handleTriggerClick,
    "aria-haspopup": true,
    "aria-expanded": isOpen,
    children: triggerChildren,
  })

  const originClass = align === "right" ? "origin-top-right" : "origin-top-left"

  if (isMobile) {
    return (
      <div className={containerClassName}>
        {clonedTrigger}
        <BottomSheet isOpen={isOpen} onClose={closeDropdown}>
          <DropdownContext.Provider value={{ close: closeDropdown }}>
            <div className="py-2">{children}</div>
          </DropdownContext.Provider>
        </BottomSheet>
      </div>
    )
  }

  return (
    <div ref={triggerRef} className={containerClassName}>
      {clonedTrigger}
      {isMounted && typeof document !== "undefined" && createPortal(
        <DropdownContext.Provider value={{ close: closeDropdown }}>
          <div
            ref={menuRef}
            style={position}
            className={`z-50 ${width} ${originClass} rounded-md shadow-lg bg-white dark:bg-dark-surface ring-1 ring-black ring-opacity-5 ring-border dark:ring-dark-border transition-all ease-out duration-200 ${isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}
          >
            <div className={contentClasses} role="menu" aria-orientation="vertical">
              {children}
            </div>
          </div>
        </DropdownContext.Provider>,
        document.body
      )}
    </div>
  )
}

interface DropdownItemProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}

export const DropdownItem: React.FC<DropdownItemProps> = ({ children, onClick, className = "" }) => {
  const { close } = useDropdownContext()
  const handleClick = (e: React.MouseEvent) => {
    if (onClick) onClick()
    close()
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex items-center gap-3 w-full text-left px-3 py-2 text-sm text-brand-dark dark:text-dark-heading hover:bg-gray-100 dark:hover:bg-dark-border rounded-md transition-colors duration-150 ${className}`}
      role="menuitem"
    >
      {children}
    </button>
  )
}

export default Dropdown
