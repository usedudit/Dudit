import React from "react"

interface DropdownItemProps {
    onClick?: () => void
    children: React.ReactNode
    className?: string
    disabled?: boolean
}

const DropdownItem: React.FC<DropdownItemProps> = ({
    onClick,
    children,
    className,
    disabled = false,
}) => (
    <div
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${disabled
            ? "opacity-50 cursor-not-allowed pointer-events-none"
            : "cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-border"
            } ${className}`}
        onClick={(e) => {
            e.stopPropagation()
            if (!disabled && onClick) onClick()
        }}
    >
        {children}
    </div>
)

export default DropdownItem