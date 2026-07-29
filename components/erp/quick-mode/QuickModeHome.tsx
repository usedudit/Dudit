'use client';

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    ShoppingCartIcon,
    Package,
    WrenchIcon,
    ChevronRightIcon,
    ChevronLeftIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    StoreIcon,
    QRCodeIcon,
    SettingsIcon,
    ShareIcon,
    RocketIcon,
    InfoIcon,
    BriefcaseIcon,
    WhatsappIcon,
    CreditCardIcon,
    UploadSheetIcon,
    DownloadIcon,
    HelpCircleIcon,
    LinkIcon,
    CopyIcon,
    PlayIcon,
    MailIcon,
    PlusIcon,
} from "@/lib/icons";
import { Button, Badge, ListItem, FormSection, DefaultModal, InfoCard } from "@/components/reusable";
import { Tooltip } from "@/components/reusable/Tooltip"
import { useToast } from "@/hooks/use-toast";
import QuickModeItemCard from "./QuickModeItemCard";
import { deleteProductAction, duplicateProductAction } from "@/app/actions/erp/products";
import { deleteServiceAction, duplicateServiceAction } from "@/app/actions/erp/servicos";
import AlertModal from "@/components/reusable/AlertModal";
import { ERPPageHeader } from "@/components/erp/page-header-state";
import { DashboardLayout } from "@/lib/dashboard-engine/types";

interface QuickModeHomeProps {
    data: DashboardLayout;
    partnerId: string;
}

interface ImportOption {
    label: string;
    description: string;
    icon: string;
    href: string;
    variant: "default" | "outline" | "filled";
}

interface DashboardChecklistItem {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    href?: string;
    tabTarget?: string;
    importOptions?: {
        sellsProducts: boolean;
        sellsServices: boolean;
        isQuickMode: boolean;
        isErpMode: boolean;
    };
}

// ============================================
// SUB-COMPONENTS
// ============================================

