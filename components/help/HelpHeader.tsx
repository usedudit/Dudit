"use client"

import React from "react"
import Link from "next/link"
import { MenuIcon, XIcon, SearchIcon, InstagramIcon, FacebookIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"

export default function HelpHeader({ onToggleMenu, menuOpen }: { onToggleMenu: () => void, menuOpen: boolean }) {
    return (
        <header className="h-[72px] bg-white border-b border-gray-100 flex items-center px-4 lg:px-8 sticky top-0 z-40 w-full">
            <div className="flex items-center gap-4 w-full max-w-[1440px] mx-auto">
                {/* Mobile Menu Toggle */}
                <button 
                    onClick={onToggleMenu}
                    className="lg:hidden p-2 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                >
                    {menuOpen ? <XIcon /> : <MenuIcon />}
                </button>

                {/* Logo */}
                <Link href="/" className="flex items-center gap-2">
                    <img 
                        src="https://img.dudit.com.br/static/Logo.png" 
                        alt="Dudit" 
                        className="h-7 w-auto" 
                    />
                    <div className="h-4 w-[1px] bg-gray-200 mx-1 hidden sm:block" />
                    <span className="text-sm font-bold text-gray-900 hidden sm:block whitespace-nowrap">Central de ajuda</span>
                </Link>

                {/* Desktop Search Placeholder (Matches Sidebar Search) */}
                <div className="hidden lg:flex items-center ml-8 max-w-md w-full relative">
                    {/* Placeholder or real search if needed here */}
                </div>

                {/* Right Actions */}
                <div className="ml-auto flex items-center gap-2 sm:gap-4">
                    <div className="hidden md:flex items-center gap-4 mr-4">
                        <Link href="https://instagram.com" className="text-gray-400 hover:text-gray-900 transition-colors">
                            <InstagramIcon size={20} />
                        </Link>
                        <Link href="https://facebook.com" className="text-gray-400 hover:text-gray-900 transition-colors">
                            <FacebookIcon size={20} />
                        </Link>
                    </div>
                    <Button variant="outline" className="hidden sm:flex text-xs h-9 px-4">Ir para o site</Button>
                    <button className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg lg:hidden">
                        <SearchIcon />
                    </button>
                </div>
            </div>
        </header>
    )
}
