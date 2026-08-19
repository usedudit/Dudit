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
    FacebookIcon,
    XIcon,
    TelegramIcon,
    LinkedinIcon,
    SparklesIcon,
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
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal";
import { PLAN_UPGRADE_MASCOTS } from "@/lib/subscription/plan-tier";
import { getHardcodedPlan } from "@/lib/subscription/feature-labels";

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
    const [showShareOptions, setShowShareOptions] = useState(false);
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
                setShowShareOptions(false);
            } catch (e) {
                if ((e as Error).name !== "AbortError") copyLink();
            }
        } else {
            setShowShareOptions(!showShareOptions);
        }
    };

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[280px] h-full flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 min-w-0 flex flex-col justify-between h-full w-full">
                <div>
                    <div className="flex items-start gap-4">
                        <div className="bg-brand-gray/60 dark:bg-dark-border/40 p-2.5 rounded-2xl border border-brand-border/60 dark:border-dark-border/60 shrink-0">
                            {qrCodeUrl ? (
                                <img
                                    src={qrCodeUrl}
                                    alt="QR Code do perfil"
                                    className="w-20 h-20 rounded-lg object-contain"
                                />
                            ) : (
                                <div className="w-20 h-20 bg-brand-gray dark:bg-dark-border rounded-lg animate-pulse" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1 leading-snug">
                                Seu Perfil de Vendedor
                            </h3>
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                Compartilhe seu perfil com clientes e receba pedidos direto pela sua vitrine.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-4">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 rounded-full font-semibold text-xs sm:text-sm"
                            onClick={copyLink}
                        >
                            <CopyIcon className="w-4 h-4" />
                            {copied ? "Copiado!" : "Copiar Link"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 rounded-full font-semibold text-xs sm:text-sm"
                            onClick={shareProfile}
                        >
                            <ShareIcon className="w-4 h-4" />
                            Compartilhar
                        </Button>
                    </div>

                    {showShareOptions && (
                        <div className="mt-3 p-3 bg-brand-gray/30 dark:bg-dark-border/30 rounded-xl border border-brand-border dark:border-dark-border">
                            <p className="text-xs font-medium text-brand-dark dark:text-dark-heading mb-2">Compartilhar via:</p>
                            <div className="flex gap-2 flex-wrap">
                                <a
                                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Confira meu perfil na Dudit: ${storeName} ${profileUrl}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-8 h-8 rounded-full bg-[#25D366] hover:bg-[#25D366]/90 flex items-center justify-center transition-transform hover:scale-105"
                                    title="WhatsApp"
                                >
                                    <WhatsappIcon size={16} className="text-white" />
                                </a>
                                <a
                                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-8 h-8 rounded-full bg-[#1877F2] hover:bg-[#1877F2]/90 flex items-center justify-center transition-transform hover:scale-105"
                                    title="Facebook"
                                >
                                    <FacebookIcon size={16} className="text-white" />
                                </a>
                                <a
                                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(storeName)}&url=${encodeURIComponent(profileUrl)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-8 h-8 rounded-full bg-black hover:bg-black/90 flex items-center justify-center transition-transform hover:scale-105"
                                    title="X"
                                >
                                    <XIcon size={16} className="text-white" />
                                </a>
                                <a
                                    href={`https://t.me/share/url?url=${encodeURIComponent(profileUrl)}&text=${encodeURIComponent(storeName)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-8 h-8 rounded-full bg-[#26A5E4] hover:bg-[#26A5E4]/90 flex items-center justify-center transition-transform hover:scale-105"
                                    title="Telegram"
                                >
                                    <TelegramIcon size={16} className="text-white" />
                                </a>
                                <a
                                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(profileUrl)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-8 h-8 rounded-full bg-[#0A66C2] hover:bg-[#0A66C2]/90 flex items-center justify-center transition-transform hover:scale-105"
                                    title="LinkedIn"
                                >
                                    <LinkedinIcon size={16} className="text-white" />
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="shrink-0 flex flex-col items-center justify-center">
                <div className="w-[130px] h-[130px] flex items-center justify-center">
                    <img
                        src="https://img.dudit.com.br/static/mascots/QRDino.png"
                        alt="Perfil de Vendedor"
                        className="w-full h-full object-contain"
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
            href: "/erp/pedidos"
        },
        {
            id: "products",
            label: "Meu Catálogo",
            description: "Gerencie produtos e serviços",
            icon: "Package",
            href: "/erp/produtos"
        },
    ];

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[280px] h-full flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 min-w-0 flex flex-col justify-between h-full w-full">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                            <RocketIcon size={20} className="text-brand-green" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                Atalhos Rápidos
                            </h3>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                Acesse as ações mais frequentes
                            </p>
                        </div>
                    </div>

                    <div className="space-y-1.5 overflow-y-auto max-h-[160px] pr-1">
                        {allShortcuts.slice(0, 4).map((shortcut) => (
                            <ListItem
                                key={shortcut.id}
                                icon={shortcutIconMap[shortcut.icon] || RocketIcon}
                                title={shortcut.label}
                                description={shortcut.description}
                                onClick={() => router.push(shortcut.href)}
                                className="border-0 bg-transparent hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 p-2 rounded-xl"
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="shrink-0 flex flex-col items-center gap-3">
                <div className="w-[130px] h-[130px] flex items-center justify-center">
                    <img
                        src="https://img.dudit.com.br/static/mascots/PDV.png"
                        alt="Atalhos Rápidos"
                        className="w-full h-full object-contain"
                    />
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs font-bold px-4"
                    onClick={() => router.push("/erp/pedidos")}
                >
                    Ver pedidos
                </Button>
            </div>
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
        { label: "Central de Ajuda", description: "Artigos, tutoriais e dúvidas", href: "/ajuda", icon: "HelpCircleIcon" },
        { label: "Fale Conosco", description: "Suporte via chat ou WhatsApp", href: "/ajuda/contato", icon: "MailIcon" },
        { label: "Status do Sistema", description: "Verifique a disponibilidade", href: "https://status.dudit.com.br", icon: "InfoIcon", external: true },
    ];

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[280px] h-full flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 min-w-0 flex flex-col justify-between h-full w-full">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                            <HelpCircleIcon size={20} className="text-brand-green" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                Ajuda e Suporte
                            </h3>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                Conte com a nossa equipe
                            </p>
                        </div>
                    </div>

                    <div className="space-y-1.5 overflow-y-auto max-h-[160px] pr-1">
                        {helpItems.map((item) => (
                            <ListItem
                                key={item.label}
                                icon={helpIconMap[item.icon] || HelpCircleIcon}
                                title={item.label}
                                description={item.description}
                                right={item.external ? <LinkIcon className="w-4 h-4 text-brand-inactive-text" /> : <ChevronRightIcon className="text-brand-inactive-text w-4 h-4" />}
                                onClick={() => item.external ? window.open(item.href, "_blank") : router.push(item.href)}
                                className="border-0 bg-transparent hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 p-2 rounded-xl"
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="shrink-0 flex flex-col items-center gap-3">
                <div className="w-[130px] h-[130px] flex items-center justify-center">
                    <img
                        src="https://img.dudit.com.br/static/mascots/Notificacoes.png"
                        alt="Ajuda e Suporte"
                        className="w-full h-full object-contain"
                    />
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs font-bold px-4"
                    onClick={() => router.push("/ajuda")}
                >
                    Central de Ajuda
                </Button>
            </div>
        </div>
    );
}

interface Stage {
    id: string;
    title: string;
    items: DashboardChecklistItem[];
}

const STAGE_CONFIG: { id: string; title: string; itemIds: string[] }[] = [
    { id: "stage-1", title: "Produtos e Serviços", itemIds: ["items"] },
    { id: "stage-2", title: "Dados da Loja", itemIds: ["business-data", "showcase"] },
    { id: "stage-3", title: "Pagamento e Entrega", itemIds: ["payments", "logistics"] },
];

function buildStages(items: DashboardChecklistItem[]): Stage[] {
    return STAGE_CONFIG
        .map((cfg) => ({
            id: cfg.id,
            title: cfg.title,
            items: cfg.itemIds
                .map((id) => items.find((i) => i.id === id))
                .filter(Boolean) as DashboardChecklistItem[],
        }))
        .filter((st) => st.items.length > 0);
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
    const [currentStageIdx, setCurrentStageIdx] = useState(0);

    if (!checklist || checklist.items.length === 0) return null;

    const stages = buildStages(checklist.items);
    const currentStage = stages[currentStageIdx] || stages[0];
    const firstIncompleteItem = currentStage?.items.find(i => !i.completed) || currentStage?.items[0];

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[280px] h-full flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 min-w-0 flex flex-col justify-between h-full w-full">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                            <RocketIcon size={20} className="text-brand-green" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                Primeiros Passos
                            </h3>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 truncate">
                                {currentStage.title}
                            </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className="text-[11px] font-bold text-brand-green bg-brand-green-light/70 dark:bg-dark-border/40 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                {currentStageIdx + 1}/{stages.length}
                            </span>
                            <button
                                onClick={() => setCurrentStageIdx((p) => Math.max(0, p - 1))}
                                disabled={currentStageIdx === 0}
                                className="w-7 h-7 rounded-full flex items-center justify-center bg-brand-gray dark:bg-dark-border disabled:opacity-30 hover:bg-brand-gray/70 dark:hover:bg-dark-border/70 transition-colors"
                                aria-label="Etapa anterior"
                            >
                                <ChevronLeftIcon size={14} className="text-brand-dark dark:text-dark-heading" />
                            </button>
                            <button
                                onClick={() => setCurrentStageIdx((p) => Math.min(stages.length - 1, p + 1))}
                                disabled={currentStageIdx === stages.length - 1}
                                className="w-7 h-7 rounded-full flex items-center justify-center bg-brand-gray dark:bg-dark-border disabled:opacity-30 hover:bg-brand-gray/70 dark:hover:bg-dark-border/70 transition-colors"
                                aria-label="Próxima etapa"
                            >
                                <ChevronRightIcon size={14} className="text-brand-dark dark:text-dark-heading" />
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 overflow-y-auto max-h-[160px] pr-1">
                        {currentStage.items.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => onItemClick(item)}
                                className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all cursor-pointer"
                            >
                                {item.completed ? (
                                    <CheckCircleIcon size={20} className="text-brand-green shrink-0" />
                                ) : (
                                    <div className="w-[20px] h-[20px] rounded-full border-2 border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                                        <div className="w-1.5 h-1.5 rounded-full bg-brand-border dark:bg-dark-border" />
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
                                <ChevronRightIcon size={16} className="text-brand-inactive-text shrink-0" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="shrink-0 flex flex-col items-center gap-3">
                <div className="w-[130px] h-[130px] flex items-center justify-center">
                    <img
                        src="https://img.dudit.com.br/static/mascots/HappyDino.png"
                        alt="Primeiros Passos"
                        className="w-full h-full object-contain"
                    />
                </div>
                {firstIncompleteItem && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs font-bold px-4"
                        onClick={() => onItemClick(firstIncompleteItem)}
                    >
                        Continuar etapa
                    </Button>
                )}
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
            href: "/erp/produtos?create=true",
            variant: "default",
        },
        {
            label: "Importar via planilha",
            description: "Faça upload de uma planilha Excel/CSV com seus produtos",
            icon: "UploadSheetIcon",
            href: "/erp/produtos/importar",
            variant: "outline",
        },
    ];

    if (isErpMode && sellsProducts) {
        productOptions.splice(1, 0, {
            label: "Importar XML (NF-e)",
            description: "Importe produtos direto da nota fiscal de entrada",
            icon: "DownloadIcon",
            href: "/erp/importacao-xml",
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
            href: "/erp/servicos/importar",
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
                                    className="px-4 py-3 gap-4"
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
                                    className="px-4 py-3 gap-4"
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
// PLAN UPGRADE CARD
// ============================================

function PlanUpgradeCard({ planSlug, onUpgrade }: { planSlug: string; onUpgrade: (target: "crescer" | "escalar") => void }) {
    const nextSlug = planSlug === "free" ? "crescer" : planSlug === "crescer" ? "escalar" : null;
    const [currentFeatureIdx, setCurrentFeatureIdx] = useState(0);

    const planFeatures = nextSlug ? getHardcodedPlan(nextSlug).features : [];
    const planName = nextSlug ? getHardcodedPlan(nextSlug).name : "";
    const mascotSrc = nextSlug ? PLAN_UPGRADE_MASCOTS[nextSlug as "crescer" | "escalar"] : "";

    const descriptions: Record<string, string> = {
        crescer: "Aumente seu limite de catálogo para 100 itens, receba pagamentos via Mercado Pago e ative cupons promocionais para vender mais.",
        escalar: "Tenha itens e pedidos ilimitados, financeiro avançado com fluxo de caixa e DRE simplificado.",
    };

    useEffect(() => {
        if (planFeatures.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentFeatureIdx((prev) => (prev + 1) % planFeatures.length);
        }, 30000);
        return () => clearInterval(interval);
    }, [planFeatures.length]);

    if (!nextSlug) return null;

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[280px] h-full flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 min-w-0 flex flex-col justify-between h-full w-full">
                <div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1 leading-tight">
                        Plano {planName}
                    </h3>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-4 leading-relaxed">
                        {descriptions[nextSlug]}
                    </p>

                    <div className="flex items-center gap-3 min-h-[44px]">
                        <div className="w-8 h-8 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0">
                            <SparklesIcon className="w-4 h-4 text-brand-green" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                {planFeatures[currentFeatureIdx]}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="shrink-0 flex flex-col items-center gap-3">
                <div className="w-[130px] h-[130px] flex items-center justify-center">
                    <img src={mascotSrc} alt={planName} className="w-full h-full object-contain" />
                </div>
                <Button
                    variant="default"
                    size="sm"
                    className="bg-brand-green hover:bg-brand-green/90 text-white border-none rounded-full px-6 text-xs font-bold"
                    onClick={() => onUpgrade(nextSlug as "crescer" | "escalar")}
                >
                    Fazer upgrade
                </Button>
            </div>
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
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[280px] h-full flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 min-w-0 flex flex-col justify-between h-full w-full">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                            <RocketIcon size={20} className="text-brand-green" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                Desbloqueie o Modo ERP
                            </h3>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                Recursos corporativos avançados
                            </p>
                        </div>
                    </div>

                    <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                        Migre para o modo ERP completo com dashboard financeiro, fluxo de caixa, DRE, controle de estoque avançado e relatórios detalhados.
                    </p>
                </div>
            </div>

            <div className="shrink-0 flex flex-col items-center gap-3">
                <div className="w-[130px] h-[130px] flex items-center justify-center">
                    <img
                        src="https://img.dudit.com.br/static/mascots/Metas.png"
                        alt="Modo ERP"
                        className="w-full h-full object-contain"
                    />
                </div>
                <Button
                    variant="default"
                    size="sm"
                    className="bg-brand-green hover:bg-brand-green/90 text-white border-none rounded-full px-6 text-xs font-bold"
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
// TIPS CARD
// ============================================

const PLATFORM_TIPS = [
    "Conecte seu WhatsApp no ERP para responder clientes e fechar vendas mais rápido.",
    "Mantenha seu catálogo atualizado com boas fotos para vender muito mais.",
    "Use a Central de Ajuda para descobrir tutoriais e dicas sobre a plataforma.",
    "Ative as notificações para não perder nenhum pedido que chegar.",
    "Cadastre cupons promocionais para atrair novos clientes.",
    "Acompanhe os relatórios para entender o desempenho do seu negócio.",
    "Configure o horário de funcionamento da sua loja para seus clientes.",
    "Use o fluxo de caixa para manter as contas da sua empresa em dia.",
    "Cadastre seus produtos com preço de venda e compare com o custo.",
    "Divulgue seu perfil de vendedor nas redes sociais para ganhar mais clientes.",
    "Defina metas de vendas para manter sua equipe motivada.",
    "Importe planilhas para cadastrar vários produtos de uma vez só.",
    "Separe as vendas por categoria para facilitar a busca dos clientes.",
    "Fique de olho no estoque para evitar vender produtos indisponíveis.",
    "Personalize seu perfil com logo e banner para transmitir mais confiança.",
];

function TipsCard() {
    const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * PLATFORM_TIPS.length));

    useEffect(() => {
        const interval = setInterval(() => {
            setTipIdx((prev) => {
                let next = prev;
                while (next === prev) {
                    next = Math.floor(Math.random() * PLATFORM_TIPS.length);
                }
                return next;
            });
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[280px] h-full flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 min-w-0 flex flex-col justify-between h-full w-full">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                            <SparklesIcon size={20} className="text-brand-green" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                Dicas da Dudit
                            </h3>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                Boas práticas para vender mais
                            </p>
                        </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-brand-gray/30 dark:bg-dark-border/20 border border-brand-border dark:border-dark-border my-2">
                        <p className="text-sm text-brand-dark dark:text-dark-heading leading-relaxed font-medium">
                            "{PLATFORM_TIPS[tipIdx]}"
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                        Dica {tipIdx + 1} de {PLATFORM_TIPS.length}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-brand-green font-bold text-xs"
                        onClick={() => setTipIdx((prev) => (prev + 1) % PLATFORM_TIPS.length)}
                    >
                        Próxima dica <ChevronRightIcon size={14} />
                    </Button>
                </div>
            </div>

            <div className="shrink-0 flex flex-col items-center justify-center">
                <div className="w-[130px] h-[130px] flex items-center justify-center">
                    <img
                        src="https://img.dudit.com.br/static/mascots/Segmentos.png"
                        alt="Dicas"
                        className="w-full h-full object-contain"
                    />
                </div>
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
    const { openPlanUpgrade } = usePlanUpgrade();
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
            router.push(`/erp/configuracoes?tab=${item.tabTarget}`);
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
            <div className="mx-auto w-full pt-4 flex flex-col gap-8 pb-20 px-4 md:px-8">
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
                                onClick={() => router.push('/erp/configuracoes')}
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

                {/* Cards Grid - 2 columns */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {data.checklist && (
                        <ProgressCard
                            checklist={data.checklist}
                            onItemClick={handleChecklistItemClick}
                            onImportClick={handleImportClick}
                        />
                    )}

                    <QRCodeCard partnerUrl={data.partnerUrl} storeName={data.storeName || "Sua Loja"} />

                    <PlanUpgradeCard planSlug={data.planSlug} onUpgrade={openPlanUpgrade} />

                    {data.isQuickMode && (
                        <ModeCard partnerId={partnerId} onSuccess={() => router.refresh()} />
                    )}

                    <ShortcutsCard
                        shortcuts={data.shortcuts}
                        sellsProducts={data.sellsProducts}
                        sellsServices={data.sellsServices}
                    />

                    <TipsCard />

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
            </div>
        </>
    );
}