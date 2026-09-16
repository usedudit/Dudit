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
    SparklesIcon,
    WhatsappIcon,
    EyeIcon,
    Package,
    WrenchIcon,
    Store,
    BriefcaseIcon,
} from "@/lib/icons";
import { Button, ListItem, FormSection, DefaultModal, InfoCard, RadioButton } from "@/components/reusable";
import { useToast } from "@/hooks/use-toast";
import { deleteProductAction } from "@/app/actions/erp/products";
import { deleteServiceAction } from "@/app/actions/erp/servicos";
import AlertModal from "@/components/reusable/AlertModal";
import { ERPPageHeader } from "@/components/erp/page-header-state";
import { DashboardLayout } from "@/lib/dashboard-engine/types";
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal";
import { ERPOnboardingFeedbackModal } from "@/components/erp/ERPOnboardingFeedbackModal";
import { ERPOnboardingWizard } from "@/components/erp/onboarding/ERPOnboardingWizard";
import { StorePlaqueModal } from "@/components/erp/shared/StorePlaqueModal";
import { usePermissions } from "@/lib/permission-context";
import { MessageSquare } from "lucide-react";

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
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowModal(true)}
                leftIcon={<SparklesIcon size={16} />}
            >
                Gerar Placa com QR Code
            </Button>

            {showModal && (
                <StorePlaqueModal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    profileUrl={profileUrl}
                    storeName={storeName}
                />
            )}
        </>
    );
}

interface Stage {
    id: string;
    title: string;
    items: DashboardChecklistItem[];
}