function QRCodeCard({ partnerUrl, storeName }: { partnerUrl: string; storeName: string }) {
    const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
    const [copied, setCopied] = useState(false);
    const { toast } = useToast();

    const origin = typeof window !== "undefined" ? window.location.origin : "https://dudit.com.br";
    const profileUrl = `${origin}${partnerUrl}`;

    React.useEffect(() => {
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(profileUrl)}`);
    }, [profileUrl]);

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(profileUrl);
            setCopied(true);
            toast({ title: "Link copiado!", description: "O link do seu perfil foi copiado para a área de transferência." });
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast({ title: "Erro ao copiar", variant: "destructive" });
        }
    };

    const shareProfile = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: storeName,
                    text: `Confira meu perfil na Dudit: ${storeName}`,
                    url: profileUrl,
                });
            } catch (e) {
                if ((e as Error).name !== "AbortError") copyLink();
            }
        } else {
            copyLink();
        }
    };

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 h-full flex flex-row items-center gap-6">
            <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">Seu Perfil de Vendedor</h3>
                <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-4">
                    Compartilhe seu perfil com clientes e receba pedidos direto pela sua vitrine.
                </p>

                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={copyLink}
                    >
                        <CopyIcon className="w-4 h-4" />
                        {copied ? "Copiado!" : "Copiar Link"}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={shareProfile}
                    >
                        <ShareIcon className="w-4 h-4" />
                        Compartilhar
                    </Button>
                </div>
            </div>

            <div className="shrink-0">
                <div className="bg-white dark:bg-dark-surface p-2 rounded-xl border border-brand-border dark:border-dark-border">
                    <img
                        src={qrCodeUrl}
                        alt="QR Code do perfil"
                        className="w-28 h-28"
                    />
                </div>
            </div>
        </div>
    );
}

const shortcutIconMap: Record<string, React.ComponentType<any>> = {
    PlusIcon,
    WrenchIcon,
    ShoppingCartIcon,
    Package,
    StoreIcon,
    SettingsIcon,
    HelpCircleIcon,
    CreditCardIcon,
};

function ShortcutsCard({ shortcuts, sellsProducts, sellsServices }: {
    shortcuts: DashboardLayout["shortcuts"];
    sellsProducts: boolean;
    sellsServices: boolean;
}) {
    const router = useRouter();

    const allShortcuts = [
        ...shortcuts,
        {
            id: "orders",
            label: "Ver Pedidos",
            description: "Acesse seus pedidos recebidos",
            icon: "ShoppingCartIcon",
            href: "/erp/orders"
        },
        {
            id: "products",
            label: "Meu Catálogo",
            description: "Gerencie produtos e serviços",
            icon: "Package",
            href: "/erp/products"
        },
    ];

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 h-full">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                    <RocketIcon size={20} className="text-brand-green" />
                </div>
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Atalhos Rápidos</h3>
            </div>

            <div className="space-y-2">
                {allShortcuts.slice(0, 5).map((shortcut) => (
                    <ListItem
                        key={shortcut.id}
                        icon={shortcutIconMap[shortcut.icon] || RocketIcon}
                        title={shortcut.label}
                        description={shortcut.description}
                        onClick={() => router.push(shortcut.href)}
                        className="border-0 bg-transparent hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 p-2"
                    />
                ))}
            </div>

            <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-brand-green font-bold"
                onClick={() => router.push("/erp/dashboard")}
            >
                Ver dashboard completo <ChevronRightIcon size={16} />
            </Button>
        </div>
    );
}

const helpIconMap: Record<string, React.ComponentType<any>> = {
    HelpCircleIcon,
    MailIcon,
    InfoIcon,
};

function HelpCard() {
    const router = useRouter();

    const helpItems = [
        { label: "Central de Ajuda", description: "Artigos, tutoriais e perguntas frequentes", href: "/ajuda", icon: "HelpCircleIcon" },
        { label: "Fale Conosco", description: "Suporte via chat, e-mail ou WhatsApp", href: "/ajuda/contato", icon: "MailIcon" },
        { label: "Status do Sistema", description: "Verifique o status dos serviços da Dudit", href: "https://status.dudit.com.br", icon: "InfoIcon", external: true },
    ];

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 h-full">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                    <HelpCircleIcon size={20} className="text-brand-green" />
                </div>
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Ajuda e Suporte</h3>
            </div>

            <div className="space-y-2 flex-1">
                {helpItems.map((item) => (
                    <ListItem
                        key={item.label}
                        icon={helpIconMap[item.icon] || HelpCircleIcon}
                        title={item.label}
                        description={item.description}
                        right={item.external ? <LinkIcon className="w-4 h-4 text-brand-inactive-text" /> : <ChevronRightIcon className="text-brand-inactive-text w-4 h-4" />}
                        onClick={() => item.external ? window.open(item.href, "_blank") : router.push(item.href)}
                        className="border-0 bg-transparent hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 p-2"
                    />
                ))}
            </div>
        </div>
    );
}

interface Chapter {
    id: string;
    title: string;
    items: DashboardChecklistItem[];
}

const CHAPTER_CONFIG: { id: string; title: string; itemIds: string[] }[] = [
    { id: "chapter-1", title: "Produtos e Serviços", itemIds: ["items"] },
    { id: "chapter-2", title: "Dados da Loja", itemIds: ["business-data", "showcase"] },
    { id: "chapter-3", title: "Pagamento e Entrega", itemIds: ["payments", "logistics"] },
];

function buildChapters(items: DashboardChecklistItem[]): Chapter[] {
    return CHAPTER_CONFIG
        .map((cfg) => ({
            id: cfg.id,
            title: cfg.title,
            items: cfg.itemIds
                .map((id) => items.find((i) => i.id === id))
                .filter(Boolean) as DashboardChecklistItem[],
        }))
        .filter((ch) => ch.items.length > 0);
}

function ProgressCard({
    checklist,
    onItemClick,
    onImportClick,
}: {
    checklist: DashboardLayout["checklist"];
    onItemClick: (item: DashboardChecklistItem) => void;
    onImportClick: () => void;
}) {
    const [currentChapterIdx, setCurrentChapterIdx] = useState(0);

    if (!checklist || checklist.items.length === 0) return null;

    const chapters = buildChapters(checklist.items);
    const currentChapter = chapters[currentChapterIdx] || chapters[0];

    const chapterCompleted = (ch: Chapter) => ch.items.every((i) => i.completed);

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 h-full flex flex-col">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                    <StoreIcon size={20} className="text-brand-green" />
                </div>
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Primeiros Passos</h3>
            </div>

            <div className="flex items-center gap-1.5 mb-5">
                {chapters.map((ch, idx) => {
                    const done = chapterCompleted(ch);
                    const isActive = idx === currentChapterIdx;
                    return (
                        <button
                            key={ch.id}
                            onClick={() => setCurrentChapterIdx(idx)}
                            className={`h-1.5 flex-1 rounded-full transition-all ${
                                done
                                    ? "bg-brand-green"
                                    : isActive
                                        ? "bg-brand-green/60"
                                        : "bg-brand-gray dark:bg-dark-border"
                            }`}
                        />
                    );
                })}
            </div>

            <div className="flex flex-row gap-6 flex-1 min-h-0">
                <div className="flex flex-col justify-center gap-2 w-[200px] shrink-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">
                        Capítulo {currentChapterIdx + 1} de {chapters.length}
                    </p>
                    <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
                        {currentChapter.title}
                    </h4>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                        {currentChapter.items.length === 1
                            ? currentChapter.items[0].description
                            : `Complete as ${currentChapter.items.length} etapas abaixo para avançar.`}
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                        <button
                            onClick={() => setCurrentChapterIdx((p) => Math.max(0, p - 1))}
                            disabled={currentChapterIdx === 0}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-brand-gray dark:bg-dark-border disabled:opacity-30 hover:bg-brand-gray/70 dark:hover:bg-dark-border/70 transition-colors"
                        >
                            <ChevronLeftIcon size={16} className="text-brand-dark dark:text-dark-heading" />
                        </button>
                        <button
                            onClick={() => setCurrentChapterIdx((p) => Math.min(chapters.length - 1, p + 1))}
                            disabled={currentChapterIdx === chapters.length - 1}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-brand-gray dark:bg-dark-border disabled:opacity-30 hover:bg-brand-gray/70 dark:hover:bg-dark-border/70 transition-colors"
                        >
                            <ChevronRightIcon size={16} className="text-brand-dark dark:text-dark-heading" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-w-0">
                    {currentChapter.items.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => onItemClick(item)}
                            className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all cursor-pointer"
                        >
                            {item.completed ? (
                                <CheckCircleIcon size={22} className="text-brand-green shrink-0" />
                            ) : (
                                <div className="w-[22px] h-[22px] rounded-full border-2 border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                                    <div className="w-2 h-2 rounded-full bg-brand-border dark:bg-dark-border" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold truncate ${item.completed ? 'line-through text-brand-inactive-text dark:text-dark-body' : 'text-brand-dark dark:text-dark-heading'}`}>
                                    {item.title}
                                </p>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                    {item.description}
                                </p>
                            </div>
                            <ChevronRightIcon size={18} className="text-brand-inactive-text shrink-0" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ImportOptionsModal({
    isOpen,
    onClose,
    sellsProducts,
    sellsServices,
    isQuickMode,
    isErpMode,
}: {
    isOpen: boolean;
    onClose: () => void;
    sellsProducts: boolean;
    sellsServices: boolean;
    isQuickMode: boolean;
    isErpMode: boolean;
}) {
    const router = useRouter();

    const productOptions: ImportOption[] = [
        {
            label: "Cadastrar manualmente",
            description: "Crie um novo produto preenchendo os dados",
            icon: "PlusIcon",
            href: "/erp/products?create=true",
            variant: "default",
        },
        {
            label: "Importar via planilha",
            description: "Faça upload de uma planilha Excel/CSV com seus produtos",
            icon: "UploadSheetIcon",
            href: "/erp/products/import",
            variant: "outline",
        },
    ];

    if (isErpMode && sellsProducts) {
        productOptions.splice(1, 0, {
            label: "Importar XML (NF-e)",
            description: "Importe produtos direto da nota fiscal de entrada",
            icon: "DownloadIcon",
            href: "/erp/xml-import",
            variant: "outline",
        });
    }

    const serviceOptions: ImportOption[] = [
        {
            label: "Cadastrar manualmente",
            description: "Crie um novo serviço preenchendo os dados",
            icon: "PlusIcon",
            href: "/erp/servicos?create=true",
            variant: "default",
        },
        {
            label: "Importar via planilha",
            description: "Faça upload de uma planilha Excel/CSV com seus serviços",
            icon: "UploadSheetIcon",
            href: "/erp/servicos/import",
            variant: "outline",
        },
    ];

    const handleNavigate = (href: string) => {
        onClose();
        router.push(href);
    };

    if (!isOpen) return null;

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Adicionar ao Catálogo"
            description={sellsProducts && sellsServices
                ? "Escolha como deseja adicionar itens ao seu catálogo"
                : sellsServices
                    ? "Escolha como deseja adicionar serviços"
                    : "Escolha como deseja adicionar produtos"}
            maxWidth="lg"
            hideHeader={false}
        >
            <div className="space-y-6">
                {sellsProducts && (
                    <FormSection title="Produtos">
                        <div className="space-y-3">
                            {productOptions.map((opt, idx) => (
                                <ListItem
                                    key={idx}
                                    title={opt.label}
                                    description={opt.description}
                                    right={<ChevronRightIcon className="text-brand-inactive-text w-5 h-5 shrink-0" />}
                                    onClick={() => handleNavigate(opt.href)}
                                    className="border-brand-border"
                                />
                            ))}
                        </div>
                    </FormSection>
                )}

                {sellsServices && (
                    <FormSection title="Serviços" hasSeparator={sellsProducts}>
                        <div className="space-y-3">
                            {serviceOptions.map((opt, idx) => (
                                <ListItem
                                    key={idx}
                                    title={opt.label}
                                    description={opt.description}
                                    right={<ChevronRightIcon className="text-brand-inactive-text w-5 h-5 shrink-0" />}
                                    onClick={() => handleNavigate(opt.href)}
                                    className="border-brand-border"
                                />
                            ))}
                        </div>
                    </FormSection>
                )}
            </div>
        </DefaultModal>
    );
}

