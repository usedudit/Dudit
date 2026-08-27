'use client';

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    ChevronRightIcon,
    ChevronLeftIcon,
    CheckCircleIcon,
    RocketIcon,
    HelpCircleIcon,
    MailIcon,
    InfoIcon,
    LinkIcon,
    CopyIcon,
    ShareIcon,
    DownloadIcon,
    SparklesIcon,
    WhatsappIcon,
    FacebookIcon,
    XIcon,
    TelegramIcon,
    LinkedinIcon,
    QRCodeIcon,
    EyeIcon,
} from "@/lib/icons";
import { Button, ListItem, FormSection, DefaultModal, InfoCard } from "@/components/reusable";
import { useToast } from "@/hooks/use-toast";
import { deleteProductAction } from "@/app/actions/erp/products";
import { deleteServiceAction } from "@/app/actions/erp/servicos";
import AlertModal from "@/components/reusable/AlertModal";
import { ERPPageHeader } from "@/components/erp/page-header-state";
import { DashboardLayout } from "@/lib/dashboard-engine/types";
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal";

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

// Same-origin proxy is required because this image is drawn into a canvas.
const DINO_CAVALERE_URL = "/api/assets/qr-dino";

function QRCodePoster({ profileUrl, storeName }: { profileUrl: string; storeName: string }) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [generating, setGenerating] = useState(false);
    const { toast } = useToast();

    // Posições exatas do espaço branco do cavalete no QRDino.png (perfeitamente quadrado, abaixo do logo dudit)
    const QR_POSITION = {
        x: 0.156,      // 15.6% da largura (centro do espaço branco do cavalete)
        y: 0.644,      // 64.4% da altura (abaixo do logo verde da dudit no cavalete)
        width: 0.188,  // 18.8% da largura (quadrado perfeito)
        height: 0.188, // 18.8% da altura (quadrado perfeito)
    };

    const downloadPoster = React.useCallback(async () => {
        setGenerating(true);
        try {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            // Carrega a imagem do Dino cavalete
            const dinoImg = new Image();
            dinoImg.crossOrigin = "anonymous";
            await new Promise<void>((resolve, reject) => {
                dinoImg.onload = () => resolve();
                dinoImg.onerror = reject;
                dinoImg.src = DINO_CAVALERE_URL;
            });

            // Carrega o QR code em tamanho maior para melhor resolução
            const qrSize = 500;
            const qrImg = new Image();
            qrImg.crossOrigin = "anonymous";
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(profileUrl)}`;
            await new Promise<void>((resolve, reject) => {
                qrImg.onload = () => resolve();
                qrImg.onerror = reject;
                qrImg.src = qrUrl;
            });

            // Configura o canvas com as dimensões da imagem original
            canvas.width = dinoImg.naturalWidth;
            canvas.height = dinoImg.naturalHeight;

            // Desenha o Dino cavalete original
            ctx.drawImage(dinoImg, 0, 0);

            // Calcula a posição do QR code no cavalete (proporções exatas sem distorção)
            const qrX = canvas.width * QR_POSITION.x;
            const qrY = canvas.height * QR_POSITION.y;
            const qrWidth = canvas.width * QR_POSITION.width;
            const qrHeight = canvas.height * QR_POSITION.height;

            // Desenha o QR code centralizado perfeitamente no espaço branco já existente no cavalete
            ctx.drawImage(qrImg, qrX, qrY, qrWidth, qrHeight);

            // Converte para blob e faz download direto
            canvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `poster-dudit-${storeName.replace(/\s+/g, "-").toLowerCase()}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    toast({ title: "Poster baixado!", description: "Pronto para imprimir ou compartilhar." });
                }
                setGenerating(false);
            }, "image/png");

        } catch (err) {
            console.error("Erro ao gerar poster:", err);
            toast({ title: "Erro ao gerar imagem", description: "Tente novamente.", variant: "destructive" });
            setGenerating(false);
        }
    }, [profileUrl, storeName, toast]);

    return (
        <>
            <canvas ref={canvasRef} className="hidden" />
            <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-full font-semibold text-xs text-brand-green border-brand-green/40 hover:bg-brand-green-light/30"
                onClick={downloadPoster}
                disabled={generating}
            >
                <DownloadIcon className="w-3.5 h-3.5" />
                {generating ? "Gerando..." : "Baixar Poster"}
            </Button>
        </>
    );
}