const STAGE_CONFIG = [
    { id: "stage-1", title: "Produtos e Serviços", itemIds: ["items", "hours"] },
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

function VitrineHeroCard({ partnerUrl, storeName }: { partnerUrl: string; storeName: string }) {
    const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
    const [copied, setCopied] = useState(false);
    const [showOptionsModal, setShowOptionsModal] = useState(false);
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
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[200px] h-full flex flex-col justify-between">
            <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight">
                        Sua Vitrine & Catálogo Online
                    </h3>
                    <Button
                        variant="link"
                        size="sm"
                        onClick={() => setShowOptionsModal(true)}
                        className="text-xs p-0 h-auto font-semibold text-brand-green hover:underline cursor-pointer"
                    >
                        Opções da Vitrine
                    </Button>
                </div>

                <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed mb-4">
                    Compartilhe seu link exclusivo para clientes navegarem pelo seu catálogo e pedirem no WhatsApp.
                </p>

                {/* Link Box */}
                <div className="flex items-center justify-between gap-2 bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border rounded-xl p-2.5">
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

            {/* Modal de Opções da Vitrine & QR Code */}
            {showOptionsModal && (
                <DefaultModal
                    isOpen={showOptionsModal}
                    onClose={() => setShowOptionsModal(false)}
                    title="Opções da Vitrine Online"
                    description="Compartilhe seu link, divulgue no WhatsApp ou baixe a placa para o balcão"
                    maxWidth="xl"
                >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center py-2">
                        {/* QR Code e Link */}
                        <div className="md:col-span-6 flex flex-col items-center gap-3">
                            <div className="p-4 bg-white rounded-2xl border border-brand-border">
                                {qrCodeUrl ? (
                                    <img
                                        src={qrCodeUrl}
                                        alt="QR Code da Loja"
                                        className="w-44 h-44 object-contain rounded-lg"
                                    />
                                ) : (
                                    <div className="w-44 h-44 bg-brand-gray animate-pulse rounded-lg" />
                                )}
                            </div>
                            <p className="text-xs text-center text-brand-inactive-text dark:text-dark-body max-w-xs font-mono break-all">
                                {profileUrl}
                            </p>
                        </div>

                        {/* Botões de Ação */}
                        <div className="md:col-span-6 flex flex-col gap-3">
                            <Button
                                className="w-full"
                                onClick={openWhatsAppShare}
                                leftIcon={<WhatsappIcon size={16} />}
                            >
                                Testar no WhatsApp
                            </Button>

                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={openStore}
                                leftIcon={<EyeIcon size={16} />}
                            >
                                Abrir Vitrine
                            </Button>

                            <div className="w-full pt-1">
                                <QRCodePoster profileUrl={profileUrl} storeName={storeName} />
                            </div>
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
        { label: "Fale Conosco", description: "Suporte via chat ou WhatsApp", href: "/institucional/contato", icon: "MailIcon" },
    ];

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 min-h-[200px] h-full flex flex-col justify-between">
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
    const [currentStageIdx, setCurrentStageIdx] = useState(0);

    if (!checklist || checklist.items.length === 0) return null;

    const stages = buildStages(checklist.items);
    const currentStage = stages[currentStageIdx] || stages[0];
    const totalItems = checklist.items.length;
    const completedItems = checklist.items.filter(i => i.completed).length;
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-0 min-h-[200px] h-full flex flex-col md:flex-row overflow-hidden">
            {/* Lado Esquerdo - Cinza */}
            <div className="flex-1 min-w-0 bg-brand-gray dark:bg-dark-border/50 p-6 flex flex-col justify-between">
                <div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight mb-2">
                        Próximos passos para o seu negócio 🚀
                    </h3>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed mb-4">
                        Dicas rápidas para deixar sua vitrine ainda mais atrativa e pronta para receber pedidos.
                    </p>

                    {/* Barra de progresso geral */}
                    <div className="mb-2">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                Progresso geral
                            </span>
                            <span className="text-xs font-bold text-brand-green">
                                {completedItems}/{totalItems} ({progressPercent}%)
                            </span>
                        </div>
                        <div className="w-full h-2 bg-brand-border dark:bg-dark-border rounded-full overflow-hidden">
                            <div
                                className="h-full bg-brand-green rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                    <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                        Etapa {currentStageIdx + 1} de {stages.length}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentStageIdx((p) => Math.max(0, p - 1))}
                            disabled={currentStageIdx === 0}
                            className="w-8 h-8 rounded-full flex items-center justify-center border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface disabled:opacity-30 hover:bg-brand-gray/70 dark:hover:bg-dark-border/70 transition-colors cursor-pointer"
                            aria-label="Etapa anterior"
                        >
                            <ChevronLeftIcon size={14} className="text-brand-dark dark:text-dark-heading" />
                        </button>
                        <button
                            onClick={() => setCurrentStageIdx((p) => Math.min(stages.length - 1, p + 1))}
                            disabled={currentStageIdx >= stages.length - 1}
                            className="w-8 h-8 rounded-full flex items-center justify-center border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface disabled:opacity-30 hover:bg-brand-gray/70 dark:hover:bg-dark-border/70 transition-colors cursor-pointer"
                            aria-label="Próxima etapa"
                        >
                            <ChevronRightIcon size={14} className="text-brand-dark dark:text-dark-heading" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Lado Direito - Itens com ListItem */}
            <div className="flex-1 min-w-0 p-6 flex flex-col justify-center gap-2">
                {currentStage?.items.map((item, idx) => (
                    <ListItem
                        key={item.id}
                        onClick={() => onItemClick(item)}
                        title={item.title}
                        description={item.description}
                        left={
                            <span className={`text-xs font-bold w-6 text-center shrink-0 ${item.completed ? "text-brand-green" : "text-brand-inactive-text dark:text-dark-body"}`}>
                                {String(idx + 1).padStart(2, "0")}
                            </span>
                        }
                        right={
                            item.completed ? (
                                <CheckCircleIcon size={18} className="text-brand-green shrink-0" />
                            ) : (
                                <ChevronRightIcon size={16} className="text-brand-inactive-text shrink-0" />
                            )
                        }
                        className={`border rounded-2xl transition-all cursor-pointer p-3 ${item.completed
                            ? "border-brand-green/30 dark:border-brand-green/20 bg-brand-green-light/20 dark:bg-brand-green/5"
                            : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-brand-gray/30"
                            }`}
                    />
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
        <ListItem
            title="Teste grátis"
            description={descriptions[nextSlug]}
            icon={<SparklesIcon className="text-brand-green w-5 h-5 shrink-0" />}
            className="px-4 py-3"
            right={
                <Button
                    onClick={() => onUpgrade(nextSlug as "crescer" | "escalar")}
                >
                    Ativar plano
                </Button>
            }
        />
    );
}

function ModeCard({
    partnerId,
    isDesapego,
    onSuccess
}: {
    partnerId: string;
    isDesapego?: boolean;
    onSuccess: () => void;
}) {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedMode, setSelectedMode] = useState<"quick" | "erp">("quick");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleUpgrade = async (modeToSet: "quick" | "erp") => {
        setLoading(true);
        try {
            const { switchBusinessModeAction } = await import("@/app/actions/erp/quick-mode");
            const res = await switchBusinessModeAction(partnerId, modeToSet);
            if (res.success) {
                toast({
                    title: modeToSet === "erp" ? "Gestão completa ativada!" : "Vitrine Online ativada!",
                    description: modeToSet === "erp" ? "Bem-vindo ao modo Gestão completa." : "Sua vitrine online e catálogo comercial estão prontos."
                });
                setModalOpen(false);
                if (typeof window !== "undefined") {
                    window.location.reload();
                } else {
                    onSuccess();
                }
            } else {
                toast({ title: "Erro", description: res.error, variant: "destructive" });
            }
        } catch {
            toast({ title: "Erro", description: "Não foi possível alterar o modo", variant: "destructive" });
        }
        setLoading(false);
    };

    if (isDesapego) {
        return (
            <>
                <ListItem
                    title=" Evoluir negócio"
                    description="Ative a Vitrine Online ou o Gerenciador Completo (ERP) para desbloquear pedidos, catálogo comercial e mais."
                    icon={<RocketIcon className="text-brand-green w-5 h-5 shrink-0" />}
                    className="px-4 py-3"
                    right={
                        <Button
                            onClick={() => setModalOpen(true)}
                        >
                            Ativar plano
                        </Button>
                    }
                />

                <DefaultModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    title="Escolha como deseja evoluir"
                    description="Selecione o modo ideal para o seu negócio. Você poderá alternar quando quiser."
                    maxWidth="md"
                >
                    <div className="space-y-4">
                        <ListItem
                            title="Vitrine Online"
                            description="Crie uma vitrine com sua marca para divulgar e vender seus produtos"
                            icon={<Store className="text-brand-green w-5 h-5" />}
                            onClick={() => setSelectedMode("quick")}
                            left={
                                <RadioButton
                                    name="evolveMode"
                                    value="quick"
                                    checked={selectedMode === "quick"}
                                    onChange={() => setSelectedMode("quick")}
                                />
                            }
                            className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border hover:border-brand-green/60 rounded-2xl cursor-pointer transition-all"
                        />

                        <ListItem
                            title="Gerenciar meu negócio"
                            description="Controle completo de estoque, frente de caixa (PDV), fluxo de caixa e relatórios."
                            icon={<RocketIcon className="text-brand-green w-5 h-5" />}
                            onClick={() => setSelectedMode("erp")}
                            left={
                                <RadioButton
                                    name="evolveMode"
                                    value="erp"
                                    checked={selectedMode === "erp"}
                                    onChange={() => setSelectedMode("erp")}
                                />
                            }
                            className="px-4 py-3.5 gap-4 border border-brand-border dark:border-dark-border hover:border-brand-green/60 rounded-2xl cursor-pointer transition-all"
                        />

                        <div className="flex justify-end gap-3 pt-3 border-t border-brand-border dark:border-dark-border">
                            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={loading}>
                                Cancelar
                            </Button>
                            <Button onClick={() => handleUpgrade(selectedMode)} disabled={loading}>
                                {loading ? "Ativando..." : "Confirmar e Ativar"}
                            </Button>
                        </div>
                    </div>
                </DefaultModal>
            </>
        );
    }

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 flex items-center gap-4">
            <ListItem
                title="Gestão completa"
                description="Controle completo de estoque, frente de caixa (PDV), fluxo de caixa e relatórios."
                icon={<BriefcaseIcon className="text-brand-green w-5 h-5 shrink-0" />}
                className="px-4 py-3"
                right={
                    <Button
                        onClick={() => handleUpgrade("erp")}
                    >
                        {loading ? "Ativando..." : "Ativar"}
                    </Button>
                }
            />
        </div>
    );
}

// ============================================
// TIPS CARD
// ============================================

const MODE_TIPS: Record<string, string[]> = {
    desapego: [
        "Tire fotos nítidas com boa iluminação para destacar o estado real do seu item.",
        "Descreva com sinceridade o estado de conservação, tempo de uso e detalhes do produto.",
        "Responda rapidamente aos interessados no WhatsApp para fechar negócio mais rápido.",
        "Pesquise itens semelhantes para definir um preço atrativo e desapegar sem demora.",
        "Para segurança de ambos, prefira combinar a entrega ou retirada em locais públicos e movimentados.",
        "Compartilhe o link do seu anúncio em grupos e redes sociais para alcançar mais compradores.",
        "Mantenha o anúncio atualizado ou pause-o assim que o item for vendido.",
        "Inclua fotos de diferentes ângulos mostrando os principais detalhes do item.",
    ],
    quick: [
        "Compartilhe o link da sua Vitrine no Instagram, TikTok e status do WhatsApp.",
        "Personalize sua logo e banner para transmitir muito mais credibilidade aos clientes.",
        "Organize seus produtos e serviços em categorias para facilitar a navegação no catálogo.",
        "Baixe e imprima o poster com QR Code da sua vitrine para colocar no balcão da loja.",
        "Crie cupons de desconto sazonais para atrair novos clientes e incentivar a recompra.",
        "Adicione descrições detalhadas e benefícios de cada item no seu catálogo online.",
        "Conecte seu WhatsApp para receber os pedidos formatados diretamente na sua conversa.",
        "Divulgue promoções e novidades da semana nos seus canais de atendimento.",
    ],
    erp: [
        "Acompanhe o DRE e o fluxo de caixa semanalmente para manter as finanças sob controle.",
        "Mantenha seu estoque sempre conciliado para evitar rupturas e vendas de itens indisponíveis.",
        "Importe notas fiscais de entrada direto via XML de NF-e para abastecer seu estoque em segundos.",
        "Defina metas de vendas para engajar sua equipe e acompanhar resultados em tempo real.",
        "Utilize o PDV frente de caixa para agilizar o atendimento balcão e registrar vendas presenciais.",
        "Cadastre os dados completos de clientes para criar um histórico de compras e pós-venda.",
        "Monitore as comissões e produtividade dos vendedores direto pelo painel de desempenho.",
        "Configure políticas de trocas e recibos térmicos personalizados para sua operação.",
    ],
};

function TipsCard({ mode }: { mode?: string }) {
    const tipsList = React.useMemo(() => {
        const normalized = String(mode || "quick").toLowerCase();
        if (normalized === "desapego") return MODE_TIPS.desapego;
        if (normalized === "erp") return MODE_TIPS.erp;
        return MODE_TIPS.quick;
    }, [mode]);

    const [tipIdx, setTipIdx] = useState(0);

    useEffect(() => {
        setTipIdx(Math.floor(Math.random() * tipsList.length));
    }, [tipsList]);

    useEffect(() => {
        const interval = setInterval(() => {
            setTipIdx((prev) => {
                let next = prev;
                while (next === prev && tipsList.length > 1) {
                    next = Math.floor(Math.random() * tipsList.length);
                }
                return next;
            });
        }, 15000);
        return () => clearInterval(interval);
    }, [tipsList]);

    const currentTip = tipsList[tipIdx] || tipsList[0];

    return (
        <ListItem
            title="Dica"
            description={currentTip}
            icon={<SparklesIcon className="text-brand-green w-5 h-5 shrink-0" />}
            className="px-4 py-3"
            right={
                <ChevronRightIcon className="text-brand-inactive-text w-5 h-5 shrink-0" />
            }
        />
    );
}

// ============================================
// FEEDBACK CARD
// ============================================

function FeedbackCard({ onOpen }: { onOpen: () => void }) {
    return (
        <ListItem
            title="Feedback"
            description="Conte como está sendo sua experiência na Dudit e nos ajude a evoluir a plataforma."
            icon={<MessageSquare size={20} className="text-brand-green" />}
            className="px-4 py-3"
            right={
                <ChevronRightIcon className="text-brand-inactive-text w-5 h-5 shrink-0" />
            }
            onClick={onOpen}
        />
    );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function QuickModeHome({ data, partnerId }: QuickModeHomeProps) {
    const router = useRouter();
    const { toast } = useToast();
    const { partnerId: permPartnerId, planSlug: permPlanSlug, role: permRole } = usePermissions();
    const { openPlanUpgrade } = usePlanUpgrade();

    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState<{ id: string; itemType: 'product' | 'service'; name: string } | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(() => {
        return Boolean(data.onboardingCompleted || data.businessInfo?.onboardingCompleted);
    });
    const [showOnboardingWizard, setShowOnboardingWizard] = useState<boolean>(() => {
        const isDone = Boolean(data.onboardingCompleted || data.businessInfo?.onboardingCompleted);
        return !isDone && Boolean(data.needsOnboarding);
    });
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
                    {!onboardingCompleted && (
                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowOnboardingWizard(true)}
                                className="gap-2 border-brand-green/30 text-brand-green hover:bg-brand-green/10"
                            >
                                <SparklesIcon size={14} />
                                Guia de Configuração
                            </Button>
                        </div>
                    )}
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
                    {/* Modo Desapego: Cards Rápidos para Anunciar */}
                    {data.isDesapego ? (
                        <div className={`grid grid-cols-1 ${(!data.sellsProducts && !data.sellsServices) || (data.sellsProducts && data.sellsServices) ? "md:grid-cols-2" : "md:grid-cols-1"} gap-4`}>
                            {(data.sellsProducts || (!data.sellsProducts && !data.sellsServices)) && (
                                <ListItem
                                    icon={<Package className="text-brand-green w-5 h-5" />}
                                    title="Anunciar Produto ou Desapego"
                                    description="Venda itens novos, usados, eletrônicos, roupas ou produtos da sua loja"
                                    onClick={() => router.push("/erp/produtos?create=true")}
                                    showChevron
                                    className="p-5 gap-4 cursor-pointer border border-brand-border dark:border-dark-border hover:border-brand-green/60 rounded-2xl transition-all"
                                />
                            )}
                            {(data.sellsServices || (!data.sellsProducts && !data.sellsServices)) && (
                                <ListItem
                                    icon={<WrenchIcon className="text-brand-green w-5 h-5" />}
                                    title="Anunciar Serviço ou Atendimento"
                                    description="Divulgue seus serviços, agendamentos, consultoria, manutenções ou procedimentos"
                                    onClick={() => router.push("/erp/servicos?create=true")}
                                    showChevron
                                    className="p-5 gap-4 cursor-pointer border border-brand-border dark:border-dark-border hover:border-brand-green/60 rounded-2xl transition-all"
                                />
                            )}
                        </div>
                    ) : (
                        /* Onboarding - Full Width */
                        data.checklist && (
                            <ProgressCard
                                checklist={data.checklist}
                                onItemClick={handleChecklistItemClick}
                                onImportClick={handleImportClick}
                            />
                        )
                    )}

                    {/* Perfil de Vendedor + Ajuda e Suporte - 2 columns */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <QRCodeCard partnerUrl={data.partnerUrl} storeName={data.storeName || "Sua Loja"} />
                        <HelpCard />
                    </div>

                    {/* Plano + Modo ERP + Dicas + Feedback - 2 columns banners */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <PlanUpgradeCard planSlug={data.planSlug} onUpgrade={openPlanUpgrade} />
                        {(data.isQuickMode || data.isDesapego) && (
                            <ModeCard partnerId={partnerId} isDesapego={data.isDesapego} onSuccess={() => router.refresh()} />
                        )}
                        <TipsCard mode={data.businessMode || (data.isDesapego ? "desapego" : data.isQuickMode ? "quick" : "erp")} />
                        <FeedbackCard onOpen={() => setShowFeedbackModal(true)} />
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

                <ERPOnboardingFeedbackModal
                    isOpen={showFeedbackModal}
                    onClose={() => setShowFeedbackModal(false)}
                    partnerId={permPartnerId}
                    partnerPlan={permPlanSlug}
                    userRole={permRole}
                />

                <ERPOnboardingWizard
                    isOpen={showOnboardingWizard}
                    onClose={() => setShowOnboardingWizard(false)}
                    partnerId={partnerId}
                    storeName={data.storeName || "Sua Loja"}
                    partnerUrl={data.partnerUrl || "/"}
                    businessMode={data.businessMode || (data.isDesapego ? "desapego" : data.isQuickMode ? "quick" : "erp")}
                    sellsProducts={data.sellsProducts}
                    sellsServices={data.sellsServices}
                    onSuccess={() => {
                        setOnboardingCompleted(true);
                        setShowOnboardingWizard(false);
                        router.refresh();
                    }}
                />
            </div>
        </>
    );
}

export default QuickModeHome;
