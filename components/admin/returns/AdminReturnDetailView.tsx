"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ChevronLeftIcon,
  ThreeDotsIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  XIcon,
  ClockIcon,
  ReturnIcon,
  CalendarIcon,
  SaveIcon,
  EditIcon,
  TrashIcon,
  ImageIcon,
  PlusIcon,
} from "@/lib/icons";
import {
  Button,
  Badge,
  ActionsDropdown,
  ThreeDotsLoader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ListItem,
  FormSection,
  FormTextarea,
  Input,
  Combobox,
  Checkbox,
  MoneyInput,
  QuantitySelector,
  DefaultModal,
  IconPlaceholder,
  CustomerCard,
} from "@/components/reusable";
import { useSidebar } from "@/lib/sidebar-context";
import {
  getReturnRequestDetailsAction,
  processReturnRequestAction,
} from "@/app/actions/erp/returns";
import { getAdminReturnRequestDetail } from "@/app/actions/admin/return-detail";
import { ReturnHistoryTab } from "@/components/erp/returns/ReturnHistoryTab";
import { useToast } from "@/hooks/use-toast";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import {
  formatCurrency,
  formatDateTime,
  formatTime,
  formatDayMonth,
  formatDate,
} from "@/lib/utils";
import { FadeIn } from "@/components/animations/FadeIn";
import { getReturnResolutionLabel } from "@/lib/returns/types";
import { useStore } from "@/lib/store-context";
import ReturnPrintModal from "@/components/erp/returns/ReturnPrintModal";
import { useEntityState } from "@/hooks/use-entity-state";
import { useAdminActionModal, type AdminActionPayload } from "@/components/admin/AdminActionModal";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useNotification } from "@/hooks/use-notification";
import { useR2Upload } from "@/hooks/use-r2-upload";
import ImageCropperModal from "@/components/ImageCropperModal";
import { PermissionProvider } from "@/lib/permission-context";
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions";
import { StoreProvider } from "@/lib/store-context";
import { AdminBuyerCard } from "@/components/admin/AdminBuyerCard";
import { AdminStoreCard } from "@/components/admin/AdminStoreCard";

const formatReturnReasonLabel = (rawReason?: string | null): string => {
  if (!rawReason) return "Não informado";
  const r = String(rawReason).trim().toLowerCase();

  const labels: Record<string, string> = {
    defective: "Defeituoso / Danificado",
    wrong_item: "Item Errado",
    wrong_size: "Tamanho Errado / Incompatível",
    regret: "Desistência / Arrependimento",
    not_as_described: "Diferente do Anúncio",
    delayed: "Atraso na Entrega",
    other: "Outro Motivo",
    outro: "Outro Motivo",
    defeito: "Defeituoso / Danificado",
    item_errado: "Item Errado",
    "item errado": "Item Errado",
    "recebi item errado": "Item Errado",
    arrependimento: "Desistência / Arrependimento",
    tamanho: "Tamanho Errado / Incompatível",
  };

  if (labels[r]) return labels[r];

  return r
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatReturnConditionLabel = (rawCondition?: string | null): string => {
  if (!rawCondition) return "Padrão";
  const c = String(rawCondition).trim().toLowerCase();
  if (c === "sealed" || c === "lacrado") return "Lacrado";
  if (c === "damaged" || c === "danificado") return "Danificado";
  if (c === "opened" || c === "aberto") return "Aberto";
  if (c === "unopened") return "Não aberto";
  return c.charAt(0).toUpperCase() + c.slice(1);
};

const formatReturnResolutionLabel = (raw?: string | null): string => {
  if (!raw) return "Reembolso";
  const r = String(raw).trim().toLowerCase();
  const labels: Record<string, string> = {
    refund: "Reembolso",
    exchange: "Troca",
    store_credit: "Crédito em Loja",
    storecredit: "Crédito em Loja",
    replacement: "Substituição",
    cancellation: "Cancelamento",
    reembolso: "Reembolso",
    troca: "Troca",
  };
  return labels[r] || r.charAt(0).toUpperCase() + r.slice(1);
};

const getReturnStatusMetaLocal = (status?: string | null) => {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "PENDING_REVIEW":
    case "PENDING":
      return { label: "Pendente", variant: "orange" as const };
    case "UNDER_ANALYSIS":
    case "IN_ANALYSIS":
      return { label: "Em análise", variant: "blue" as const };
    case "WAITING_CUSTOMER":
      return { label: "Aguardando cliente", variant: "purple" as const };
    case "WAITING_ITEM_RETURN":
      return { label: "Aguardando devolução", variant: "purple" as const };
    case "APPROVED":
    case "COMPLETED":
      return { label: "Aprovada", variant: "green" as const };
    case "REJECTED":
      return { label: "Recusada", variant: "red" as const };
    case "PROCESSING":
      return { label: "Processando", variant: "blue" as const };
    case "RESOLVED":
      return { label: "Concluída", variant: "green" as const };
    case "EXPIRED":
      return { label: "Expirada", variant: "red" as const };
    case "ESCALATED":
      return { label: "Escalada", variant: "red" as const };
    default:
      return { label: s || "Pendente", variant: "orange" as const };
  }
};

interface AdminReturnDetailViewProps {
  detail: any;
  onBack: () => void;
  initialMode?: "view" | "edit";
}

type ReturnAdminActionContext = {
  reason?: string | null;
  riskScore?: number | null;
  notifySeller?: boolean;
  changedFields?: string[];
};

