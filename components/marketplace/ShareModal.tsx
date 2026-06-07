"use client"

import { useState, useEffect } from "react"
import {
    ShareIcon,
    CheckCircleIcon,
    CopyIcon,
    TwitterIcon,
    FacebookIcon,
    WhatsappIcon,
    LinkedinIcon,
    TelegramIcon,
    XIcon
} from "@/lib/icons"
import { Button, Input, DefaultModal, Separator } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"

interface ShareModalProps {
    isOpen: boolean
    onClose: () => void
    url: string
    title: string
    shareMessage: string
    label?: string
}

export function ShareModal({
    isOpen,
    onClose,
    url,
    title,
    shareMessage,
    label = "Link"
}: ShareModalProps) {
    const [isLinkCopied, setIsLinkCopied] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const { success } = useNotification()

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const fullShareMessage = `${shareMessage}\n${url}`

    const socials = [
        {
            icon: WhatsappIcon,
            name: "WhatsApp",
            color: "bg-[#25D366]",
            url: `https://api.whatsapp.com/send?text=${encodeURIComponent(fullShareMessage)}`
        },
        {
            icon: FacebookIcon,
            name: "Facebook",
            color: "bg-[#1877F2]",
            url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
        },
        {
            icon: TwitterIcon,
            name: "X",
            color: "bg-black",
            url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`
        },
        {
            icon: TelegramIcon,
            name: "Telegram",
            color: "bg-[#26A5E4]",
            url: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`
        },
        {
            icon: LinkedinIcon,
            name: "Linkedin",
            color: "bg-[#0A66C2]",
            url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
        }
    ]

    if (!isMounted) return null

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={() => {
                onClose()
                setIsLinkCopied(false)
            }}
            maxWidth="md"
            hideHeader={true}
        >
            <div className="flex flex-col relative">
                {/* Close X Button - Desktop Only */}
                <button
                    onClick={() => {
                        onClose()
                        setIsLinkCopied(false)
                    }}
                    className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-brand-dark dark:text-dark-heading transition-colors hidden md:flex"
                    title="Fechar"
                >
                    <XIcon size={18} />
                </button>

                <div className="h-[200px] rounded-2xl flex items-end justify-center mb-8 relative overflow-hidden bg-[#eaf7f0]">
                    <img
                        src="https://img.dudit.com.br/static/illustrations/CompartilharItem.png"
                        alt="Compartilhar Item"
                        className="w-64 h-auto object-contain transform translate-y-6"
                    />
                </div>
            </div>

            {/* Modal body content */}
            <h4 className="text-brand-dark dark:text-dark-heading text-xl font-bold mb-2 text-center">
                Gostou? Espalhe a novidade!
            </h4>
            <p className="text-brand-inactive-text dark:text-dark-body text-sm max-w-sm mx-auto mb-6 text-center leading-relaxed">
                Compartilhe com seus amigos e ajude mais pessoas a descobrirem!
            </p>

            <div className="w-full space-y-6">
                <div>
                    <div className="flex gap-2 items-end">
                        <Input
                            label={label}
                            value={url}
                            readOnly
                            className="flex-1"
                        />
                        <Button
                            variant="outline"
                            className="shrink-0 h-[42px] w-[42px] p-0 mb-1 flex items-center justify-center"
                            onClick={() => {
                                navigator.clipboard.writeText(url)
                                setIsLinkCopied(true)
                                success("Sucesso", "Link copiado para a área de transferência!")
                                setTimeout(() => setIsLinkCopied(false), 2000)
                            }}
                        >
                            {isLinkCopied ? <CheckCircleIcon size={20} className="text-brand-green" /> : <CopyIcon size={20} />}
                        </Button>
                    </div>
                </div>

                <Separator />

                <div>
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-body truncate block mb-4">
                        Compartilhar em:
                    </label>
                    <div className="flex items-center justify-center gap-4 sm:gap-6 pb-2">
                        {socials.map((social) => (
                            <a
                                key={social.name}
                                href={social.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex flex-col items-center gap-2 group transition-transform hover:scale-105"
                            >
                                <div className={`${social.color} w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white transition-all shadow-sm`}>
                                    <social.icon size={24} />
                                </div>
                                <span className="text-[10px] sm:text-xs font-medium text-brand-inactive-text group-hover:text-brand-dark transition-colors">
                                    {social.name}
                                </span>
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </DefaultModal>
    )
}

export default ShareModal
