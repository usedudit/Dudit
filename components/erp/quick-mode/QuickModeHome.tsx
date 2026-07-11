'use client';

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    PlusIcon,
    ShoppingCartIcon,
    Package,
    WrenchIcon,
    ChevronRightIcon,
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
    TruckIcon,
    DownloadIcon,
    UploadSheetIcon,
    HelpCircleIcon,
    LinkIcon,
    CopyIcon,
    PlayIcon,
    MailIcon,
} from "@/lib/icons";
import { Button, Badge, ListItem, Accordion, DefaultModal } from "@/components/reusable";
import { Tooltip } from "@/components/reusable/Tooltip"
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import QuickModeItemCard from "./QuickModeItemCard";
import { deleteProductAction, duplicateProductAction } from "@/app/actions/erp/products";
import { deleteServiceAction, duplicateServiceAction } from "@/app/actions/erp/servicos";
import AlertModal from "@/components/reusable/AlertModal";
import { ERPPageHeader } from "@/components/erp/page-header-state";
import { DashboardLayout } from "@/lib/dashboard-engine/types";

const IconMap: Record<string, React.ComponentType<any>> = {
    PlusIcon,
    ShoppingCartIcon,
    Package,
    WrenchIcon,
    ChevronRightIcon,
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
    TruckIcon,
    DownloadIcon,
    UploadSheetIcon,
    HelpCircleIcon,
    LinkIcon,
    CopyIcon,
    PlayIcon,
    MailIcon,
};

function renderIcon(iconName: string, className?: string) {
    const IconComp = IconMap[iconName] || InfoIcon;
    return <IconComp className={className} />;
}

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

