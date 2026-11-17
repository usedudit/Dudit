"use client";

import React, { useState, useEffect, useMemo } from "react";
import { DefaultModal, Button, FormDropdown, FormTextarea, InfoCard } from "@/components/reusable";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { changeOrderPaymentMethodAction } from "@/app/actions/erp/orders";
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label";
import { useToast } from "@/components/ui/use-toast";

interface ChangePaymentMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  partnerId: string;
  currentPaymentMethod: string;
  onSuccess: (newMethod: string) => void;
}

export default function ChangePaymentMethodModal({
  isOpen,
  onClose,
  orderId,
  partnerId,
  currentPaymentMethod,
  onSuccess,
}: ChangePaymentMethodModalProps) {
  const { toast } = useToast();
  const { methods: activeMethods, isLoading: isLoadingMethods } = usePaymentMethods(partnerId);

  const [selectedMethodName, setSelectedMethodName] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const formattedCurrentMethod = useMemo(() => {
    return formatPaymentMethodLabel(currentPaymentMethod || "Não informado", null);
  }, [currentPaymentMethod]);

  const methodOptions = useMemo(() => {
    if (!activeMethods || activeMethods.length === 0) {
      // Fallback para métodos padrões se nenhum customizado estiver carregado
      return [
        { value: "Dinheiro", label: "Dinheiro" },
        { value: "Pix", label: "Pix" },
        { value: "Cartão de Crédito", label: "Cartão de Crédito" },
        { value: "Cartão de Débito", label: "Cartão de Débito" },
        { value: "Transferência", label: "Transferência" },
      ];
    }

    return activeMethods.map((m: any) => ({
      value: m.name,
      label: formatPaymentMethodLabel(m.name, m.type),
      id: m.id,
    }));
  }, [activeMethods]);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setErrorMessage("");
      setIsSubmitting(false);

      // Pré-selecionar o primeiro método diferente do atual
      const firstDifferent = methodOptions.find(
        (opt: any) => opt.value.trim().toLowerCase() !== formattedCurrentMethod.trim().toLowerCase()
      );
      setSelectedMethodName(firstDifferent ? firstDifferent.value : methodOptions[0]?.value || "");
    }
  }, [isOpen, methodOptions, formattedCurrentMethod]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage("");

    const trimmedReason = reason.trim();
    if (!trimmedReason || trimmedReason.length < 5) {
      setErrorMessage("O motivo da alteração é obrigatório (mínimo de 5 caracteres).");
      return;
    }

    if (!selectedMethodName) {
      setErrorMessage("Selecione o novo método de pagamento.");
      return;
    }

    if (selectedMethodName.trim().toLowerCase() === formattedCurrentMethod.trim().toLowerCase()) {
      setErrorMessage("O novo método de pagamento deve ser diferente do método atual.");
      return;
    }

    const selectedOption = methodOptions.find((opt: any) => opt.value === selectedMethodName);
    const selectedId = (selectedOption as any)?.id || null;

    setIsSubmitting(true);
    try {
      const res = await changeOrderPaymentMethodAction({
        orderId,
        partnerId,
        newPaymentMethod: selectedMethodName,
        newPaymentMethodId: selectedId,
        reason: trimmedReason,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Não foi possível alterar o método de pagamento.");
        return;
      }

      toast({
        title: "Método alterado com sucesso",
        description: `O método de pagamento foi alterado para ${res.newMethod} e registrado no histórico.`,
      });

      onSuccess(res.newMethod);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Ocorreu um erro ao alterar o método de pagamento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title="Alterar Método de Pagamento"
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={() => handleSubmit()}
            isLoading={isSubmitting}
            disabled={isSubmitting || isLoadingMethods}
          >
            Confirmar Alteração
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <InfoCard
          color="blue"
          title="Método escolhido pelo cliente no checkout"
          message={`O cliente escolheu "${formattedCurrentMethod}". Apenas Proprietário, Administrador ou Gerente podem alterar este método mediante solicitação do cliente. A alteração e o motivo serão registrados no histórico do pedido para o cliente e para a loja.`}
        />

        <div>
          <label className="block text-sm font-semibold text-brand-dark dark:text-dark-heading mb-1.5">
            Novo Método de Pagamento *
          </label>
          <FormDropdown
            value={selectedMethodName}
            setValue={setSelectedMethodName}
            options={methodOptions}
            placeholder={isLoadingMethods ? "Carregando métodos..." : "Selecione o método"}
            disabled={isSubmitting || isLoadingMethods}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-brand-dark dark:text-dark-heading mb-1.5">
            Motivo da Alteração *
          </label>
          <FormTextarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Cliente solicitou via WhatsApp a alteração para pagar em dinheiro na entrega."
            rows={3}
            disabled={isSubmitting}
            required
          />
          <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 block">
            Mínimo de 5 caracteres. Este motivo será exibido no histórico do pedido para você e para o cliente.
          </span>
        </div>

        {errorMessage && (
          <p className="text-sm font-medium text-red-500 dark:text-red-400">
            {errorMessage}
          </p>
        )}
      </form>
    </DefaultModal>
  );
}
