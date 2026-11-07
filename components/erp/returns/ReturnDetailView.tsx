"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeftIcon,
  ThreeDotsIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  XIcon,
  ClockIcon,
  ReturnIcon,
  CalendarIcon,
} from "@/lib/icons";
import {
  Button,
  Badge,
  ActionsDropdown,
  ThreeDotsLoader,
  InfoCard,
  CustomerCard,
  CustomerMobileBar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ListItem,
  FormSection,
  Pagination,
  Tooltip,
} from "@/components/reusable";
import { usePermissions } from "@/lib/permission-context";
import { useSidebar } from "@/lib/sidebar-context";
import {
  getReturnRequestDetailsAction,
  processReturnRequestAction,
} from "@/app/actions/erp/returns";
import { ReturnHistoryTab } from "./ReturnHistoryTab";
import { useToast } from "@/hooks/use-toast";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import {
  formatCurrency,
  formatDateTime,
  formatTime,
  formatDayMonth,
} from "@/lib/utils";
import { getReturnStatusMeta } from "./ReturnListRow";
import { FadeIn } from "@/components/animations/FadeIn";
import { getReturnResolutionLabel } from "@/lib/returns/types";
import { useStore } from "@/lib/store-context";
import DefaultModal from "@/components/reusable/DefaultModal";
import ReturnPrintModal from "./ReturnPrintModal";
import { useEntityState } from "@/hooks/use-entity-state";

interface ReturnDetailViewProps {
  orderId: string;
  onBack: () => void;
  onEdit?: (orderId: string) => void;
  onPrint?: () => void;
  initialRequest?: any;
}

