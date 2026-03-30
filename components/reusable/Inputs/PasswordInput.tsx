"use client"
import React, { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/reusable"

interface PasswordInputProps extends Omit<React.ComponentProps<typeof Input>, "type" | "suffix"> { }

export const PasswordInput: React.FC<PasswordInputProps> = (props) => {
    const [showPassword, setShowPassword] = useState(false)

    return (
        <Input
            {...props}
            type={showPassword ? "text" : "password"}
            autoComplete={props.autoComplete || "current-password"}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            suffix={
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center"
                    tabIndex={-1}
                >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            }
        />
    )
}