function QRCodeCard({ partnerId, storeName }: { partnerId: string; storeName: string }) {
    const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
    const [copied, setCopied] = useState(false);
    const { toast } = useToast();

    const profileUrl = `${typeof window !== "undefined" ? window.location.origin : "https://dudit.com.br"}/perfil/${partnerId}`;

    React.useEffect(() => {
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(profileUrl)}`);
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
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 h-full flex flex-col">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                    <QRCodeIcon size={20} className="text-brand-green" />
                </div>
                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Seu Perfil de Vendedor</h3>
            </div>

            <div className="flex flex-col items-center gap-4 flex-1">
                <div className="bg-white dark:bg-dark-surface p-4 rounded-2xl border border-brand-border dark:border-dark-border">
                    <img
                        src={qrCodeUrl}
                        alt="QR Code do perfil"
                        className="w-48 h-48 mx-auto"
                    />
                </div>
                <p className="text-center text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                    Escaneie ou compartilhe seu perfil
                </p>

                <div className="flex gap-3 w-full">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={copyLink}
                    >
                        <CopyIcon className="w-4 h-4" />
                        {copied ? "Copiado!" : "Copiar Link"}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={shareProfile}
                    >
                        <ShareIcon className="w-4 h-4" />
                        Compartilhar
                    </Button>
                </div>
            </div>
        </div>
    );
}

function IntegrationsCard({ integrations, isWhatsAppConnected, isMercadoPagoConnected }: {
    integrations: DashboardLayout["integrations"];
    isWhatsAppConnected: boolean;
    isMercadoPagoConnected: boolean;
}) {
    const router = useRouter();

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 h-full">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                    <LinkIcon size={20} className="text-brand-green" />
                </div>
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Integrações</h3>
            </div>

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

            <Button
                variant="ghost"
                size="sm"
                className="w-full mt-4 text-brand-green font-bold"
                onClick={() => router.push("/erp/integrations")}
            >
                Ver todas as integrações <ChevronRightIcon size={16} />
            </Button>
        </div>
    );
}

function ShortcutsCard({ shortcuts, sellsProducts, sellsServices }: {
    shortcuts: DashboardLayout["shortcuts"];
    sellsProducts: boolean;
    sellsServices: boolean;
}) {
    const router = useRouter();

    const allShortcuts = [
        ...(sellsProducts ? [{
            id: "add-product",
            label: "Anunciar Produto",
            description: "Crie um novo anúncio no marketplace",
            icon: "PlusIcon",
            href: "/erp/products?create=true"
        }] : []),
        ...(sellsServices ? [{
            id: "add-service",
            label: "Anunciar Serviço",
            description: "Ofereça um novo serviço aos clientes",
            icon: "WrenchIcon",
            href: "/erp/servicos?create=true"
        }] : []),
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
                        icon={shortcut.icon}
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

function HelpCard() {
    const router = useRouter();

    const helpItems = [
        { label: "Central de Ajuda", description: "Artigos, tutoriais e perguntas frequentes", href: "/ajuda", icon: "HelpCircleIcon" },
        { label: "Vídeos Tutoriais", description: "Aprenda a usar a Dudit com nossos vídeos", href: "/ajuda/videos", icon: "PlayIcon" },
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
                        icon={item.icon}
                        title={item.label}
                        description={item.description}
                        right={item.external ? <LinkIcon className="w-4 h-4 text-brand-inactive-text" /> : <ChevronRightIcon className="text-brand-inactive-text w-4 h-4" />}
                        onClick={() => item.external ? window.open(item.href, "_blank") : router.push(item.href)}
                        className="border-0 bg-transparent hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 p-2"
                    />
                ))}
            </div>

            <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-brand-green font-bold"
                onClick={() => router.push("/ajuda")}
            >
                Ver todos os recursos <ChevronRightIcon size={16} />
            </Button>
        </div>
    );
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
    if (!checklist) return null;

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                <div>
                    <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading">
                        Seu Progresso de Ativação
                    </h3>
                    <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                        Complete as tarefas abaixo para deixar sua vitrine pronta.
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <span className="text-[28px] font-black text-brand-green tracking-tight">
                        {checklist.percentComplete}%
                    </span>
                    <span className="text-xs font-bold text-brand-inactive-text block uppercase">
                        {checklist.completedCount} de {checklist.totalCount} concluídos
                    </span>
                </div>
            </div>

            <div className="w-full h-3 bg-brand-gray dark:bg-dark-border rounded-full overflow-hidden mb-6">
                <motion.div
                    className="h-full bg-brand-green rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${checklist.percentComplete}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                />
            </div>

            <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
                {checklist.items.map((item, idx) => (
                    <div
                        key={item.id}
                        className={`bg-white dark:bg-dark-surface border rounded-[20px] p-5 flex items-start gap-4 transition-all shadow-sm ${
                            item.completed
                                ? 'border-brand-border/60 dark:border-dark-border/40 opacity-80'
                                : 'border-brand-green/30 dark:border-brand-green/20'
                        }`}
                    >
                        <div className="shrink-0 mt-0.5">
                            {item.completed ? (
                                <CheckCircleIcon size={22} className="text-brand-green" />
                            ) : (
                                <div className="w-[22px] h-[22px] rounded-full border-2 border-brand-green/30 dark:border-brand-green/20 flex items-center justify-center text-xs font-black text-brand-green">
                                    {idx + 1}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <h4 className={`text-[15px] font-bold ${item.completed ? 'text-brand-dark/70 dark:text-dark-heading/70 line-through' : 'text-brand-dark dark:text-dark-heading'}`}>
                                    {item.title}
                                </h4>
                                {item.completed && (
                                    <Badge variant="green" className="self-start sm:self-auto text-[10px] py-0.5 px-2">Concluído</Badge>
                                )}
                            </div>
                            <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-1">
                                {item.description}
                            </p>
                            {item.importOptions && !item.completed && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-3 text-brand-green border-brand-green hover:bg-brand-green/5 text-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onImportClick();
                                    }}
                                >
                                    <PlusIcon className="w-3.5 h-3.5" /> Ver opções de cadastro
                                </Button>
                            )}
                        </div>
                        <div className="shrink-0 ml-2">
                            <Button
                                variant={item.completed ? "outline" : "default"}
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onItemClick(item);
                                }}
                                className={item.completed ? "text-brand-inactive-text border-brand-border h-9" : "h-9"}
                            >
                                {item.completed ? "Configurar" : "Começar"}
                            </Button>
                        </div>
                    </div>
                ))}
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
                    <div className="space-y-4">
                        <h4 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                            <Package className="w-5 h-5 text-brand-green" />
                            Produtos
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {productOptions.map((opt, idx) => (
                                <Button
                                    key={idx}
                                    variant={opt.variant}
                                    size="lg"
                                    className="h-28 w-full justify-start gap-4 text-left rounded-2xl border-2 hover:border-brand-green/50 transition-colors"
                                    onClick={() => handleNavigate(opt.href)}
                                >
                                    <div className="w-12 h-12 rounded-xl bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0">
                                        {renderIcon(opt.icon, "w-6 h-6 text-brand-green")}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-brand-dark dark:text-dark-heading">{opt.label}</p>
                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">{opt.description}</p>
                                    </div>
                                    <ChevronRightIcon className="text-brand-inactive-text w-5 h-5" />
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {sellsServices && (
                    <div className="space-y-4 pt-6 border-t border-brand-border dark:border-dark-border">
                        <h4 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                            <WrenchIcon className="w-5 h-5 text-brand-green" />
                            Serviços
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {serviceOptions.map((opt, idx) => (
                                <Button
                                    key={idx}
                                    variant={opt.variant}
                                    size="lg"
                                    className="h-28 w-full justify-start gap-4 text-left rounded-2xl border-2 hover:border-brand-green/50 transition-colors"
                                    onClick={() => handleNavigate(opt.href)}
                                >
                                    <div className="w-12 h-12 rounded-xl bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0">
                                        {renderIcon(opt.icon, "w-6 h-6 text-brand-green")}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-brand-dark dark:text-dark-heading">{opt.label}</p>
                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">{opt.description}</p>
                                    </div>
                                    <ChevronRightIcon className="text-brand-inactive-text w-5 h-5" />
                                </Button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </DefaultModal>
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

    const isQuickMode = data.isQuickMode;

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
                            <motion.div
                                key={alert.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`border rounded-2xl p-5 flex items-start gap-4 shadow-sm transition-all ${
                                    alert.type === "danger"
                                        ? "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300"
                                        : alert.type === "warning"
                                            ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-300"
                                            : "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/20 dark:border-blue-900/40 dark:text-blue-300"
                                }`}
                            >
                                <div className="shrink-0 mt-0.5 text-brand-dark dark:text-dark-heading">
                                    <AlertTriangleIcon size={20} className={alert.type === "danger" ? "text-brand-red" : alert.type === "warning" ? "text-amber-500" : "text-blue-500"} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-[15px] font-bold">{alert.title}</h4>
                                    <p className="text-[13px] font-medium mt-1 opacity-90">{alert.description}</p>
                                </div>
                                {alert.actionLabel && alert.actionHref && (
                                    <Button
                                        variant={alert.type === "danger" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => router.push(alert.actionHref!)}
                                        className={`shrink-0 rounded-full font-bold ${
                                            alert.type === "danger" ? "bg-brand-red hover:bg-brand-red/90 border-none text-white" : ""
                                        }`}
                                    >
                                        {alert.actionLabel}
                                    </Button>
                                )}
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Main Grid - Progress Card (2/3) + QR Code Card (1/3) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Progress/Onboarding Card - 2/3 width */}
                    <div className="lg:col-span-8">
                        {data.checklist && (
                            <ProgressCard
                                checklist={data.checklist}
                                onItemClick={handleChecklistItemClick}
                                onImportClick={handleImportClick}
                            />
                        )}
                    </div>

                    {/* QR Code Card - 1/3 width (only in quick mode) */}
                    {isQuickMode && (
                        <div className="lg:col-span-4">
                            <QRCodeCard partnerId={partnerId} storeName={data.storeName || "Sua Loja"} />
                        </div>
                    )}
                </div>

                {/* Bottom 3 Cards - Integrations, Shortcuts, Help */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <IntegrationsCard
                        integrations={data.integrations}
                        isWhatsAppConnected={data.integrations.find(i => i.id === "whatsapp")?.status === "connected"}
                        isMercadoPagoConnected={data.integrations.find(i => i.id === "mercadopago")?.status === "connected"}
                    />
                    <ShortcutsCard
                        shortcuts={data.shortcuts}
                        sellsProducts={data.checklist?.items.some(i => i.importOptions?.sellsProducts) ?? true}
                        sellsServices={data.checklist?.items.some(i => i.importOptions?.sellsServices) ?? false}
                    />
                    <HelpCard />
                </div>

                {/* Recomendações e Dicas */}
                {data.recommendations.length > 0 && (
                    <div className="flex flex-col gap-6">
                        {data.recommendations.map((rec) => {
                            if (rec.variant === "upgrade") {
                                return (
                                    <section key={rec.id} className="bg-brand-dark dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-8 md:p-12 relative overflow-hidden text-white shadow-md">
                                        <div className="relative z-10 max-w-2xl">
                                            {rec.badge && (
                                                <Badge variant="green" className="mb-4 bg-brand-green border-none text-white px-4 py-1.5 text-sm">
                                                    {rec.badge}
                                                </Badge>
                                            )}
                                            <h2 className="text-4xl font-black mb-4 leading-tight text-white">
                                                {rec.title}
                                            </h2>
                                            <p className="text-slate-300 text-lg font-medium mb-8">
                                                {rec.description}
                                            </p>
                                            <Button
                                                size="lg"
                                                className="bg-brand-green hover:bg-brand-green/90 text-white border-none h-12 px-8 text-base font-bold transition-all rounded-full"
                                                onClick={() => router.push(rec.actionHref)}
                                            >
                                                {rec.actionLabel}
                                            </Button>
                                        </div>
                                        <div className="absolute right-[-100px] bottom-[-100px] w-[500px] h-[500px] bg-brand-green/10 rounded-full blur-[100px]" />
                                        <div className="absolute right-10 top-1/2 -translate-y-1/2 hidden lg:block opacity-20">
                                            <StoreIcon size={240} className="text-brand-green" />
                                        </div>
                                    </section>
                                )
                            } else {
                                return (
                                    <motion.div
                                        key={rec.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                                                <InfoIcon size={22} />
                                            </div>
                                            <div>
                                                <h3 className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">
                                                    {rec.title}
                                                </h3>
                                                <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-1 leading-relaxed max-w-2xl">
                                                    {rec.description}
                                                </p>
                                            </div>
                                        </div>
                                        <Button variant="outline" className="shrink-0 rounded-full font-bold" onClick={() => router.push(rec.actionHref)}>
                                            {rec.actionLabel}
                                        </Button>
                                    </motion.div>
                                )
                            }
                        })}
                    </div>
                )}

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
    )
}