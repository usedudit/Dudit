"use client"

import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/reusable/Button"
import { Badge } from "@/components/reusable/Badge"
import {
    GridLines,
    SectionHeader,
    Navbar,
    Footer,
    CTA,
    FaqSection,
} from "@/components/InstitucionalShared"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"

export interface SegmentFeature {
    label: string
    title: string
    description: string
    mockup: React.ReactNode
}

export interface SegmentBenefit {
    icon: React.ReactNode
    title: string
    description: string
}

export interface SegmentFaqItem {
    question: string
    answer: string
}

interface SegmentLandingProps {
    schema: Record<string, unknown>
    badge: { text: string; icon: React.ReactElement<{ className?: string }> }
    title: React.ReactNode
    description: string
    heroMockup: React.ReactNode
    features: {
        subtitle: string
        title: string
        lead: string
        items: SegmentFeature[]
    }
    benefits: {
        subtitle: string
        title: string
        items: SegmentBenefit[]
    }
    faq: {
        title: string
        description?: string
        items: SegmentFaqItem[]
    }
}

const DEFAULT_PRIMARY_CTA = { label: "Começar Gratuitamente", href: "/auth/login?mode=partner" }
const DEFAULT_SECONDARY_CTA = { label: "Ver Planos", href: "/institucional/planos" }

export default function SegmentLanding({
    schema,
    badge,
    title,
    description,
    heroMockup,
    features,
    benefits,
    faq,
}: SegmentLandingProps) {
    const router = useRouter()

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio')
        else if (page === 'start-selling') router.push('/auth/login?mode=partner')
        else if (page === 'explore') router.push('/')
        else if (page === 'segments') router.push('/institucional/segmentos')
        else if (page === 'pricing') router.push('/institucional/planos')
        else if (page === 'about') router.push('/institucional/sobre')
        else if (page === 'terms') router.push('/institucional/termos')
        else if (page === 'privacidade') router.push('/institucional/privacidade')
        else router.push('/')
    }

    return (
        <div className="min-h-screen bg-white dark:bg-dark-surface">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schema) }}
            />

            <Navbar onNavigate={onNavigate} />

            <main>
                <section className="relative bg-white dark:bg-dark-surface pt-32 pb-20 overflow-hidden flex flex-col justify-center">
                    <GridLines />
                    <div className="flex-1 flex flex-col max-w-[1400px] w-full mx-auto px-4 relative z-10">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            <motion.div
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6 }}
                            >
                                <Badge variant="green" icon={badge.icon} className="mb-6">
                                    {badge.text}
                                </Badge>

                                <h1 className="text-5xl font-bold text-brand-dark dark:text-dark-heading mb-6 leading-tight">
                                    {title}
                                </h1>

                                <p className="text-brand-inactive-text text-lg md:text-xl mb-8 max-w-lg leading-relaxed">
                                    {description}
                                </p>

                                <div className="flex flex-wrap gap-4">
                                    <Button asChild size="lg">
                                        <Link href={DEFAULT_PRIMARY_CTA.href} prefetch={false}>
                                            {DEFAULT_PRIMARY_CTA.label}
                                        </Link>
                                    </Button>
                                    <Button asChild size="lg" variant="outline">
                                        <Link href={DEFAULT_SECONDARY_CTA.href} prefetch={false}>
                                            {DEFAULT_SECONDARY_CTA.label}
                                        </Link>
                                    </Button>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.8, delay: 0.2 }}
                                className="relative flex items-center justify-center"
                            >
                                <div className="relative z-10 w-full flex items-center justify-center">
                                    {heroMockup}
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                        <SectionHeader subtitle={features.subtitle} title={features.title} />
                        <p className="text-brand-inactive-text max-w-2xl mb-16 text-lg -mt-8">
                            {features.lead}
                        </p>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {features.items.map((feature, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    viewport={{ once: true }}
                                    className="group flex flex-col justify-between"
                                >
                                    <div className="bg-brand-slate dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center">
                                        {feature.mockup}
                                    </div>
                                    <div className="pt-5">
                                        <span className="text-xs font-bold text-brand-green block mb-1">{feature.label}</span>
                                        <h4 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1">{feature.title}</h4>
                                        <p className="text-brand-inactive-text text-sm leading-relaxed">{feature.description}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="relative py-24 bg-white dark:bg-dark-surface overflow-hidden border-t border-gray-100 dark:border-dark-border">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                        <SectionHeader subtitle={benefits.subtitle} title={benefits.title} />

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 mt-8">
                            {benefits.items.map((item, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: idx * 0.1 }}
                                    className={`py-8 px-8 ${idx < benefits.items.length - 1 ? 'md:border-r md:border-dashed md:border-brand-border dark:border-dark-border' : ''} ${idx < benefits.items.length - 1 ? 'border-b md:border-b-0 border-brand-border dark:border-dark-border' : ''}`}
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-brand-dark rounded-full flex items-center justify-center shrink-0">
                                            {item.icon}
                                        </div>
                                        <h4 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{item.title}</h4>
                                    </div>
                                    <p className="text-brand-inactive-text text-sm leading-relaxed">
                                        {item.description}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                <FaqSection title={faq.title} description={faq.description} items={faq.items} />

                <CTA onNavigate={onNavigate} />
            </main>

            <Footer onNavigate={onNavigate} />
        </div>
    )
}