export function ReturnDetailView({
  orderId,
  onBack,
  onEdit,
  onPrint,
  initialRequest,
}: ReturnDetailViewProps) {
  const { toast } = useToast();
  const { state: entityState, open: openEntity, close: closeEntity } = useEntityState();
  const [activeTab, setActiveTab] = useState("general");
  const [isScrolled, setIsScrolled] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [request, setRequest] = useState<any>(initialRequest || null);
  const [loading, setLoading] = useState(!initialRequest);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [returnEvents, setReturnEvents] = useState<any[]>([]);
  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const loadRequest = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      // getReturnRequestDetailsAction needs partnerId - we'll get it from the request or context
      // For now, we'll use the initialRequest if available
      if (initialRequest?.partnerId) {
        const res = await getReturnRequestDetailsAction(initialRequest.partnerId, orderId);
        if (res.success && res.data) {
          setRequest(res.data);
          setEvidenceImages(res.data.evidenceImages || []);
        }
      }
    } catch (err) {
      console.error("Error loading return request:", err);
    } finally {
      setLoading(false);
    }
  }, [orderId, initialRequest?.partnerId]);

  useEffect(() => {
    if (!initialRequest) {
      loadRequest();
    }
  }, [loadRequest, initialRequest]);

  // Load history when history tab is active
  useEffect(() => {
    if (activeTab !== "history" || historyLoading || returnEvents.length > 0) return;
    let mounted = true;
    setHistoryLoading(true);
    try {
      // The history is already in the request from getReturnRequestDetailsAction
      if (request?.returnEvents) {
        if (mounted) setReturnEvents(request.returnEvents);
      }
    } catch (err) {
      console.error("Error loading return history:", err);
    } finally {
      if (mounted) setHistoryLoading(false);
    }
  }, [activeTab, request, historyLoading, returnEvents.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] w-full">
        <ThreeDotsLoader />
      </div>
    );
  }

  if (!request) return null;

  const statusMeta = getReturnStatusMeta(request.status);
  const resolutionLabel = getReturnResolutionLabel(
    request.approvedResolution || request.desiredResolution || request.refundType || "refund"
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-background">
      {/* Header */}
      <div
        className={`sticky top-0 z-40 flex items-center justify-between gap-4 px-4 md:px-8 py-4 border-b border-brand-border dark:border-dark-border transition-all duration-300 ${
          isScrolled ? "shadow-sm bg-white/95 dark:bg-dark-background/95 backdrop-blur-sm" : "bg-white dark:bg-dark-background"
        }`}
      >
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="md:hidden -ml-2"
            aria-label="Voltar"
          >
            <ChevronLeftIcon size={24} />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-[22px] font-bold text-brand-dark dark:text-dark-heading tracking-tight">
              Devolução #{request.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
              Pedido {request.orderNumber} • {request.customerName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={statusMeta.variant} className="text-sm">
            {statusMeta.label}
          </Badge>
          {onPrint && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<ReturnIcon size={16} />}
              onClick={() => setPrintModalOpen(true)}
            >
              Imprimir
            </Button>
          )}
          {onEdit && (
            <Button
              variant="default"
              size="sm"
              leftIcon={<ReturnIcon size={16} />}
              onClick={() => onEdit(request.id)}
            >
              Editar
            </Button>
          )}
        </div>
      </div>

      {/* Tabs & Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
        <div className="border-b border-brand-border dark:border-dark-border px-4 md:px-8">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">Dados Gerais</TabsTrigger>
            <TabsTrigger value="evidence">Evidências</TabsTrigger>
            <TabsTrigger value="observations">Observações</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto custom-scrollbar p-4 md:p-8"
        >
          <div className="max-w-5xl mx-auto grid grid-cols-12 gap-y-8 md:gap-y-0">
            {/* Main Column */}
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
              <TabsContent value="general" className="mt-6 space-y-8">
                <FadeIn key="general" className="space-y-8">
                  {/* Order Info */}
                  <FormSection title="Informações do Pedido" hasSeparator>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <ListItem
                        title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Código da Devolução</span>}
                        right={<span className="font-bold text-brand-dark dark:text-dark-heading">DVL-{request.id.slice(0, 8).toUpperCase()}</span>}
                      />
                      <ListItem
                        title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pedido Original</span>}
                        right={<span className="font-bold text-brand-dark dark:text-dark-heading">#{request.orderNumber}</span>}
                      />
                      <ListItem
                        title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>}
                        right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.customerName}</span>}
                      />
                      <ListItem
                        title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Data da Solicitação</span>}
                        right={<span className="font-bold text-brand-dark dark:text-dark-heading">{formatDateTime(request.createdAt)}</span>}
                      />
                      <ListItem
                        title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Tipo</span>}
                        right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.requestType || "return"}</span>}
                      />
                      <ListItem
                        title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Origem</span>}
                        right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.source || "erp"}</span>}
                      />
                    </div>
                  </FormSection>

                  {/* Resolution Info */}
                  <FormSection title="Resolução" hasSeparator>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <ListItem
                        title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Resolução Desejada</span>}
                        right={<span className="font-bold text-brand-dark dark:text-dark-heading">{resolutionLabel}</span>}
                      />
                      <ListItem
                        title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Resolução Aprovada</span>}
                        right={
                          request.approvedResolution
                            ? <span className="font-bold text-brand-dark dark:text-dark-heading">{getReturnResolutionLabel(request.approvedResolution)}</span>
                            : <span className="text-brand-inactive-text dark:text-dark-body">Pendente</span>
                        }
                      />
                      {request.refundValue > 0 && (
                        <ListItem
                          title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Valor do Reembolso</span>}
                          right={<span className="font-bold text-brand-green dark:text-brand-green">{formatCurrency(request.refundValue)}</span>}
                        />
                      )}
                      {request.storeCreditValue > 0 && (
                        <ListItem
                          title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Vale-Compra</span>}
                          right={<span className="font-bold text-brand-blue dark:text-brand-blue">{formatCurrency(request.storeCreditValue)}</span>}
                        />
                      )}
                      {request.refundPaymentMethod && (
                        <ListItem
                          title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Método de Reembolso</span>}
                          right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.refundPaymentMethod}</span>}
                        />
                      )}
                    </div>
                  </FormSection>

                  {/* Items */}
                  <FormSection title="Itens da Devolução" hasSeparator>
                    <div className="space-y-3">
                      {request.items?.map((item: any, idx: number) => (
                        <div key={item.id || idx} className="p-4 bg-brand-gray/30 dark:bg-dark-border/30 rounded-xl border border-brand-border/50 dark:border-dark-border/50">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-bold text-brand-dark dark:text-dark-heading">{item.productName}</span>
                                {item.sku && (
                                  <span className="text-xs text-brand-inactive-text dark:text-dark-body px-2 py-0.5 bg-brand-gray dark:bg-dark-border rounded">
                                    SKU: {item.sku}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                <div>
                                  <span className="text-brand-inactive-text dark:text-dark-body">Quantidade:</span>
                                  <span className="font-medium text-brand-dark dark:text-dark-heading ml-1">{item.quantity}</span>
                                </div>
                                <div>
                                  <span className="text-brand-inactive-text dark:text-dark-body">Motivo:</span>
                                  <span className="font-medium text-brand-dark dark:text-dark-heading ml-1">{item.reason}</span>
                                </div>
                                <div>
                                  <span className="text-brand-inactive-text dark:text-dark-body">Condição:</span>
                                  <span className="font-medium text-brand-dark dark:text-dark-heading ml-1">{item.condition}</span>
                                </div>
                                <div>
                                  <span className="text-brand-inactive-text dark:text-dark-body">Valor:</span>
                                  <span className="font-medium text-brand-dark dark:text-dark-heading ml-1">{formatCurrency(item.price * item.quantity)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </FormSection>

                  {/* Customer Info */}
                  <FormSection title="Dados do Cliente" hasSeparator>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <ListItem
                        title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nome</span>}
                        right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.customerName}</span>}
                      />
                      {request.customerEmail && (
                        <ListItem
                          title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">E-mail</span>}
                          right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.customerEmail}</span>}
                        />
                      )}
                      {request.customerPhone && (
                        <ListItem
                          title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Telefone</span>}
                          right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.customerPhone}</span>}
                        />
                      )}
                      {request.customerAddress && (
                        <ListItem
                          title={<span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Endereço</span>}
                          right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.customerAddress}</span>}
                        />
                      )}
                    </div>
                  </FormSection>
                </FadeIn>
              </TabsContent>

              <TabsContent value="evidence" className="mt-6 space-y-6">
                <FadeIn key="evidence">
                  <FormSection title="Evidências do Cliente" hasSeparator>
                    {evidenceImages.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {evidenceImages.map((img, idx) => (
                          <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-brand-border dark:border-dark-border">
                            <img
                              src={img}
                              alt={`Evidência ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-brand-inactive-text dark:text-dark-body text-center py-8">Nenhuma evidência anexada</p>
                    )}
                  </FormSection>

                  {request.return_evidence && request.return_evidence.length > 0 && (
                    <FormSection title="Documentos de Evidência" hasSeparator>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {request.return_evidence.map((ev: any, idx: number) => (
                          <div key={ev.id || idx} className="relative aspect-square rounded-xl overflow-hidden border border-brand-border dark:border-dark-border">
                            <img
                              src={ev.file_url}
                              alt={`Documento ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </FormSection>
                  )}
                </FadeIn>
              </TabsContent>

              <TabsContent value="observations" className="mt-6 space-y-6">
                <FadeIn key="observations">
                  {request.customerMessage && (
                    <FormSection title="Mensagem do Cliente" hasSeparator>
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                        <p className="whitespace-pre-wrap text-brand-dark dark:text-dark-heading">{request.customerMessage}</p>
                      </div>
                    </FormSection>
                  )}
                  {request.observations && (
                    <FormSection title="Observações Internas" hasSeparator>
                      <div className="p-4 bg-brand-gray/30 dark:bg-dark-border/30 border border-brand-border/50 dark:border-dark-border/50 rounded-xl">
                        <p className="whitespace-pre-wrap text-brand-dark dark:text-dark-heading">{request.observations}</p>
                      </div>
                    </FormSection>
                  )}
                  {request.sellerNotes && (
                    <FormSection title="Notas do Vendedor" hasSeparator>
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                        <p className="whitespace-pre-wrap text-brand-dark dark:text-dark-heading">{request.sellerNotes}</p>
                      </div>
                    </FormSection>
                  )}
                  {!request.customerMessage && !request.observations && !request.sellerNotes && (
                    <div className="text-center py-12 text-brand-inactive-text dark:text-dark-body">
                      Nenhuma observação registrada
                    </div>
                  )}
                </FadeIn>
              </TabsContent>

              <TabsContent value="history" className="mt-6">
                <FadeIn key="history">
                  <ReturnHistoryTab events={returnEvents} loading={historyLoading} />
                </FadeIn>
              </TabsContent>
            </div>

            {/* Sidebar Column */}
            <div className="col-span-12 lg:col-span-4 border-l-0 lg:border-l border-brand-border dark:border-dark-border pl-0 lg:pl-12">
              <div className="sticky top-24 space-y-6">
                {/* Status Card */}
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
                  <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Status Atual</h3>
                  <div className="space-y-3">
                    <ListItem
                      title={<span className="text-sm text-brand-inactive-text dark:text-dark-body">Status da Solicitação</span>}
                      right={<Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>}
                    />
                    <ListItem
                      title={<span className="text-sm text-brand-inactive-text dark:text-dark-body">Resolução</span>}
                      right={<span className="font-medium text-brand-dark dark:text-dark-heading">{resolutionLabel}</span>}
                    />
                    {request.refundValue > 0 && (
                      <ListItem
                        title={<span className="text-sm text-brand-inactive-text dark:text-dark-body">Reembolso</span>}
                        right={<span className="font-bold text-brand-green dark:text-brand-green">{formatCurrency(request.refundValue)}</span>}
                      />
                    )}
                    {request.storeCreditValue > 0 && (
                      <ListItem
                        title={<span className="text-sm text-brand-inactive-text dark:text-dark-body">Vale-Compra</span>}
                        right={<span className="font-bold text-brand-blue dark:text-brand-blue">{formatCurrency(request.storeCreditValue)}</span>}
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
                      right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.items?.length || 0}</span>}
                    />
                    <ListItem
                      title={<span className="text-brand-inactive-text dark:text-dark-body">Total de Produtos</span>}
                      right={<span className="font-bold text-brand-dark dark:text-dark-heading">{request.items?.reduce((acc: number, i: any) => acc + Number(i.quantity || 0), 0) || 0}</span>}
                    />
                    <ListItem
                      title={<span className="text-brand-inactive-text dark:text-dark-body">Evidências</span>}
                      right={<span className="font-bold text-brand-dark dark:text-dark-heading">{evidenceImages.length + (request.return_evidence?.length || 0)}</span>}
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
                    {onPrint && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        leftIcon={<ReturnIcon size={18} />}
                        onClick={() => setPrintModalOpen(true)}
                      >
                        Imprimir Devolução
                      </Button>
                    )}
                    {onEdit && (
                      <Button
                        variant="default"
                        className="w-full justify-start"
                        leftIcon={<ReturnIcon size={18} />}
                        onClick={() => onEdit(request.id)}
                      >
                        Editar Devolução
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Tabs>

      {/* Print Modal */}
      <ReturnPrintModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        returnId={request.id}
        partnerId={request.partnerId}
      />
    </div>
  );
}