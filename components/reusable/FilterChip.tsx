"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { XIcon } from "@/lib/icons"

interface FilterChipProps {
    label: string
    value: string
    onRemove: () => void
    tooltip?: string
}

const FilterChip: React.FC<FilterChipProps> = ({
    label,
    value,
    onRemove,
    tooltip,
}) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        title={tooltip || value}
    >
        <Badge
            variant="gray"
            className="flex items-center gap-1 pr-1 py-2 cursor-help max-w-full truncate"
        >
            <span className="opacity-70 font-normal mr-1 whitespace-nowrap">{label}:</span>
            <span className="font-bold truncate max-w-[150px] text-brand-dark dark:text-dark-heading">{value}</span>
            <button
                onClick={onRemove}
                className="hover:bg-black/10 dark:hover:bg-white/20 rounded-full p-0.5 ml-1 transition-colors shrink-0"
            >
                <XIcon className="w-3 h-3" />
            </button>
        </Badge>
    </motion.div>
)

export default FilterChip
