"use client"

import React from "react"
import { ArrowLeftIcon, TagIcon, BoxIcon, SparklesIcon, CheckCircleIcon, XIcon } from "@/lib/icons"
import { Button, Badge } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils/formatters"

const Div = (props: any) => React.createElement("div", props)
const H2 = (props: any) => React.createElement("h2", props)
const H3 = (props: any) => React.createElement("h3", props)
const P = (props: any) => React.createElement("p", props)
const Span = (props: any) => React.createElement("span", props)

export default function PromotionDetailPage({
    partnerId,
    promotion,
    campaign,
    scopeData,
    onClose,
}: {
    partnerId: string
    promotion: any
    campaign: any
    scopeData: { products: any[]; categories: any[]; customers: any[] }
    onClose: () => void
}) {
    if (!promotion) return null

    // Resolve scope lists
    const scopedProducts = scopeData.products.filter(p =>
        (promotion.promotion_products || []).some((pp: any) => pp.product_id === p.id)
    )

    const scopedCategories = scopeData.categories.filter(c =>
        (promotion.promotion_categories || []).some((pc: any) => pc.category_id === c.id)
    )

    const giftProduct = scopeData.products.find(p => p.id === promotion.gift_product_id)

    return (
        <Div className="space-y-6 max-w-3xl mx-auto bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border shadow-sm animate-fadeIn">
            {/* Header */}
            <Div className="flex items-center justify-between border-b border-brand-border dark:border-dark-border pb-4">
                <Div className="flex items-center gap-3">
                    <Button variant="outline" onClick={onClose} size="icon">
                        <ArrowLeftIcon className="h-5 w-5" />
                    </Button>
                    <Div>
                        <H2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{promotion.name}</H2>
                        <P className="text-xs text-brand-inactive-text">Detalhes e regras de execução da promoção</P>
                    </Div>
                </Div>
                <Badge variant={promotion.is_active ? "green" : "gray"}>
                    {promotion.is_active ? "Ativa" : "Inativa"}
                </Badge>
            </Div>

            {/* Grid details */}
            <Div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Rule configurations */}
                <Div className="space-y-4">
                    <H3 className="text-xs font-bold uppercase text-brand-inactive-text tracking-wider">Regras & Valores</H3>
                    <Div className="border border-brand-border dark:border-dark-border p-4 rounded-xl space-y-3">
                        <Div className="flex justify-between text-sm">
                            <Span className="text-brand-inactive-text">Tipo de Promoção:</Span>
                            <Span className="font-semibold capitalize">
                                {promotion.promotion_type === "gift" && "Brinde"}
                                {promotion.promotion_type === "buy_x_pay_y" && "Leve X Pague Y"}
                                {promotion.promotion_type === "discount" && "Desconto Direto"}
                            </Span>
                        </Div>

                        {promotion.promotion_type === "discount" && (
                            <>
                                <Div className="flex justify-between text-sm">
                                    <Span className="text-brand-inactive-text">Tipo de Desconto:</Span>
                                    <Span className="font-semibold capitalize">
                                        {promotion.discount_type === "percentage" ? "Porcentagem (%)" : "Valor Fixo (R$)"}
                                    </Span>
                                </Div>
                                <Div className="flex justify-between text-sm">
                                    <Span className="text-brand-inactive-text">Valor do Desconto:</Span>
                                    <Span className="font-semibold">
                                        {promotion.discount_type === "percentage" ? `${promotion.discount_value}%` : formatCurrency(promotion.discount_value)}
                                    </Span>
                                </Div>
                                {promotion.max_discount_amount && (
                                    <Div className="flex justify-between text-sm">
                                        <Span className="text-brand-inactive-text">Capped (Teto de Desconto):</Span>
                                        <Span className="font-semibold">{formatCurrency(promotion.max_discount_amount)}</Span>
                                    </Div>
                                )}
                            </>
                        )}

                        {promotion.promotion_type === "buy_x_pay_y" && (
                            <Div className="flex justify-between text-sm">
                                <Span className="text-brand-inactive-text">Critério de Leve/Pague:</Span>
                                <Span className="font-semibold text-brand-primary">Leve {promotion.buy_quantity} Pague {promotion.pay_quantity}</Span>
                            </Div>
                        )}

                        {promotion.promotion_type === "gift" && (
                            <Div className="flex justify-between text-sm">
                                <Span className="text-brand-inactive-text">Brinde Concedido:</Span>
                                <Span className="font-semibold text-green-600">{giftProduct?.name || "Produto Brinde"}</Span>
                            </Div>
                        )}

                        <Div className="flex justify-between text-sm">
                            <Span className="text-brand-inactive-text">Valor Mínimo de Compra:</Span>
                            <Span className="font-semibold">{promotion.min_spend_amount ? formatCurrency(promotion.min_spend_amount) : "Sem mínimo"}</Span>
                        </Div>

                        <Div className="flex justify-between text-sm">
                            <Span className="text-brand-inactive-text">Prioridade de Aplicação:</Span>
                            <Span className="font-semibold"><Badge variant="blue">{promotion.priority || 0}</Badge></Span>
                        </Div>

                        <Div className="flex justify-between text-sm">
                            <Span className="text-brand-inactive-text">Pilha com Cupons:</Span>
                            <Span className="font-semibold flex items-center gap-1">
                                {promotion.allow_coupon_combination ? (
                                    <><CheckCircleIcon className="text-green-600 h-4 w-4" /> Sim</>
                                ) : (
                                    <><XIcon className="text-red-500 h-4 w-4" /> Não</>
                                )}
                            </Span>
                        </Div>
                    </Div>
                </Div>

                {/* Campaign mothership details */}
                <Div className="space-y-4">
                    <H3 className="text-xs font-bold uppercase text-brand-inactive-text tracking-wider">Campanha Mãe</H3>
                    {campaign ? (
                        <Div className="border border-brand-border dark:border-dark-border p-4 rounded-xl space-y-3">
                            <Div className="flex justify-between text-sm">
                                <Span className="text-brand-inactive-text">Nome:</Span>
                                <Span className="font-semibold">{campaign.name}</Span>
                            </Div>
                            {campaign.description && (
                                <Div className="flex justify-between text-sm">
                                    <Span className="text-brand-inactive-text">Descrição:</Span>
                                    <Span className="text-right max-w-[200px] truncate">{campaign.description}</Span>
                                </Div>
                            )}
                            <Div className="flex justify-between text-sm">
                                <Span className="text-brand-inactive-text">Vigência:</Span>
                                <Span className="font-semibold text-xs">
                                    {campaign.starts_at ? new Date(campaign.starts_at).toLocaleDateString() : "Sem início"} - {campaign.ends_at ? new Date(campaign.ends_at).toLocaleDateString() : "Sem fim"}
                                </Span>
                            </Div>
                            <Div className="flex justify-between text-sm">
                                <Span className="text-brand-inactive-text">Audência:</Span>
                                <Span className="font-semibold text-xs">
                                    {campaign.customer_scope === "specific" ? "Segmentado (Clientes específicos)" : "Público Geral"}
                                </Span>
                            </Div>
                        </Div>
                    ) : (
                        <P className="text-sm text-brand-inactive-text">Campanha não vinculada ou excluída.</P>
                    )}

                    {/* Usage Stats */}
                    <H3 className="text-xs font-bold uppercase text-brand-inactive-text tracking-wider pt-2">Estatísticas de Uso</H3>
                    <Div className="border border-brand-border dark:border-dark-border p-4 rounded-xl space-y-2">
                        <Div className="flex justify-between text-sm">
                            <Span className="text-brand-inactive-text">Limite Global de Usos:</Span>
                            <Span className="font-semibold">{promotion.usage_limit ?? "Sem limite"}</Span>
                        </Div>
                        <Div className="flex justify-between text-sm">
                            <Span className="text-brand-inactive-text">Limite por Cliente:</Span>
                            <Span className="font-semibold">{promotion.usage_limit_per_customer ?? "Sem limite"}</Span>
                        </Div>
                        <Div className="flex justify-between text-sm">
                            <Span className="text-brand-inactive-text">Uso Atual Contabilizado:</Span>
                            <Span className="font-semibold text-brand-primary">{promotion.usage_count || 0} usos</Span>
                        </Div>
                    </Div>
                </Div>
            </Div>

            {/* Target scope list */}
            <Div className="border-t border-brand-border dark:border-dark-border pt-6 space-y-4">
                <H3 className="text-xs font-bold uppercase text-brand-inactive-text tracking-wider">Escopo de Elegibilidade ({promotion.apply_scope === "entire_cart" ? "Toda a Sacola" : promotion.apply_scope === "category" ? "Categorias" : "Produtos"})</H3>

                {promotion.apply_scope === "entire_cart" && (
                    <Div className="text-sm text-brand-inactive-text bg-gray-50 dark:bg-dark-border/20 p-4 rounded-xl flex items-center gap-2">
                        <SparklesIcon size={16} />
                        <Span>Esta promoção é geral e se aplica automaticamente a qualquer produto elegível de toda a loja.</Span>
                    </Div>
                )}

                {promotion.apply_scope === "specific_products" && (
                    <Div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {scopedProducts.map((p, idx) => (
                            <Div key={idx} className="flex items-center gap-3 p-3 border border-brand-border dark:border-dark-border rounded-xl">
                                <BoxIcon className="text-brand-inactive-text shrink-0 h-5 w-5" />
                                <Div className="min-w-0 flex-1">
                                    <P className="text-sm font-semibold truncate text-brand-dark dark:text-dark-heading">{p.name}</P>
                                    <P className="text-xs text-brand-inactive-text">{formatCurrency(p.price)}</P>
                                </Div>
                            </Div>
                        ))}
                        {scopedProducts.length === 0 && (
                            <P className="text-sm text-brand-inactive-text">Nenhum produto selecionado no escopo.</P>
                        )}
                    </Div>
                )}

                {promotion.apply_scope === "category" && (
                    <Div className="flex flex-wrap gap-2">
                        {scopedCategories.map((c, idx) => (
                            <Badge key={idx} variant="blue" className="py-2 px-3 text-sm flex items-center gap-2">
                                <TagIcon size={14} />
                                <Span>{c.name}</Span>
                            </Badge>
                        ))}
                        {scopedCategories.length === 0 && (
                            <P className="text-sm text-brand-inactive-text">Nenhuma categoria selecionada no escopo.</P>
                        )}
                    </Div>
                )}
            </Div>

            {/* Footer controls */}
            <Div className="flex justify-end pt-4 border-t border-brand-border dark:border-dark-border">
                <Button variant="outline" onClick={onClose}>
                    Fechar Detalhes
                </Button>
            </Div>
        </Div>
    )
}