function VitrineHeroCard({ partnerUrl, storeName }: { partnerUrl: string; storeName: string }) {
    const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
    const [copied, setCopied] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);
    const { toast } = useToast();

    const origin = typeof window !== "undefined" ? window.location.origin : "https://dudit.com.br";
    const profileUrl = `${origin}${partnerUrl}`;

    React.useEffect(() => {
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(profileUrl)}`);
    }, [profileUrl]);

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(profileUrl);
            setCopied(true);
            toast({ title: "Link copiado! 📋", description: "O link da sua vitrine foi copiado para a área de transferência." });
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast({ title: "Erro ao copiar", variant: "destructive" });
        }
    };

    const openWhatsAppShare = () => {
        const message = `Olá! Conheça nossa vitrine e faça seu pedido online: ${profileUrl}`;
        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    };

    const openStore = () => {
        window.open(profileUrl, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[220px] h-full flex flex-col justify-between shadow-sm">
            <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-brand-green/10 text-brand-green border border-brand-green/20">
                        <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
                        Vitrine Online no Ar
                    </span>
                    <button
                        onClick={() => setShowQrModal(true)}
                        className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-white flex items-center gap-1 transition-colors"
                        title="Ver QR Code e Poster"
                    >
                        <QRCodeIcon size={14} />
                        QR Code & Poster
                    </button>
                </div>

                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight mb-1">
                    Sua Vitrine & Catálogo Online
                </h3>
                <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed mb-4">
                    Compartilhe seu link exclusivo para clientes navegarem pelo seu catálogo e pedirem no WhatsApp.
                </p>

                {/* Link Box */}
                <div className="flex items-center justify-between gap-2 bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border rounded-xl p-2.5 mb-4">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <LinkIcon size={16} className="text-brand-green shrink-0" />
                        <span className="text-xs font-medium text-brand-dark dark:text-dark-heading truncate font-mono">
                            {profileUrl}
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-3 text-xs font-bold text-brand-dark dark:text-dark-heading hover:bg-white dark:hover:bg-dark-surface shrink-0 rounded-lg gap-1.5"
                        onClick={copyLink}
                    >
                        <CopyIcon size={13} />
                        {copied ? "Copiado!" : "Copiar"}
                    </Button>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-brand-border/60 dark:border-dark-border/60">
                <Button
                    variant="default"
                    size="sm"
                    className="gap-2 rounded-full font-bold text-xs bg-[#25D366] hover:bg-[#20bd5a] text-white border-0 shadow-sm"
                    onClick={openWhatsAppShare}
                >
                    <WhatsappIcon size={15} />
                    Testar no WhatsApp
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-full font-semibold text-xs border-brand-border dark:border-dark-border"
                    onClick={openStore}
                >
                    <EyeIcon size={14} />
                    Abrir Vitrine
                </Button>
                <QRCodePoster profileUrl={profileUrl} storeName={storeName} />
            </div>

            {/* Modal de QR Code */}
            {showQrModal && (
                <DefaultModal
                    isOpen={showQrModal}
                    onClose={() => setShowQrModal(false)}
                    title="QR Code da sua Loja"
                    description="Imprima para colocar no balcão ou compartilhe nas redes sociais"
                    maxWidth="sm"
                >
                    <div className="flex flex-col items-center justify-center p-4 gap-4">
                        <div className="p-4 bg-white rounded-2xl border border-brand-border shadow-sm">
                            {qrCodeUrl ? (
                                <img
                                    src={qrCodeUrl}
                                    alt="QR Code da Loja"
                                    className="w-48 h-48 object-contain rounded-lg"
                                />
                            ) : (
                                <div className="w-48 h-48 bg-brand-gray animate-pulse rounded-lg" />
                            )}
                        </div>
                        <p className="text-xs text-center text-brand-inactive-text dark:text-dark-body max-w-xs font-mono">
                            {profileUrl}
                        </p>
                        <div className="flex items-center gap-2 w-full">
                            <Button
                                variant="outline"
                                className="flex-1 rounded-full text-xs font-bold"
                                onClick={copyLink}
                            >
                                <CopyIcon size={14} className="mr-1.5" />
                                Copiar Link
                            </Button>
                            <QRCodePoster profileUrl={profileUrl} storeName={storeName} />
                        </div>
                    </div>
                </DefaultModal>
            )}
        </div>
    );
}

// Alias for backwards compatibility
const QRCodeCard = VitrineHeroCard;

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
    ];

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[220px] h-full flex flex-col justify-between shadow-sm">
            <div>
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight mb-1">
                    Ajuda e Suporte
                </h3>
                <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed mb-4">
                    Estamos aqui para ajudar sua empresa a crescer e vender mais.
                </p>

                <div className="space-y-2 grid grid-cols-1 md:grid-cols-2">
                    {helpItems.map((item) => (
                        <ListItem
                            key={item.label}
                            icon={helpIconMap[item.icon] || HelpCircleIcon}
                            title={item.label}
                            description={item.description}
                            right={<ChevronRightIcon className="text-brand-inactive-text w-4 h-4" />}
                            onClick={() => router.push(item.href)}
                            className="border-0 bg-brand-gray/50 dark:bg-dark-border/40 hover:bg-brand-gray dark:hover:bg-dark-border/70 p-3 rounded-xl transition-colors"
                        />
                    ))}
                </div>
            </div>
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
    if (!checklist || checklist.items.length === 0) return null;

    const totalItems = checklist.items.length;
    const completedItems = checklist.items.filter(i => i.completed).length;
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    const remainingCount = totalItems - completedItems;

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 lg:p-7 flex flex-col gap-6 shadow-sm">
            {/* Header com Progresso */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-brand-border/60 dark:border-dark-border/60">
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-brand-green bg-brand-green/10 border border-brand-green/20 px-2.5 py-0.5 rounded-full">
                            🔥 Quase lá!
                        </span>
                        <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                            {remainingCount === 1 ? "Falta apenas 1 passo" : `Faltam ${remainingCount} passos`}
                        </span>
                    </div>
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
                        {progressPercent >= 70
                            ? "Sua loja está a 1 passo de decolar! 🚀"
                            : "Configure os detalhes finais para começar a vender"}
                    </h3>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                        Você já fez a parte difícil no cadastro. Complete os itens abaixo para receber pedidos e encantar seus clientes.
                    </p>
                </div>

                {/* Barra de Progresso em Destaque */}
                <div className="md:w-64 shrink-0 bg-brand-gray dark:bg-dark-border/30 p-3.5 rounded-2xl border border-brand-border dark:border-dark-border">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">
                            Progresso da Loja
                        </span>
                        <span className="text-xs font-bold text-brand-green">
                            {completedItems}/{totalItems} ({progressPercent}%)
                        </span>
                    </div>
                    <div className="w-full h-2.5 bg-brand-border dark:bg-dark-border rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-brand-green to-emerald-400 rounded-full transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Checklist Items */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {checklist.items.map((item, idx) => {
                    const isDone = item.completed;
                    return (
                        <div
                            key={item.id}
                            onClick={() => onItemClick(item)}
                            className={`group flex items-start gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                                isDone
                                    ? "border-brand-green/25 bg-brand-green/[0.03] dark:bg-brand-green/[0.02]"
                                    : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-white/20 hover:shadow-sm"
                            }`}
                        >
                            {/* Number or Checkmark */}
                            <div className="mt-0.5 shrink-0">
                                {isDone ? (
                                    <div className="w-7 h-7 rounded-full bg-brand-green/10 dark:bg-brand-green/20 flex items-center justify-center">
                                        <CheckCircleIcon size={18} className="text-brand-green" />
                                    </div>
                                ) : (
                                    <div className="w-7 h-7 rounded-full bg-brand-gray dark:bg-dark-border/60 border border-brand-border dark:border-dark-border flex items-center justify-center text-xs font-bold text-brand-dark dark:text-dark-heading group-hover:bg-brand-dark group-hover:text-white dark:group-hover:bg-brand-green dark:group-hover:text-white transition-colors">
                                        {idx + 1}
                                    </div>
                                )}
                            </div>

                            {/* Text Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <h4 className={`text-sm font-bold ${isDone ? "text-brand-dark/70 dark:text-dark-heading/70" : "text-brand-dark dark:text-dark-heading"}`}>
                                        {item.title}
                                    </h4>
                                    {item.badgeText && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            isDone
                                                ? "bg-brand-green/10 text-brand-green"
                                                : "bg-brand-gray dark:bg-dark-border text-brand-inactive-text dark:text-dark-body"
                                        }`}>
                                            {item.badgeText}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed line-clamp-2">
                                    {item.description}
                                </p>
                            </div>

                            {/* Action Indicator / Button */}
                            <div className="shrink-0 self-center">
                                {isDone ? (
                                    <span className="text-xs font-semibold text-brand-green flex items-center gap-0.5">
                                        Pronto
                                    </span>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-3 rounded-full text-xs font-bold text-brand-dark dark:text-dark-heading group-hover:bg-brand-dark group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-brand-dark transition-all gap-1"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onItemClick(item);
                                        }}
                                    >
                                        {item.actionText || "Configurar"}
                                        <ChevronRightIcon size={12} />
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}
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

    const descriptions: Record<string, string> = {
        crescer: "Aumente seu limite de catálogo para 100 itens, receba pagamentos via Mercado Pago e ative cupons promocionais.",
        escalar: "Tenha itens e pedidos ilimitados, financeiro avançado com fluxo de caixa e DRE simplificado.",
    };

    if (!nextSlug) return null;

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/50 flex items-center justify-center shrink-0">
                <SparklesIcon className="w-5 h-5 text-brand-green" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-brand-green bg-brand-green-light/70 dark:bg-dark-border/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Teste grátis
                    </span>
                    <p className="text-sm text-brand-dark dark:text-dark-heading">
                        {descriptions[nextSlug]}
                    </p>
                </div>
            </div>
            <Button
                variant="outline"
                size="sm"
                className="rounded-full text-xs font-bold px-4 shrink-0 text-brand-green border-brand-green hover:bg-brand-green-light/30"
                onClick={() => onUpgrade(nextSlug as "crescer" | "escalar")}
            >
                ativar plano
            </Button>
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
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/50 flex items-center justify-center shrink-0">
                <RocketIcon size={20} className="text-brand-green" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-brand-green bg-brand-green-light/70 dark:bg-dark-border/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Modo ERP
                    </span>
                    <p className="text-sm text-brand-dark dark:text-dark-heading">
                        Migre para o modo ERP completo com dashboard financeiro, fluxo de caixa e relatórios detalhados.
                    </p>
                </div>
            </div>
            <Button
                variant="default"
                size="sm"
                className="bg-brand-green hover:bg-brand-green/90 text-white border-none rounded-full px-4 text-xs font-bold shrink-0"
                onClick={handleUpgrade}
                disabled={loading}
            >
                {loading ? "Ativando..." : "Ativar"}
            </Button>
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
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/50 flex items-center justify-center shrink-0">
                <SparklesIcon size={20} className="text-brand-green" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-brand-green bg-brand-green-light/70 dark:bg-dark-border/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Dica {tipIdx + 1}/{PLATFORM_TIPS.length}
                    </span>
                    <p className="text-sm text-brand-dark dark:text-dark-heading">
                        {PLATFORM_TIPS[tipIdx]}
                    </p>
                </div>
            </div>
            <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-brand-green font-bold text-xs shrink-0"
                onClick={() => setTipIdx((prev) => (prev + 1) % PLATFORM_TIPS.length)}
            >
                Próxima <ChevronRightIcon size={14} />
            </Button>
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

                {/* Cards Grid */}
                <div className="flex flex-col gap-6">
                    {/* Onboarding - Full Width */}
                    {data.checklist && (
                        <ProgressCard
                            checklist={data.checklist}
                            onItemClick={handleChecklistItemClick}
                            onImportClick={handleImportClick}
                        />
                    )}

                    {/* Perfil de Vendedor + Ajuda e Suporte - 2 columns */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <QRCodeCard partnerUrl={data.partnerUrl} storeName={data.storeName || "Sua Loja"} />
                        <HelpCard />
                    </div>

                    {/* Plano + Modo ERP + Dicas - 2 columns banners */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <PlanUpgradeCard planSlug={data.planSlug} onUpgrade={openPlanUpgrade} />
                        {data.isQuickMode && (
                            <ModeCard partnerId={partnerId} onSuccess={() => router.refresh()} />
                        )}
                        <TipsCard />
                    </div>
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
