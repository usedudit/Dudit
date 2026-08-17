"use client";

import React, { useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { FormSection } from "./FormSection";
import { ListItem } from "./ListItem";
import { default as CustomerCard } from "./CustomerCard";
import { UserIcon } from "@/lib/icons";
import { UserProfileImage } from "@/lib/utils/UserProfileImage";

interface CustomerMobileBarProps {
    customer?: any | null;
    address?: any;
    billingAddress?: any;
    showMap?: boolean;
    /** Abre a sheet de seleção de cliente quando não há cliente selecionado. */
    onSelect?: () => void;
    /** Remove o cliente selecionado (mostra o botão de remover na sheet de detalhes). */
    onRemove?: () => void;
    disabled?: boolean;
}

/**
 * Barra de cliente exibida no topo das páginas do ERP em tablet/mobile (lg:hidden).
 * Replica o comportamento das páginas de pedido: ao tocar no cliente abre a sheet
 * de "Detalhes do Cliente" com um CustomerCard minimal (e botão de remover, quando aplicável).
 */
const CustomerMobileBar: React.FC<CustomerMobileBarProps> = ({
    customer,
    address,
    billingAddress,
    showMap = true,
    onSelect,
    onRemove,
    disabled = false,
}) => {
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    if (!customer && !onSelect) return null;

    const resolvedEmail = customer?.email || customer?.contact_email || customer?.buyer_email || "";
    const resolvedPhone = customer?.phone || customer?.contact_phone || customer?.whatsapp || customer?.telefone || customer?.celular || customer?.mobile || "";
    const resolvedImageUrl = customer?.image_url || customer?.avatar_url || customer?.avatar || customer?.photo_url || null;
    const description = resolvedEmail || resolvedPhone || "Sem e-mail cadastrado";

    return (
        <>
            <FormSection title="" className="mt-0">
                {customer ? (
                    <ListItem
                        left={
                            <UserProfileImage
                                fullName={customer.name || "Cliente"}
                                imageUrl={resolvedImageUrl}
                                className="w-10 h-10 text-base"
                            />
                        }
                        title={customer.name || "Consumidor Final"}
                        description={description}
                        className="border-0 bg-transparent px-0 hover:bg-transparent"
                        showChevron={!disabled}
                        onClick={disabled ? undefined : () => setIsDetailsOpen(true)}
                    />
                ) : (
                    <ListItem
                        left={
                            <div className="w-10 h-10 rounded-full bg-brand-slate dark:bg-dark-border/50 flex items-center justify-center border border-brand-border dark:border-dark-border shrink-0">
                                <UserIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                            </div>
                        }
                        title="Nenhum cliente selecionado"
                        description="Clique para selecionar um cliente"
                        className="border-0 bg-transparent px-0 hover:bg-transparent"
                        showChevron={!disabled}
                        onClick={disabled ? undefined : onSelect}
                    />
                )}
            </FormSection>

            {customer && (
                <BottomSheet
                    isOpen={isDetailsOpen}
                    onClose={() => setIsDetailsOpen(false)}
                    title="Detalhes do Cliente"
                >
                    <div className="pt-2">
                        <CustomerCard
                            chrome="minimal"
                            customer={customer}
                            address={address}
                            billingAddress={billingAddress}
                            showMap={showMap}
                            onRemove={
                                onRemove
                                    ? () => {
                                          setIsDetailsOpen(false);
                                          onRemove();
                                      }
                                    : undefined
                            }
                        />
                    </div>
                </BottomSheet>
            )}
        </>
    );
};

export default CustomerMobileBar;