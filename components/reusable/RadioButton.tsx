"use client"

import type React from "react"
import { useState, useEffect } from "react"

interface RadioButtonProps {
    name: string
    value: string
    checked: boolean
    onChange: () => void
    label?: React.ReactNode
}

const RadioButton: React.FC<RadioButtonProps> = ({ name, value, checked, onChange, label }) => {
    const [isAnimatingIn, setIsAnimatingIn] = useState(false)
    const [isAnimatingOut, setIsAnimatingOut] = useState(false)
    const [wasChecked, setWasChecked] = useState(checked)

    useEffect(() => {
        if (checked && !wasChecked) {
            setIsAnimatingIn(true)
            setIsAnimatingOut(false)
            setTimeout(() => setIsAnimatingIn(false), 250)
        } else if (!checked && wasChecked) {
            setIsAnimatingOut(true)
            setIsAnimatingIn(false)
            setTimeout(() => setIsAnimatingOut(false), 200)
        }
        setWasChecked(checked)
    }, [checked, wasChecked])

    const dotClasses = [
        "radio-dot",
        isAnimatingIn && "is-animating-in",
        isAnimatingOut && "is-animating-out",
        checked && !isAnimatingIn && !isAnimatingOut && "is-checked-statically",
    ]
        .filter(Boolean)
        .join(" ")

    return (
        <label
            className={`
        relative flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all duration-200 group
      `}
        >
            <div className="relative flex items-center">
                <input
                    type="radio"
                    name={name}
                    value={value}
                    checked={checked}
                    onChange={onChange}
                    className="sr-only peer"
                />
                <div
                    className={`
            w-5 h-5 rounded-full border-1 
            flex items-center justify-center
            transition-all duration-200 ease-out
            ${checked
                            ? "bg-brand-green border-brand-green"
                            : "bg-white border-brand-border dark:border-brand-border dark:bg-dark-surface group-hover:border-brand-green/60 dark:group-hover:border-brand-green/60"
                        }
          `}
                >
                    <div
                        className={`${dotClasses} w-2 h-2 rounded-full bg-white`}
                    />
                </div>
            </div>

            {label && (
                <span
                    className={`text-sm font-medium select-none transition-colors ${checked ? "text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text dark:text-dark-body"
                        }`}
                >
                    {label}
                </span>
            )}
        </label>
    )
}

export { RadioButton }
export default RadioButton