// ============================================
// ADAPTIVE BOTTOM CARD (Plan / Integrations)
// ============================================

interface FeatureItem {
    icon: React.ComponentType<any>;
    title: string;
    description: string;
}

function getFeatureList(sellsProducts: boolean, sellsServices: boolean, isQuickMode: boolean): FeatureItem[] {
    const features: FeatureItem[] = [
        { icon: StoreIcon, title: "Catálogo Digital", description: "Produtos e serviços com fotos e descrição" },
        { icon: ShareIcon, title: "Perfil Compartilhável", description: "Compartilhe seu link em redes sociais" },
        { icon: ShoppingCartIcon, title: "Pedidos Online", description: "Receba pedidos diretamente pelo sistema" },
    ];

    if (sellsProducts) {
        features.push(
            { icon: Package, title: "Controle de Estoque", description: "Gerencie entrada e saída de produtos" },
            { icon: UploadSheetIcon, title: "Importação em Massa", description: "Importe produtos via planilha" },
        );
    }

    if (sellsServices) {
        features.push(
            { icon: WrenchIcon, title: "Agendamento de Serviços", description: "Clientes agendam serviços online" },
            { icon: BriefcaseIcon, title: "Ordem de Serviço", description: "Controle completo de OS" },
        );
    }

    if (isQuickMode) {
        features.push(
            { icon: QRCodeIcon, title: "QR Code do Perfil", description: "QR Code para vendas rápidas" },
            { icon: LinkIcon, title: "Link de Vendas", description: "Venda direto pelo link do perfil" },
        );
    } else {
        features.push(
            { icon: CreditCardIcon, title: "Gestão Financeira", description: "Fluxo de caixa e controle financeiro" },
            { icon: RocketIcon, title: "DRE Simplificado", description: "Demonstração de resultados automatizada" },
        );
    }

    return features;
}