export default function AdminReturnDetailView({ detail, onBack, initialMode = "view" }: AdminReturnDetailViewProps) {
  const { toast } = useToast();
  const { success: notifySuccess, error: notifyError } = useNotification();
  const { modal: actionModal, runAction } = useAdminActionModal();
  const [activeTab, setActiveTab] = useState("general");
  const [isScrolled, setIsScrolled] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(initialMode === "edit");
  const [isSaving, setIsSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [returnEvents, setReturnEvents] = useState<any[]>([]);
  const [evidenceImages, setEvidenceImages] = useState<(string | File)[]>([]);
  const [evidenceUploads, setEvidenceUploads] = useState<any[]>([]);
  const [observations, setObservations] = useState("");
  const [sellerNotes, setSellerNotes] = useState("");
  const [returnStatus, setReturnStatus] = useState("");
  const [approvedResolution, setApprovedResolution] = useState("");
  const [refundValue, setRefundValue] = useState(0);
  const [storeCreditValue, setStoreCreditValue] = useState(0);
  const [refundPaymentMethod, setRefundPaymentMethod] = useState("");
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [exchangeItems, setExchangeItems] = useState<any[]>([]);
  const [exchangeBalanceResolution, setExchangeBalanceResolution] = useState<"store_credit" | "refund">("store_credit");
  const [returnToInventory, setReturnToInventory] = useState(false);
  const [returnToInventoryItems, setReturnToInventoryItems] = useState<{ id: string; quantity: number }[] | null>(null);
  const [isInventoryRestoreModalOpen, setIsInventoryRestoreModalOpen] = useState(false);
  const [inventoryRestoreQuantities, setInventoryRestoreQuantities] = useState<Record<string, number>>({});
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null);
  const [uploadingImages, setUploadingImages] = useState<Set<number>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingSaveData = useRef<Partial<any> | null>(null);

  // Header override for mobile back button
  let sidebarContext: ReturnType<typeof useSidebar> | null = null;
  try {
    sidebarContext = useSidebar();
  } catch { }

  const setHeaderOverride = sidebarContext?.setHeaderOverride;

  const handleScroll = useCallback(() => {
    setIsScrolled((scrollRef.current?.scrollTop || 0) > 20);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", handleScroll);
      return () => el.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [fullDetail, setFullDetail] = useState<any>(null);

  // Determine if we have full detail or just basic request
  const hasFullDetail = !!(detail?.riskEvents && detail?.buyerProfile);
  const baseRequest = detail?.request || detail;

  // Fetch full detail if needed
  useEffect(() => {
    if (baseRequest?.id && !hasFullDetail) {
      let cancelled = false;
      setIsLoadingDetail(true);
      getAdminReturnRequestDetail(baseRequest.id)
        .then((data) => {
          if (!cancelled && data) {
            setFullDetail(data);
          }
        })
        .catch((err) => {
          console.error("[AdminReturnDetailView] Failed to fetch detail:", err);
        })
        .finally(() => {
          if (!cancelled) setIsLoadingDetail(false);
        });
      return () => { cancelled = true; };
    }
  }, [baseRequest?.id, hasFullDetail]);

  const request = fullDetail?.request || baseRequest;
  const riskEvents = fullDetail?.riskEvents || detail?.riskEvents || [];
  const moderationActions = fullDetail?.moderationActions || detail?.moderationActions || [];
  const relatedReports = fullDetail?.relatedReports || detail?.relatedReports || [];
  const buyerProfile = fullDetail?.buyerProfile || detail?.buyerProfile || {};
  const store = request?.stores || {};

  const returnId = request?.id?.slice(0, 8) || "N/A";
  const returnFullId = request?.id || "";
  const statusMeta = getReturnStatusMetaLocal(request?.status);
  const resolutionLabel = getReturnResolutionLabel(
    request?.approvedResolution || request?.desiredResolution || "refund"
  );

  // Load history events
  useEffect(() => {
    if (request?.auditLogs) {
      setReturnEvents(request.auditLogs);
    }
  }, [request]);

  // Initialize form data from request
  useEffect(() => {
    if (request) {
      setReturnStatus(request.status);
      setApprovedResolution(request.approvedResolution || request.desiredResolution || "refund");
      setRefundValue(Number(request.refundValue || 0));
      setStoreCreditValue(Number(request.storeCreditValue || 0));
      setRefundPaymentMethod(request.refundPaymentMethod || "");
      setObservations(request.observations || request.sellerNotes || "");
      setSellerNotes(request.sellerNotes || "");
      
      // Initialize items
      const items = (request.items || []).map((item: any) => ({
        id: item.id,
        orderItemId: item.orderItemId,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        image: item.image,
        price: item.price,
        netItemValue: item.netItemValue,
        quantity: item.quantity,
        maxQuantity: item.orderedQuantity || item.quantity,
        checked: true,
        reason: item.reason,
        condition: item.condition,
      }));
      setReturnItems(items);

      // Initialize evidence images
      const evidence = (request.evidenceImages || []).map((url: string) => url);
      setEvidenceImages(evidence);
      setEvidenceUploads((request as any).evidenceUploads || evidence.map((url: string) => ({ file_url: url })));

      // Initialize exchange items
      if (request.exchangeItemsSnapshot && request.exchangeItemsSnapshot.length > 0) {
        setExchangeItems(request.exchangeItemsSnapshot.map((ei: any) => ({
          productId: ei.product_id,
          productName: ei.product_name,
          sku: ei.sku,
          quantity: ei.quantity || 1,
          unitPrice: ei.unit_price || 0,
        })));
      }
      setExchangeBalanceResolution(request.exchangeBalanceResolution || "store_credit");
    }
  }, [request]);

  const handleBack = useCallback(() => {
    if (isEditMode) {
      // Check for unsaved changes
      const hasChanges = 
        returnStatus !== request?.status ||
        approvedResolution !== (request?.approvedResolution || request?.desiredResolution || "refund") ||
        Number(refundValue) !== Number(request?.refundValue || 0) ||
        Number(storeCreditValue) !== Number(request?.storeCreditValue || 0) ||
        refundPaymentMethod !== (request?.refundPaymentMethod || "") ||
        observations !== (request?.observations || request?.sellerNotes || "") ||
        sellerNotes !== (request?.sellerNotes || "");
      
      if (hasChanges) {
        // Could show a confirmation dialog here
        if (!confirm("Você tem alterações não salvas. Deseja sair mesmo assim?")) {
          return;
        }
      }
      setIsEditMode(false);
    }
    onBack();
  }, [isEditMode, request, returnStatus, approvedResolution, refundValue, storeCreditValue, refundPaymentMethod, observations, sellerNotes, onBack]);

  useEffect(() => {
    const title = isEditMode
      ? `Editar devolução DVL-${returnId}`
      : `Solicitação #${returnId}`;
    setHeaderOverride?.({
      title,
      onBack: handleBack,
      isSubPage: true,
    });
    return () => setHeaderOverride?.(null);
  }, [isEditMode, returnId, handleBack, setHeaderOverride]);

  const isDirty = useMemo(() => {
    if (!isEditMode || isSaving || isUploading) return false;
    if (!request) return false;
    
    return (
      returnStatus !== request.status ||
      approvedResolution !== (request.approvedResolution || request.desiredResolution || "refund") ||
      Number(refundValue) !== Number(request.refundValue || 0) ||
      Number(storeCreditValue) !== Number(request.storeCreditValue || 0) ||
      refundPaymentMethod !== (request.refundPaymentMethod || "") ||
      observations !== (request.observations || request.sellerNotes || "") ||
      sellerNotes !== (request.sellerNotes || "")
    );
  }, [isEditMode, isSaving, isUploading, request, returnStatus, approvedResolution, refundValue, storeCreditValue, refundPaymentMethod, observations, sellerNotes]);

  const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty);
  const handleBackWithConfirm = useCallback(() => handleNavigation(handleBack), [handleNavigation, handleBack]);

  const items = returnItems.length > 0 ? returnItems : (request?.items || []);
  const evidence = request?.return_evidence || [];
  const messages = request?.return_messages || [];
  const events = returnEvents;

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    notifySuccess("Link da solicitação copiado!");
  }, [notifySuccess]);

  // Admin action gate
  const adminActionGate = useCallback(
    async (changedFields: string[]): Promise<{ cancelled?: boolean; ctx?: ReturnAdminActionContext }> => {
      let capturedCtx: ReturnAdminActionContext | undefined;
      const result = await runAction({
        title: "Salvar alterações",
        description: `Solicitação DVL-${returnId}`,
        changedFields,
        force: true,
        confirmLabel: "Salvar",
        notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
        runner: async (payload: AdminActionPayload) => {
          capturedCtx = {
            reason: payload.reason || null,
            riskScore: payload.riskScore,
            notifySeller: payload.notifySeller,
            changedFields,
          };
          return { success: true };
        },
      });
      if (result.cancelled) return { cancelled: true };
      return { ctx: capturedCtx };
    },
    [returnId, runAction],
  );

  const computeChangedFields = useCallback((data: Partial<any>) => {
    if (!request) return [];
    const fields: string[] = [];

    if (data.status && data.status !== request.status) fields.push("status");
    if (data.approvedResolution && data.approvedResolution !== (request.approvedResolution || request.desiredResolution || "refund")) fields.push("resolução");
    if (Number(data.refundValue || 0) !== Number(request.refundValue || 0)) fields.push("valor do reembolso");
    if (Number(data.storeCreditValue || 0) !== Number(request.storeCreditValue || 0)) fields.push("vale-compra");
    if ((data.observations || "") !== (request.observations || request.sellerNotes || "")) fields.push("observações");
    if (data.sellerNotes && data.sellerNotes !== (request.sellerNotes || "")) fields.push("notas do vendedor");
    if (data.refundPaymentMethod && data.refundPaymentMethod !== (request.refundPaymentMethod || "")) {
      fields.push("método de reembolso");
    }

    return fields;
  }, [request]);

  const saveWithAdminGate = useCallback(async (data: Partial<any>) => {
    const changedFields = computeChangedFields(data);
    const gate = await adminActionGate(changedFields);
    if (gate?.cancelled) return;
    
    setIsSaving(true);
    try {
      const partnerId = request.partnerId;
      const requestId = request.id;
      const nextStatus = data.status || request.status;
      const isApprovedStatus = ["APPROVED", "PROCESSING", "RESOLVED"].includes(nextStatus);
      const isRejectedStatus = nextStatus === "REJECTED";
      const refundVal = (isApprovedStatus && !isRejectedStatus) ? Number(data.refundValue || 0) : 0;

      const response = await processReturnRequestAction({
        partnerId,
        requestId,
        action: "updated",
        nextStatus,
        refundAmount: refundVal,
        refundStatus: isApprovedStatus && refundVal > 0 ? "APPROVED" : (isRejectedStatus ? "FAILED" : "PENDING"),
        refundPaymentMethod: (isApprovedStatus && (data.approvedResolution === "refund" || (data.approvedResolution === "exchange" && data.exchangeBalanceResolution === "refund")))
          ? data.refundPaymentMethod || null
          : null,
        returnToInventory: data.returnToInventory || false,
        returnToInventoryItems: data.returnToInventoryItems || null,
        customerId: data.customerId || null,
        storeCreditAmount: (isApprovedStatus && data.approvedResolution === "store_credit") ? Number(data.storeCreditValue || 0) : 0,
        exchangeItems: (isApprovedStatus && data.approvedResolution === "exchange") ? data.exchangeItems || [] : [],
        exchangeBalanceResolution: (isApprovedStatus && data.approvedResolution === "exchange") ? data.exchangeBalanceResolution || null : null,
        notes: data.observations || data.sellerNotes || "",
        idempotencyKey: `admin-update:${requestId}:${Date.now()}`,
        accountId: isApprovedStatus ? (data.accountId || null) : null,
      }, {
        adminBypass: true,
        actionCtx: gate?.ctx ?? null,
      });

      if (!response.success) throw new Error(response.error);

      toast({ title: "Sucesso", description: "Solicitação atualizada com sucesso." });
      setIsEditMode(false);
      handleBackWithConfirm();
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message || "Erro ao salvar devolução.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [request, adminActionGate, computeChangedFields, toast, handleBackWithConfirm]);

  const handleSave = useCallback(() => {
    const data = {
      status: returnStatus,
      approvedResolution,
      refundValue,
      storeCreditValue,
      refundPaymentMethod,
      observations,
      sellerNotes,
      returnToInventory,
      returnToInventoryItems,
      exchangeItems,
      exchangeBalanceResolution,
    };
    saveWithAdminGate(data);
  }, [returnStatus, approvedResolution, refundValue, storeCreditValue, refundPaymentMethod, observations, sellerNotes, returnToInventory, returnToInventoryItems, exchangeItems, exchangeBalanceResolution, saveWithAdminGate]);

  const evidenceUploader = useR2Upload({
    endpoint: "/api/r2/returns-evidence",
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  });

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (file) {
      setSelectedImageForCrop(file);
      setShowImageCropper(true);
    }
  }, []);

  const handleImageCropComplete = useCallback(async (croppedImageDataUrl: string) => {
    try {
      const blob = await (await fetch(croppedImageDataUrl)).blob();
      const extensionMap: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };
      const extension = extensionMap[blob.type] || "jpg";
      const file = new File([blob], `evidence-image.${extension}`, { type: blob.type });
      setEvidenceImages((prev) => [...prev, file]);
    } catch (err) {
      console.error("Error cropping image:", err);
    } finally {
      setShowImageCropper(false);
      setSelectedImageForCrop(null);
    }
  }, []);

  const handleRemoveImage = useCallback((indexToDelete: number) => {
    setEvidenceImages((prev) => prev.filter((_, i) => i !== indexToDelete));
  }, []);

  const handleSetPrimaryImage = useCallback((index: number) => {
    if (!evidenceImages.length) return;
    const images = [...evidenceImages];
    const [primary] = images.splice(index, 1);
    images.unshift(primary);
    setEvidenceImages(images);
  }, [evidenceImages]);

  // IMPORTANT: all hooks must run before these early returns, otherwise React
  // throws "Rendered fewer hooks than expected" when the detail finishes loading.
  if (isLoadingDetail) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <ThreeDotsLoader />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
        <IconPlaceholder
          icon={ReturnIcon}
          containerSize="w-16 h-16 mb-2"
          iconSize="w-6 h-6"
          title="Solicitação não encontrada"
          subtitle="A solicitação pode ter sido removida ou o link está incorreto."
          itemButton={{
            text: "Voltar às devoluções",
            action: onBack,
            variant: "outline",
          }}
        />
      </div>
    );
  }

  return (
    <PermissionProvider
      role="OWNER"
      routePermissions={ROUTE_PERMISSION_PRESETS.OWNER}
      partnerId={request.partnerId}
      businessInfo={{}}
      planSlug="escalar"
    >
      <StoreProvider
        partnerId={request.partnerId}
        initialStores={store ? [store] : []}
        activeStoreId={request.store_id || store?.id || null}
      >
        <div className="flex flex-col bg-white dark:bg-dark-background min-h-screen">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

              {/* Sticky Header */}
              <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                  {/* Back button - desktop only */}
                  <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                    <Button variant="filled" onClick={handleBackWithConfirm} className="w-10 h-10 p-0 flex items-center justify-center">
                      <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                    </Button>
                  </div>

                  {/* Title row - desktop */}
                  <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                      <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                        <span className="hidden md:inline truncate">Solicitação #{returnId}</span>
                        <Badge variant={statusMeta.variant}>
                          {statusMeta.label}
                        </Badge>
                        <Badge variant="blue">
                          {formatReturnResolutionLabel(request?.request_type)}
                        </Badge>
                      </h1>

                      <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                        Criado em {formatDateTime(request?.created_at)} • Pedido: #{request?.order_number_snapshot || request?.orders?.order_number || "-"}
                      </div>
                    </div>

                    {/* Desktop action buttons */}
                    <div className="hidden md:flex items-center gap-2.5 shrink-0 ml-3">
                      {isEditMode ? (
                        <>
                          <Button variant="outline" onClick={() => setIsEditMode(false)}>
                            <XIcon size={16} className="mr-1" />
                            Cancelar
                          </Button>
                          <Button onClick={handleSave} isLoading={isSaving} leftIcon={<SaveIcon size={16} />}>
                            Salvar
                          </Button>
                        </>
                      ) : (
                        <>
                          <ActionsDropdown
                            onPrint={() => setPrintModalOpen(true)}
                            onShare={handleShare}
                          />
                          <Button variant="default" onClick={() => setIsEditMode(true)} leftIcon={<EditIcon size={16} />}>
                            Editar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                      <TabsTrigger value="general">Geral & Itens</TabsTrigger>
                      <TabsTrigger value="parties">Comprador & Loja</TabsTrigger>
                      <TabsTrigger value="evidence">Evidências & Mensagens ({evidence.length + messages.length})</TabsTrigger>
                      <TabsTrigger value="timeline">Timeline ({events.length})</TabsTrigger>
                      <TabsTrigger value="risk">Risco & Auditoria ({riskEvents.length})</TabsTrigger>
                    </TabsList>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                <TabsContent value="general" className="mt-0">
                  <FadeIn key="general">
                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                      {/* Coluna principal */}
                      <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                        <FormSection title={`Itens da Solicitação (${items.length})`} hasSeparator>
                          {items.length === 0 ? (
                            <IconPlaceholder
                              icon={ReturnIcon}
                              containerSize="w-14 h-14 mb-2"
                              iconSize="w-6 h-6"
                              title="Nenhum item especificado"
                              subtitle="Esta solicitação não possui itens vinculados."
                            />
                          ) : (
                            <div className="space-y-4">
                              {items.map((item: any, idx: number) => (
                                <div key={item.id || idx} className="flex items-start gap-4">
                                  <div className="w-12 h-12 overflow-hidden shrink-0 rounded-xl border border-brand-border dark:border-dark-border flex items-center justify-center">
                                    {item.image ? (
                                      <img src={getR2ImageUrl(item.image, "thumb")} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <IconPlaceholder icon={ReturnIcon} containerSize="w-12 h-12" iconSize="w-6 h-6" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start gap-2">
                                      <div className="min-w-0 flex flex-col">
                                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                          {item.productName || "Produto"}
                                        </h4>
                                        <span className="text-xs text-brand-inactive-text mt-0.5">
                                          Qtd: <strong>{item.quantity || 1}</strong> • Condição: {formatReturnConditionLabel(item.condition)}
                                        </span>
                                        {item.reason && (
                                          <span className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">
                                            Motivo: {formatReturnReasonLabel(item.reason)}
                                          </span>
                                        )}
                                        {isEditMode && (
                                          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                                            <QuantitySelector
                                              value={item.quantity}
                                              onChange={(v: number) => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: v } : it))}
                                              min={1}
                                              max={item.maxQuantity}
                                            />
                                            <Combobox
                                              value={item.reason}
                                              onChange={(v) => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, reason: v } : it))}
                                              options={[
                                                { value: "defective", label: "Defeituoso" },
                                                { value: "wrong_item", label: "Item Errado" },
                                                { value: "wrong_size", label: "Tamanho Errado" },
                                                { value: "regret", label: "Arrependimento" },
                                                { value: "not_as_described", label: "Diferente do Anúncio" },
                                                { value: "delayed", label: "Atraso na Entrega" },
                                                { value: "other", label: "Outro" },
                                              ]}
                                              placeholder="Motivo"
                                              className="w-full"
                                            />
                                            <Combobox
                                              value={item.condition}
                                              onChange={(v) => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, condition: v } : it))}
                                              options={[
                                                { value: "opened", label: "Aberto" },
                                                { value: "sealed", label: "Lacrado" },
                                                { value: "damaged", label: "Danificado" },
                                              ]}
                                              placeholder="Condição"
                                              className="w-full"
                                            />
                                            <Checkbox
                                              checked={item.checked}
                                              onChange={(checked) => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, checked } : it))}
                                              label="Incluir"
                                            />
                                          </div>
                                        )}
                                      </div>
                                      <span className="font-bold text-sm text-brand-dark dark:text-dark-heading shrink-0">
                                        {formatCurrency(Number(item.net_item_value_snapshot || item.price || 0) * (item.quantity || 1))}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </FormSection>

                        <FormSection title="Motivo informado pelo cliente" hasSeparator>
                          <div className="text-sm text-brand-dark dark:text-dark-heading bg-brand-gray/50 dark:bg-dark-border/30 p-4 rounded-xl">
                            {request?.customer_reason || request?.customer_details || "Nenhum detalhe adicional fornecido."}
                          </div>
                        </FormSection>

                        {/* Resolution & Values - editable in edit mode */}
                        <FormSection title="Resolução & Valores" hasSeparator>
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Resolução Aprovada</label>
                                {isEditMode ? (
                                  <Combobox
                                    value={approvedResolution}
                                    onChange={setApprovedResolution}
                                    options={[
                                      { value: "refund", label: "Reembolso" },
                                      { value: "exchange", label: "Troca" },
                                      { value: "store_credit", label: "Crédito em Loja" },
                                      { value: "replacement", label: "Substituição" },
                                      { value: "cancellation", label: "Cancelamento" },
                                      { value: "none", label: "Nenhuma" },
                                    ]}
                                    placeholder="Selecione"
                                    className="w-full"
                                  />
                                ) : (
                                  <div className="font-bold text-brand-dark dark:text-dark-heading">{resolutionLabel}</div>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Status</label>
                                {isEditMode ? (
                                  <Combobox
                                    value={returnStatus}
                                    onChange={setReturnStatus}
                                    options={[
                                      { value: "PENDING_REVIEW", label: "Pendente" },
                                      { value: "UNDER_ANALYSIS", label: "Em análise" },
                                      { value: "WAITING_CUSTOMER", label: "Aguardando cliente" },
                                      { value: "WAITING_ITEM_RETURN", label: "Aguardando devolução" },
                                      { value: "APPROVED", label: "Aprovada" },
                                      { value: "PROCESSING", label: "Processando" },
                                      { value: "RESOLVED", label: "Concluída" },
                                      { value: "REJECTED", label: "Recusada" },
                                      { value: "EXPIRED", label: "Expirada" },
                                      { value: "ESCALATED", label: "Escalada" },
                                    ]}
                                    placeholder="Selecione"
                                    className="w-full"
                                  />
                                ) : (
                                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                                )}
                              </div>
                            </div>

                            {isEditMode && approvedResolution === "refund" && (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                  <label className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Valor do Reembolso</label>
                                  <MoneyInput
                                    value={refundValue}
                                    onChange={setRefundValue}
                                    placeholder="0,00"
                                    className="w-full"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Método de Reembolso</label>
                                  <Combobox
                                    value={refundPaymentMethod}
                                    onChange={setRefundPaymentMethod}
                                    options={[
                                      { value: "pix", label: "Pix" },
                                      { value: "credit_card", label: "Cartão de Crédito" },
                                      { value: "debit_card", label: "Cartão de Débito" },
                                      { value: "cash", label: "Dinheiro" },
                                      { value: "mercado_pago", label: "Mercado Pago" },
                                      { value: "store_credit", label: "Crédito em Loja" },
                                      { value: "other", label: "Outro" },
                                    ]}
                                    placeholder="Selecione"
                                    className="w-full"
                                  />
                                </div>
                                <div className="flex items-end">
                                  <label className="flex items-center gap-2 w-full">
                                    <Checkbox
                                      checked={returnToInventory}
                                      onChange={setReturnToInventory}
                                    />
                                    <span className="text-sm text-brand-dark dark:text-dark-heading">Devolver ao estoque</span>
                                  </label>
                                </div>
                              </div>
                            )}

                            {isEditMode && approvedResolution === "store_credit" && (
                              <div>
                                <label className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Valor do Vale-Compra</label>
                                <MoneyInput
                                  value={storeCreditValue}
                                  onChange={setStoreCreditValue}
                                  placeholder="0,00"
                                  className="w-full"
                                />
                              </div>
                            )}

                            {isEditMode && approvedResolution === "exchange" && (
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Saldo da Troca</label>
                                    <Combobox
                                      value={exchangeBalanceResolution}
                                      onChange={(v: string) => setExchangeBalanceResolution(v as "store_credit" | "refund")}
                                      options={[
                                        { value: "store_credit", label: "Vale-Compra" },
                                        { value: "refund", label: "Reembolso" },
                                      ]}
                                      placeholder="Selecione"
                                      className="w-full"
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <label className="flex items-center gap-2 w-full">
                                      <Checkbox
                                        checked={returnToInventory}
                                        onChange={setReturnToInventory}
                                      />
                                      <span className="text-sm text-brand-dark dark:text-dark-heading">Devolver itens originais ao estoque</span>
                                    </label>
                                  </div>
                                </div>
                                {exchangeBalanceResolution === "refund" && (
                                  <div>
                                    <label className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Valor do Reembolso (saldo)</label>
                                    <MoneyInput
                                      value={refundValue}
                                      onChange={setRefundValue}
                                      placeholder="0,00"
                                      className="w-full"
                                    />
                                  </div>
                                )}
                                {exchangeBalanceResolution === "store_credit" && (
                                  <div>
                                    <label className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Valor do Vale-Compra (saldo)</label>
                                    <MoneyInput
                                      value={storeCreditValue}
                                      onChange={setStoreCreditValue}
                                      placeholder="0,00"
                                      className="w-full"
                                    />
                                  </div>
                                )}
                              </div>
                            )}

                            {!isEditMode && (
                              <>
                                {request?.refundValue > 0 && (
                                  <ListItem
                                    title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Valor do Reembolso</span>}
                                    right={<span className="font-bold text-brand-green dark:text-brand-green">{formatCurrency(request.refundValue)}</span>}
                                  />
                                )}
                                {request?.storeCreditValue > 0 && (
                                  <ListItem
                                    title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Vale-Compra</span>}
                                    right={<span className="font-bold text-brand-blue dark:text-brand-blue">{formatCurrency(request.storeCreditValue)}</span>}
                                  />
                                )}
                                {request?.refundPaymentMethod && (
                                  <ListItem
                                    title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Método de Reembolso</span>}
                                    right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.refundPaymentMethod}</span>}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </FormSection>

                        {/* Observations - editable in edit mode */}
                        <FormSection title="Observações" hasSeparator>
                          {isEditMode ? (
                            <div className="space-y-4">
                              <FormTextarea
                                label="Observações Internas"
                                value={observations}
                                onChange={(e) => setObservations(e.target.value)}
                                placeholder="Observações para uso interno..."
                                rows={3}
                              />
                              <FormTextarea
                                label="Notas do Vendedor"
                                value={sellerNotes}
                                onChange={(e) => setSellerNotes(e.target.value)}
                                placeholder="Notas para o vendedor..."
                                rows={3}
                              />
                            </div>
                          ) : (
                            <>
                              {request?.customerMessage && (
                                <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">Mensagem do Cliente</p>
                                  <p className="whitespace-pre-wrap text-brand-dark dark:text-dark-heading">{request.customerMessage}</p>
                                </div>
                              )}
                              {request?.observations && (
                                <div className="mb-4 p-4 bg-brand-gray/30 dark:bg-dark-border/30 border border-brand-border/50 dark:border-dark-border/50 rounded-xl">
                                  <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Observações Internas</p>
                                  <p className="whitespace-pre-wrap text-brand-dark dark:text-dark-heading">{request.observations}</p>
                                </div>
                              )}
                              {request?.sellerNotes && (
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                                  <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">Notas do Vendedor</p>
                                  <p className="whitespace-pre-wrap text-brand-dark dark:text-dark-heading">{request.sellerNotes}</p>
                                </div>
                              )}
                              {!request?.customerMessage && !request?.observations && !request?.sellerNotes && (
                                <div className="text-center py-12 text-brand-inactive-text dark:text-dark-body">
                                  Nenhuma observação registrada
                                </div>
                              )}
                            </>
                          )}
                        </FormSection>

                        {/* Evidence upload in edit mode */}
                        {isEditMode && (
                          <FormSection title="Evidências" hasSeparator>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {evidenceImages.map((img, idx) => (
                                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-brand-border dark:border-dark-border group">
                                    {img instanceof File ? (
                                      <img
                                        src={URL.createObjectURL(img)}
                                        alt={`Evidência ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <img
                                        src={img}
                                        alt={`Evidência ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveImage(idx)}
                                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <XIcon size={12} />
                                    </button>
                                    {idx === 0 && (
                                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-green-600 text-white text-[10px] font-medium rounded">
                                        Principal
                                      </span>
                                    )}
                                  </div>
                                ))}
                                <label className="relative aspect-square rounded-xl border-2 border-dashed border-brand-border dark:border-dark-border flex flex-col items-center justify-center cursor-pointer hover:border-brand-dark/50 transition-colors">
                                  <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    onChange={handleImageUpload}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                  />
                                  <PlusIcon size={24} className="text-brand-inactive-text" />
                                  <span className="text-xs text-brand-inactive-text mt-1">Adicionar</span>
                                </label>
                              </div>
                            </div>
                          </FormSection>
                        )}
                      </div>

                      {/* Sidebar */}
                      <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                        <div className="sticky top-24 space-y-6">
                          {/* Status Card */}
                          <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Status Atual</h3>
                            <div className="space-y-3">
                              <ListItem
                                title={<span className="text-sm text-brand-inactive-text dark:text-dark-body">Status da Solicitação</span>}
                                right={isEditMode ? (
                                  <Combobox
                                    value={returnStatus}
                                    onChange={setReturnStatus}
                                    options={[
                                      { value: "PENDING_REVIEW", label: "Pendente" },
                                      { value: "UNDER_ANALYSIS", label: "Em análise" },
                                      { value: "WAITING_CUSTOMER", label: "Aguardando cliente" },
                                      { value: "WAITING_ITEM_RETURN", label: "Aguardando devolução" },
                                      { value: "APPROVED", label: "Aprovada" },
                                      { value: "PROCESSING", label: "Processando" },
                                      { value: "RESOLVED", label: "Concluída" },
                                      { value: "REJECTED", label: "Recusada" },
                                      { value: "EXPIRED", label: "Expirada" },
                                      { value: "ESCALATED", label: "Escalada" },
                                    ]}
                                    placeholder="Selecione"
                                    className="w-full max-w-[200px]"
                                  />
                                ) : (
                                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                                )}
                              />
                              <ListItem
                                title={<span className="text-sm text-brand-inactive-text dark:text-dark-body">Resolução</span>}
                                right={isEditMode ? (
                                  <Combobox
                                    value={approvedResolution}
                                    onChange={setApprovedResolution}
                                    options={[
                                      { value: "refund", label: "Reembolso" },
                                      { value: "exchange", label: "Troca" },
                                      { value: "store_credit", label: "Crédito em Loja" },
                                      { value: "replacement", label: "Substituição" },
                                      { value: "cancellation", label: "Cancelamento" },
                                      { value: "none", label: "Nenhuma" },
                                    ]}
                                    placeholder="Selecione"
                                    className="w-full max-w-[200px]"
                                  />
                                ) : (
                                  <span className="font-medium text-brand-dark dark:text-dark-heading">{resolutionLabel}</span>
                                )}
                              />
                              {request?.refundValue > 0 && (
                                <ListItem
                                  title={<span className="text-sm text-brand-inactive-text dark:text-dark-body">Reembolso</span>}
                                  right={isEditMode ? (
                                    <MoneyInput
                                      value={refundValue}
                                      onChange={setRefundValue}
                                      placeholder="0,00"
                                      className="w-full max-w-[200px]"
                                    />
                                  ) : (
                                    <span className="font-bold text-brand-green dark:text-brand-green">{formatCurrency(request.refundValue)}</span>
                                  )}
                                />
                              )}
                              {request?.storeCreditValue > 0 && (
                                <ListItem
                                  title={<span className="text-sm text-brand-inactive-text dark:text-dark-body">Vale-Compra</span>}
                                  right={isEditMode ? (
                                    <MoneyInput
                                      value={storeCreditValue}
                                      onChange={setStoreCreditValue}
                                      placeholder="0,00"
                                      className="w-full max-w-[200px]"
                                    />
                                  ) : (
                                    <span className="font-bold text-brand-blue dark:text-brand-blue">{formatCurrency(request.storeCreditValue)}</span>
                                  )}
                                />
                              )}
                            </div>
                          </div>

                          {/* Timeline Summary */}
                          <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Resumo</h3>
                            <div className="space-y-3 text-sm">
                              <ListItem
                                title={<span className="text-brand-inactive-text dark:text-dark-body">Itens</span>}
                                right={<span className="font-bold text-brand-dark dark:text-dark-heading">{items.length}</span>}
                              />
                              <ListItem
                                title={<span className="text-brand-inactive-text dark:text-dark-body">Total de Produtos</span>}
                                right={<span className="font-bold text-brand-dark dark:text-dark-heading">{items.reduce((acc: number, i: any) => acc + Number(i.quantity || 0), 0)}</span>}
                              />
                              <ListItem
                                title={<span className="text-brand-inactive-text dark:text-dark-body">Evidências</span>}
                                right={<span className="font-bold text-brand-dark dark:text-dark-heading">{evidenceImages.length + evidence.length}</span>}
                              />
                              <ListItem
                                title={<span className="text-brand-inactive-text dark:text-dark-body">Origem</span>}
                                right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.source || "erp"}</span>}
                              />
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Ações</h3>
                            <div className="space-y-2">
                              <Button
                                variant="outline"
                                className="w-full justify-start"
                                leftIcon={<ReturnIcon size={18} />}
                                onClick={() => setPrintModalOpen(true)}
                              >
                                Imprimir Devolução
                              </Button>
                              {isEditMode && (
                                <>
                                  <Button
                                    variant="default"
                                    className="w-full justify-start"
                                    leftIcon={<SaveIcon size={18} />}
                                    onClick={handleSave}
                                    isLoading={isSaving}
                                  >
                                    Salvar Alterações
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    leftIcon={<XIcon size={18} />}
                                    onClick={() => setIsEditMode(false)}
                                  >
                                    Cancelar Edição
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </FadeIn>
                </TabsContent>

                <TabsContent value="parties" className="mt-0">
                  <FadeIn key="parties">
                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                      <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                        <CustomerCard
                          customer={{
                            name: request?.customer_name_snapshot || request?.customerName,
                            email: request?.customerEmail,
                            phone: request?.customerPhone,
                            image_url: buyerProfile?.avatar_url || null,
                          }}
                        />
                      </div>
                      <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                        <AdminStoreCard store={store || {}} fallbackStoreId={request?.store_id || request?.partner_id} />
                      </div>
                    </div>
                  </FadeIn>
                </TabsContent>

                <TabsContent value="evidence" className="mt-0">
                  <FadeIn key="evidence">
                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                      <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                        <FormSection title={`Arquivos e Evidências Fotográficas (${evidenceImages.length + evidence.length})`} hasSeparator>
                          {evidenceImages.length === 0 && evidence.length === 0 ? (
                            <IconPlaceholder
                              icon={ImageIcon}
                              containerSize="w-14 h-14 mb-2"
                              iconSize="w-6 h-6"
                              title="Nenhuma evidência anexada"
                              subtitle="O cliente não enviou arquivos para esta solicitação."
                            />
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                              {evidenceImages.map((img, idx) => (
                                <div key={`local-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-brand-border dark:border-dark-border group">
                                  {img instanceof File ? (
                                    <img
                                      src={URL.createObjectURL(img)}
                                      alt={`Evidência ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <img
                                      src={img}
                                      alt={`Evidência ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  )}
                                  {isEditMode && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveImage(idx)}
                                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <XIcon size={12} />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {evidence.map((ev: any, idx: number) => (
                                <a
                                  key={ev.id || `server-${idx}`}
                                  href={getR2ImageUrl(ev.file_url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group rounded-xl border border-brand-border dark:border-dark-border overflow-hidden bg-brand-gray dark:bg-dark-border/20 flex flex-col hover:border-brand-dark/30 transition-colors"
                                >
                                  <div className="aspect-square flex items-center justify-center overflow-hidden">
                                    {ev.file_type?.startsWith("image") ? (
                                      <img src={getR2ImageUrl(ev.file_url)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                    ) : (
                                      <ImageIcon className="w-8 h-8 text-brand-inactive-text" />
                                    )}
                                  </div>
                                  <div className="p-2 text-xs truncate font-medium text-brand-dark dark:text-dark-heading">
                                    {ev.file_name || "Evidência"}
                                  </div>
                                </a>
                              ))}
                            </div>
                          )}
                        </FormSection>
                      </div>

                      <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                        <FormSection title={`Mensagens Trocadas (${messages.length})`}>
                          {messages.length === 0 ? (
                            <IconPlaceholder
                              icon={ImageIcon}
                              containerSize="w-14 h-14 mb-2"
                              iconSize="w-6 h-6"
                              title="Nenhuma mensagem registrada"
                              subtitle="Não há conversa registrada para esta solicitação."
                            />
                          ) : (
                            <div className="space-y-3">
                              {messages.map((m: any) => (
                                <div key={m.id} className="p-3.5 bg-brand-gray dark:bg-dark-border/30 rounded-xl space-y-1">
                                  <div className="flex justify-between text-xs text-brand-inactive-text">
                                    <span className="font-bold">{m.sender_role || "Usuário"}</span>
                                    <span>{formatDateTime(m.created_at)}</span>
                                  </div>
                                  <p className="text-sm text-brand-dark dark:text-dark-heading">{m.message}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </FormSection>
                      </div>
                    </div>
                  </FadeIn>
                </TabsContent>

                <TabsContent value="timeline" className="mt-0">
                  <FadeIn key="timeline">
                    <ReturnHistoryTab
                      events={events}
                      showAdminActor={true}
                      viewer="admin"
                    />
                  </FadeIn>
                </TabsContent>

                <TabsContent value="risk" className="mt-0">
                  <FadeIn key="risk">
                    <FormSection title="Eventos de Risco & Moderação" hasSeparator>
                      {riskEvents.length === 0 ? (
                        <IconPlaceholder
                          icon={AlertCircleIcon}
                          containerSize="w-14 h-14 mb-2"
                          iconSize="w-6 h-6"
                          title="Nenhum evento de risco associado"
                          subtitle="Não há eventos de risco registrados para esta solicitação."
                        />
                      ) : (
                        <div className="space-y-2">
                          {riskEvents.map((e: any) => (
                            <div key={e.id} className="p-3 bg-red-50 dark:bg-red-950/20 rounded-xl text-sm flex justify-between items-center">
                              <span>+{e.points} pontos ({e.source_type})</span>
                              <span className="text-xs text-brand-inactive-text">{formatDate(e.created_at)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </FormSection>
                  </FadeIn>
                </TabsContent>
              </div>
            </div>
          </Tabs>

          {/* Mobile bottom bar */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
            <div className="flex-1">
              <ActionsDropdown
                fullWidth
                onPrint={() => setPrintModalOpen(true)}
                onShare={handleShare}
                trigger={
                  <Button variant="outline" className="w-full h-12">
                    <ThreeDotsIcon size={18} className="text-brand-inactive-text" />
                  </Button>
                }
              />
            </div>
          </div>

          {printModalOpen && returnFullId && (
            <ReturnPrintModal
              isOpen={printModalOpen}
              onClose={() => setPrintModalOpen(false)}
              returnId={returnFullId}
              partnerId={store?.id || request.partnerId}
            />
          )}

          {showImageCropper && selectedImageForCrop && (
            <ImageCropperModal
              isOpen={true}
              imageFile={selectedImageForCrop}
              onCropComplete={handleImageCropComplete}
              onClose={() => {
                setShowImageCropper(false);
                setSelectedImageForCrop(null);
              }}
              aspectRatio={1}
            />
          )}

          {actionModal}

          {isInventoryRestoreModalOpen && (
            <DefaultModal
              isOpen={isInventoryRestoreModalOpen}
              onClose={() => setIsInventoryRestoreModalOpen(false)}
              title="Restaurar estoque dos itens devolvidos"
              maxWidth="md"
            >
              <div className="space-y-4 pt-2">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                  Defina a quantidade de cada item que deve voltar ao estoque:
                </p>
                {items.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-brand-dark dark:text-dark-heading w-48 truncate">
                      {item.productName}
                    </span>
                    <QuantitySelector
                      value={inventoryRestoreQuantities[item.id] || item.quantity}
                      onChange={(v: number) => setInventoryRestoreQuantities(prev => ({ ...prev, [item.id]: v }))}
                      min={0}
                      max={item.quantity}
                    />
                  </div>
                ))}
                <div className="flex justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                  <Button variant="outline" onClick={() => setIsInventoryRestoreModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      const restoreItems = Object.entries(inventoryRestoreQuantities)
                        .filter(([_, qty]) => qty > 0)
                        .map(([id, qty]) => ({ id, quantity: qty }));
                      setReturnToInventoryItems(restoreItems.length > 0 ? restoreItems : null);
                      setReturnToInventory(restoreItems.length > 0);
                      setIsInventoryRestoreModalOpen(false);
                      handleSave();
                    }}
                  >
                    Confirmar e Salvar
                  </Button>
                </div>
              </div>
            </DefaultModal>
          )}
        </div>
      </StoreProvider>
    </PermissionProvider>
  );
}

