"use client"

import React, { useState, useRef, useEffect } from "react"
import type { EntityType } from "@/lib/erp/import/types"
import { getFieldsForEntity } from "@/lib/erp/import/field-registry"
import { ChevronDownIcon, CheckIcon } from "@/lib/icons"

interface MappingDropdownProps {
  currentField: string | null
  currentLabel: string
  isCustom: boolean
  entityType: EntityType
  onChange: (field: string | null, isCustom: boolean, label: string) => void
}

export function MappingDropdown({
  currentField,
  currentLabel,
  isCustom,
  entityType,
  onChange,
}: MappingDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fields = React.useMemo(() => {
    const f = getFieldsForEntity(entityType)
    return [{ name: "__spec__", label: "Especificação" }, ...f.map((x) => ({ name: x.name, label: x.label }))]
  }, [entityType])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const selected = isCustom
    ? { name: "__spec__", label: `Especificação: ${currentLabel}` }
    : fields.find((f) => f.name === currentField) || fields[0]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs border w-full text-left ${
          isCustom
            ? "border-purple-200 bg-purple-50 text-purple-700"
            : "border-gray-200 bg-white text-gray-700"
        }`}
      >
        <span className="flex-1 truncate">{selected?.label || "Selecionar"}</span>
        <ChevronDownIcon className="w-3 h-3 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {fields.map((f) => {
            const isActive = f.name === "__spec__" ? isCustom : f.name === currentField
            return (
              <button
                key={f.name}
                type="button"
                onClick={() => {
                  if (f.name === "__spec__") {
                    onChange(null, true, currentLabel)
                  } else {
                    onChange(f.name, false, f.label)
                  }
                  setOpen(false)
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50 ${
                  isActive ? "bg-blue-50 text-blue-700" : "text-gray-700"
                }`}
              >
                {isActive && <CheckIcon className="w-3 h-3 flex-shrink-0" />}
                <span className={isActive ? "" : "ml-5"}>{f.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