function AdaptiveBottomCard({
    planSlug,
    isQuickMode,
    sellsProducts,
    sellsServices,
    isWhatsAppConnected,
    isMercadoPagoConnected,
}: {
    planSlug: "free" | "crescer" | "escalar";
    isQuickMode: boolean;
    sellsProducts: boolean;
    sellsServices: boolean;
    isWhatsAppConnected: boolean;
    isMercadoPagoConnected: boolean;
}) {
    const router = useRouter();
    const features = useMemo(
        () => getFeatureList(sellsProducts, sellsServices, isQuickMode),
        [sellsProducts, sellsServices, isQuickMode]
    );
    const [currentSlide, setCurrentSlide] = useState(0);
    const [currentFeature, setCurrentFeature] = useState(0);

    const slides = useMemo(() => {
        const s: string[] = [];
        if (planSlug === "free") s.push("upgrade-crescer");
        if (planSlug === "crescer" || planSlug === "escalar") s.push("integrations");
        if (planSlug === "crescer") s.push("upgrade-escalar");
        if (planSlug === "escalar" && isQuickMode) s.push("erp-mode");
        return s;
    }, [planSlug, isQuickMode]);

    useEffect(() => {
        if (slides.length <= 1) return;
        setCurrentSlide(0);
        const interval = setInterval(() => {
            setCurrentSlide(prev => (prev + 1) % slides.length);
        }, 7000);
        return () => clearInterval(interval);
    }, [slides.length]);

    useEffect(() => {
        if (features.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentFeature(prev => (prev + 1) % features.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [features.length]);

    const slideId = slides[currentSlide] || slides[0];

    function renderSlideContent() {
        switch (slideId) {
            case "upgrade-crescer":
                return (
                    <div className="flex flex-col items-center text-center gap-3">
                        <Badge variant="green" className="bg-brand-green border-none text-white px-3 py-1">
                            RECURSO PREMIUM
                        </Badge>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                            Ative o Plano Crescer
                        </h3>
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                            Aumente seu limite de catálogo para 100 itens, receba pagamentos via Mercado Pago e ative cupons promocionais para vender mais.
                        </p>
                        <Button
                            variant="default"
                            size="sm"
                            className="bg-brand-green hover:bg-brand-green/90 text-white border-none mt-1"
                            onClick={() => router.push("/erp/settings")}
                        >
                            Ver Planos
                        </Button>
                    </div>
                );
            case "upgrade-escalar":
                return (
                    <div className="flex flex-col items-center text-center gap-3">
                        <Badge variant="green" className="bg-brand-green border-none text-white px-3 py-1">
                            GESTÃO COMPLETA
                        </Badge>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                            Migre para o Plano Escalar
                        </h3>
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                            Tenha itens e pedidos ilimitados, financeiro avançado com fluxo de caixa e DRE simplificado.
                        </p>
                        <Button
                            variant="default"
                            size="sm"
                            className="bg-brand-green hover:bg-brand-green/90 text-white border-none mt-1"
                            onClick={() => router.push("/erp/settings")}
                        >
                            Ver Planos
                        </Button>
                    </div>
                );
            case "integrations":
                return (
                    <div className="space-y-3">
                        <ListItem
                            icon={WhatsappIcon}
                            title="WhatsApp Business"
                            description={isWhatsAppConnected ? "Conectado e recebendo pedidos" : "Conecte para receber pedidos no WhatsApp"}
                            right={
                                <Badge variant={isWhatsAppConnected ? "green" : "gray"}>
                                    {isWhatsAppConnected ? "Conectado" : "Desconectado"}
                                </Badge>
                            }
                            onClick={() => router.push("/erp/integrations/whatsapp")}
                            className="border-0 bg-transparent hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 p-3"
                        />
                        <ListItem
                            icon={CreditCardIcon}
                            title="Mercado Pago"
                            description={isMercadoPagoConnected ? "Recebendo pagamentos online" : "Conecte para receber via Pix, cartão e boleto"}
                            right={
                                <Badge variant={isMercadoPagoConnected ? "green" : "gray"}>
                                    {isMercadoPagoConnected ? "Conectado" : "Desconectado"}
                                </Badge>
                            }
                            onClick={() => router.push("/erp/settings?tab=formas-de-pagamento")}
                            className="border-0 bg-transparent hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 p-3"
                        />
                    </div>
                );
            case "erp-mode":
                return (
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center">
                            <RocketIcon size={24} className="text-brand-green" />
                        </div>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                            Modo ERP Completo
                        </h3>
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                            Dashboard financeiro, fluxo de caixa, DRE, controle de estoque e relatórios avançados.
                        </p>
                        <Button
                            variant="default"
                            size="sm"
                            className="bg-brand-green hover:bg-brand-green/90 text-white border-none mt-1"
                            onClick={() => router.push("/erp/dashboard")}
                        >
                            Ir para o Dashboard
                        </Button>
                    </div>
                );
            default:
                return null;
        }
    }

    return (
        <div className={`bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 h-full flex flex-col ${slides.length <= 1 ? '' : 'min-h-[280px]'}`}>
            <div className="flex-1 flex flex-col justify-center">
                {renderSlideContent()}
            </div>

            {features.length > 0 && (
                <>
                    <div className="border-t border-brand-border dark:border-dark-border my-4" />
                    <div className="flex items-center gap-3 min-h-[44px]">
                        <div className="w-8 h-8 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0">
                            {React.createElement(features[currentFeature].icon, {
                                className: "w-4 h-4 text-brand-green",
                            })}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                                {features[currentFeature].title}
                            </p>
                            <p className="text-[11px] text-brand-inactive-text dark:text-dark-body truncate">
                                {features[currentFeature].description}
                            </p>
                        </div>
                    </div>
                </>
            )}

            {slides.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                    {slides.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentSlide(idx)}
                            className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentSlide ? 'bg-brand-green w-4' : 'bg-brand-border dark:bg-dark-border'}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================
// MODE CARD (Switch to ERP)
// ============================================

function ModeCard({ partnerId, onSuccess }: { partnerId: string; onSuccess: () => void }) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleUpgrade = async () => {
        setLoading(true);
        try {
            const { upgradeToERPAction } = await import("@/app/actions/erp/quick-mode");
            const res = await upgradeToERPAction(partnerId);
            if (res.success) {
                toast({ title: "Modo ERP ativado!", description: "Bem-vindo ao modo ERP completo." });
                onSuccess();
            } else {
                toast({ title: "Erro", description: res.error, variant: "destructive" });
            }
        } catch {
            toast({ title: "Erro", description: "Não foi possível ativar o modo ERP", variant: "destructive" });
        }
        setLoading(false);
    };

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6">
            <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center">
                    <RocketIcon size={24} className="text-brand-green" />
                </div>
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                    Desbloqueie o Modo ERP
                </h3>
                <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                    Migre para o modo ERP completo com dashboard financeiro, fluxo de caixa, DRE, controle de estoque e relatórios avançados.
                </p>
                <Button
                    variant="default"
                    size="sm"
                    className="bg-brand-green hover:bg-brand-green/90 text-white border-none w-full"
                    onClick={handleUpgrade}
                    disabled={loading}
                >
                    {loading ? "Ativando..." : "Ativar Modo ERP"}
                </Button>
            </div>
        </div>
    );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function QuickModeHome({ data, partnerId }: QuickModeHomeProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState<any>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [currentImportOptions, setCurrentImportOptions] = useState<DashboardChecklistItem["importOptions"] | null>(null);

    const handleDelete = async () => {
        if (!showDeleteModal) return;
        const { id, itemType } = showDeleteModal;
        setIsDeleting(id);

        const res = itemType === 'product'
            ? await deleteProductAction(id)
            : await deleteServiceAction(id);

        if (res.success) {
            toast({ title: "Item excluído com sucesso" });
            router.refresh();
        } else {
            toast({ title: "Erro ao excluir", description: (res as any).error, variant: "destructive" });
        }
        setIsDeleting(null);
        setShowDeleteModal(null);
    }

    const handleDuplicate = async (item: any) => {
        toast({ title: "Duplicando item..." });
        const res = item.itemType === 'product'
            ? await duplicateProductAction(item.id)
            : await duplicateServiceAction(item.id);

        if (res.success) {
            toast({ title: "Item duplicado com sucesso" });
            router.refresh();
        } else {
            toast({ title: "Erro ao duplicar", description: (res as any).error, variant: "destructive" });
        }
    }

    const getStepAction = (item: DashboardChecklistItem) => {
        if (item.href) {
            router.push(item.href);
        } else if (item.tabTarget) {
            router.push(`/erp/settings?tab=${item.tabTarget}`);
        }
    };

    const handleChecklistItemClick = (item: DashboardChecklistItem) => {
        if (item.importOptions && !item.completed) {
            setCurrentImportOptions(item.importOptions);
            setShowImportModal(true);
        } else {
            getStepAction(item);
        }
    };

    const handleImportClick = () => {
        if (currentImportOptions) {
            setShowImportModal(true);
        }
    };

    return (
        <>
            <ERPPageHeader title={data.storeName || "Início"} />
            <div className="flex flex-col gap-8 pb-20">
                {/* Header com Saudação */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-tight">
                            {data.greeting.title}
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mt-1">
                            {data.greeting.subtitle}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Tooltip text="Configurações">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => router.push('/erp/settings')}
                            >
                                <SettingsIcon className="w-4 h-4" />
                                Configurações
                            </Button>
                        </Tooltip>
                    </div>
                </header>

                {/* Alertas Críticos */}
                {data.alerts.length > 0 && (
                    <div className="flex flex-col gap-4">
                        {data.alerts.map((alert) => (
                            <InfoCard
                                key={alert.id ?? alert.title}
                                title={alert.title}
                                message={alert.description}
                                color={
                                    alert.type === "danger"
                                        ? "orange"
                                        : alert.type === "warning"
                                            ? "red"
                                            : undefined
                                }
                                rightElement={
                                    alert.actionLabel &&
                                    alert.actionHref && (
                                        <Button
                                            variant="outline"
                                            onClick={() => router.push(alert.actionHref!)}
                                        >
                                            {alert.actionLabel}
                                        </Button>
                                    )
                                }
                            />
                        ))}
                    </div>
                )}

                {/* Main Grid - Progress Card (2/3) + QR Code Card (1/3) */}
                < div className="grid grid-cols-1 lg:grid-cols-12 gap-6" >
                    {/* Progress/Onboarding Card - 2/3 width */}
                    < div className="lg:col-span-8" >
                        {
                            data.checklist && (
                                <ProgressCard
                                    checklist={data.checklist}
                                    onItemClick={handleChecklistItemClick}
                                    onImportClick={handleImportClick}
                                />
                            )
                        }
                    </div>

                    {/* QR Code Card - 1/3 width */}
                    <div className="lg:col-span-4">
                        <QRCodeCard partnerUrl={data.partnerUrl} storeName={data.storeName || "Sua Loja"} />
                    </div>
                </div>

                {/* Adaptive Bottom Cards - Plan/Integrations, Shortcuts, Help */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* First Column: Adaptive Card + Mode Card (if quick mode) */}
                    <div className="flex flex-col gap-6">
                        <AdaptiveBottomCard
                            planSlug={data.planSlug}
                            isQuickMode={data.isQuickMode}
                            sellsProducts={data.sellsProducts}
                            sellsServices={data.sellsServices}
                            isWhatsAppConnected={data.integrations.find(i => i.id === "whatsapp")?.status === "connected"}
                            isMercadoPagoConnected={data.integrations.find(i => i.id === "mercadopago")?.status === "connected"}
                        />
                        {data.isQuickMode && (
                            <ModeCard partnerId={partnerId} onSuccess={() => router.refresh()} />
                        )}
                    </div>
                    <ShortcutsCard
                        shortcuts={data.shortcuts}
                        sellsProducts={data.sellsProducts}
                        sellsServices={data.sellsServices}
                    />
                    <HelpCard />
                </div>

                {/* Import Modal */}
                <ImportOptionsModal
                    isOpen={showImportModal}
                    onClose={() => { setShowImportModal(false); setCurrentImportOptions(null); }}
                    sellsProducts={currentImportOptions?.sellsProducts ?? false}
                    sellsServices={currentImportOptions?.sellsServices ?? false}
                    isQuickMode={currentImportOptions?.isQuickMode ?? false}
                    isErpMode={currentImportOptions?.isErpMode ?? false}
                />

                <AlertModal
                    isOpen={!!showDeleteModal}
                    onClose={() => setShowDeleteModal(null)}
                    onConfirm={handleDelete}
                    title="Excluir item?"
                    description={`Tem certeza que deseja excluir "${showDeleteModal?.name}"? Esta ação removerá o item do marketplace permanentemente.`}
                    confirmText={isDeleting ? "Excluindo..." : "Sim, excluir"}
                    cancelText="Cancelar"
                    variant="danger"
                />
            </div >
        </>
    )
}