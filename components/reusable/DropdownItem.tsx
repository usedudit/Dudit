import React from "react"

interface DropdownItemProps {
  onClick?: () => void
  children: React.ReactNode
  className?: string
}

const DropdownItem: React.FC<DropdownItemProps> = ({
  onClick,
  children,
  className,
}) => (
  <div
    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium cursor-pointer rounded-md hover:bg-gray-100 dark:hover:bg-dark-border transition-colors ${className}`}
    onClick={(e) => {
      e.stopPropagation()
      if (onClick) onClick()
    }}
  >
    {children}
  </div>
)

export default DropdownItem
