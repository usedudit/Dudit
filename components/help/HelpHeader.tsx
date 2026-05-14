"use client"

import React from "react"
import Link from "next/link"
import { MenuIcon, XIcon, SearchIcon, InstagramIcon, FacebookIcon } from "@/lib/icons"
import { Button, Input } from "@/components/reusable"

export default function HelpHeader({ 
    onToggleMenu, 
    menuOpen,
    searchQuery,
    setSearchQuery
}: { 
    onToggleMenu: () => void, 
    menuOpen: boolean,
    searchQuery: string,
    setSearchQuery: (val: string) => void
}) {
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
                <Link href="/" className="flex items-center gap-2 shrink-0">
                    <img 
                        src="https://img.dudit.com.br/static/Logo.png" 
                        alt="Dudit" 
                        className="h-7 w-auto" 
                    />
                    <div className="h-4 w-[1px] bg-gray-200 mx-1 hidden sm:block" />
                    <span className="text-sm font-bold text-gray-900 hidden sm:block whitespace-nowrap">Central de ajuda</span>
                </Link>

                {/* Center Search */}
                <div className="hidden lg:flex items-center flex-1 justify-center px-8">
                    <div className="max-w-md w-full">
                        <Input
                            variant="full-rounded"
                            placeholder="Perguntar ou buscar..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            prefix={<SearchIcon size={18} className="text-gray-400" />}
                            className="w-full"
                        />
                    </div>
                </div>

                {/* Right Actions */}
                <div className="ml-auto flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        className="rounded-full w-10 h-10 p-0 hidden sm:flex"
                        onClick={() => window.open("https://instagram.com", "_blank")}
                    >
                        <InstagramIcon size={18} />
                    </Button>
                    <Button 
                        variant="outline" 
                        className="rounded-full w-10 h-10 p-0 hidden sm:flex"
                        onClick={() => window.open("https://facebook.com", "_blank")}
                    >
                        <FacebookIcon size={18} />
                    </Button>
                    
                    <button className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg lg:hidden">
                        <SearchIcon />
                    </button>
                </div>
            </div>
        </header>
    )
}

