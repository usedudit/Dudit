import { TrashIcon, InfoIcon } from '@/lib/icons';
import { formatCurrency, cn } from '@/lib/utils';
import { Tooltip } from '@/components/reusable';

// Scalloped edge specifically for the receipt bottom
export const ReceiptScallopEdge = () => (
    <div className="absolute -bottom-4 left-0 w-full flex justify-between items-center px-0 overflow-hidden z-20 pointer-events-none">
        {/* Fewer, larger scallops */}
        {Array.from({ length: 12 }).map((_, i) => (
            <div
                key={i}
                className="w-10 h-10 bg-brand-gray dark:bg-dark-border/50 rounded-full border border-brand-border dark:border-dark-border shrink-0 -ml-3 first:-ml-5"
                style={{ marginTop: '-24px' }}
            ></div>
        ))}
    </div>
);

export const Numpad = ({ onInput, onDelete, disabled }: { onInput: (key: string) => void, onDelete: () => void, disabled?: boolean }) => {
    return (
        <div className="w-full max-w-[360px] mx-auto mt-6">
            <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <button disabled={disabled}
                        key={n}
                        onClick={() => onInput(n.toString())}
                        className="h-16 md:h-[74px] rounded-[22px] text-2xl md:text-[30px] font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/50 hover:bg-[#eef1f3] dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border dark:hover:border-dark-border active:scale-95 transform duration-100"
                    >
                        {n}
                    </button>
                ))}
                <button disabled={disabled}
                    onClick={() => onInput('.')}
                    className="h-16 md:h-[74px] rounded-[22px] text-2xl md:text-[30px] font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/50 hover:bg-[#eef1f3] dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border dark:hover:border-dark-border pb-3 active:scale-95 transform duration-100"
                >
                    .
                </button>
                <button disabled={disabled}
                    onClick={() => onInput('0')}
                    className="h-16 md:h-[74px] rounded-[22px] text-2xl md:text-[30px] font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/50 hover:bg-[#eef1f3] dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border dark:hover:border-dark-border active:scale-95 transform duration-100"
                >
                    0
                </button>
                <button disabled={disabled}
                    onClick={onDelete}
                    className="h-16 md:h-[74px] rounded-[22px] text-2xl md:text-[30px] font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/50 hover:bg-[#eef1f3] dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border dark:hover:border-dark-border flex items-center justify-center active:scale-95 transform duration-100"
                >
                    <TrashIcon className="w-6 h-6 md:w-7 md:h-7" />
                </button>
            </div>
        </div>
    );
};

export const PaymentMethodCard = ({ icon, label, selected, onClick, disabled }: any) => (
    <button disabled={disabled}
        onClick={onClick}
        className={cn(
            "flex flex-col items-center justify-center p-4 rounded-[22px] border-2 text-center transition-all w-full h-[100px] md:h-[110px] active:scale-95 transform duration-100 select-none",
            selected
                ? "border-brand-primary bg-brand-primary-light/10 text-brand-primary dark:border-brand-primary dark:bg-brand-primary/10 dark:text-brand-primary font-bold"
                : "border-brand-border bg-white text-brand-dark hover:bg-brand-gray hover:border-[#cbd5e1] dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading dark:hover:bg-dark-border/40",
            disabled && "opacity-40 cursor-not-allowed pointer-events-none"
        )}
    >
        <span className={cn("text-2xl mb-2", selected ? "text-brand-primary" : "text-brand-inactive-text dark:text-dark-body")}>
            {icon}
        </span>
        <span className="text-[13px] md:text-sm font-semibold tracking-tight leading-tight">{label}</span>
    </button>
);

export const SplitPaymentCard = ({ icon, label, selected, onClick, disabled }: any) => (
    <button disabled={disabled}
        onClick={onClick}
        className={cn(
            "flex flex-col items-center justify-center p-4 rounded-[22px] border-2 text-center transition-all w-full h-[100px] md:h-[110px] active:scale-95 transform duration-100 select-none",
            selected
                ? "border-brand-primary bg-brand-primary-light/10 text-brand-primary dark:border-brand-primary dark:bg-brand-primary/10 dark:text-brand-primary font-bold"
                : "border-brand-border bg-white text-brand-dark hover:bg-brand-gray hover:border-[#cbd5e1] dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading dark:hover:bg-dark-border/40",
            disabled && "opacity-40 cursor-not-allowed pointer-events-none"
        )}
    >
        <span className={cn("text-2xl mb-2", selected ? "text-brand-primary" : "text-brand-inactive-text dark:text-dark-body")}>
            {icon}
        </span>
        <span className="text-[13px] md:text-sm font-semibold tracking-tight leading-tight">{label}</span>
    </button>
);

export const ReceiptContent = ({
    cart,
    subTotal,
    shippingFee = 0,
    otherCosts = 0,
    discountAmount = 0,
    total,
    itemCount,
    customerName,
    pricingDetails = [],
}: any) => (
    <div className="bg-brand-gray dark:bg-dark-border/50 rounded-t-2xl p-6 pb-12 flex flex-col relative h-full border border-brand-border dark:border-dark-border border-b-0">
        {/* Receipt Header */}
        <div className="mb-6 flex justify-between items-center">
            <h3 className="text-md font-bold text-brand-dark dark:text-dark-heading">Detalhes da Transação</h3>
        </div>

        {/* Customer Info in Receipt (Optional, but looks good) */}
        {customerName && (
            <div className="mb-6 pb-4 border-b border-dashed border-brand-border dark:border-dark-border">
                <span className="text-sm text-brand-inactive-text font-bold block mb-1">Cliente</span>
                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customerName}</span>
            </div>
        )}

        {/* Items List - Scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4 space-y-4">
            {cart.map((item: any, idx: number) => (
                <div key={idx} className="flex flex-col w-full">
                    <div className="flex justify-between items-start mb-1 w-full">
                        <span className="font-medium text-brand-dark dark:text-dark-heading text-[14px] leading-snug max-w-[85%]">
                            {item.name}
                        </span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading text-sm whitespace-nowrap ml-2">
                            {item.quantity}x
                        </span>
                    </div>
                    <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                </div>
            ))}
        </div>

        {/* Summary Footer */}
        <div className="mt-auto pt-4 border-t border-dashed border-brand-border dark:border-dark-border">
            <div className="space-y-2 mb-6">
                <div className="flex justify-between items-center text-sm">
                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Itens ({itemCount})</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(subTotal)}
                    </span>
                </div>

                {discountAmount > 0 && (
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Desconto</span>
                        <span className="font-bold text-brand-green">
                            -{formatCurrency(discountAmount)}
                        </span>
                    </div>
                )}

                {shippingFee > 0 && (
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Entrega</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(shippingFee)}
                        </span>
                    </div>
                )}

                {otherCosts > 0 && (
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Outros Custos</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(otherCosts)}
                        </span>
                    </div>
                )}

                {pricingDetails.map((detail: any, index: number) => (
                    <div key={`${detail.label}-${index}`} className="flex justify-between items-center text-[14px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className={cn("font-medium truncate", detail.isAbsorbed ? "text-brand-inactive-text/70 dark:text-dark-body/50" : "text-brand-inactive-text dark:text-dark-body")}>
                                {detail.label}
                            </span>
                            {detail.tooltipRows && detail.tooltipRows.length > 0 && (
                                <Tooltip
                                    text={
                                        <div className="w-[200px] text-left">
                                            <div className="mb-2 font-bold">{detail.tooltipTitle || "Custos absorvidos"}</div>
                                            <div className="space-y-1.5">
                                                {detail.tooltipRows.map((row: any, rIdx: number) => (
                                                    <div key={rIdx} className="flex justify-between items-center gap-3 w-full">
                                                        <span className="text-white/70 dark:text-black/60 truncate text-xs" title={row.label}>
                                                            {row.label}
                                                        </span>
                                                        <span className="font-semibold shrink-0 text-xs">{row.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    }
                                >
                                    <span className="inline-flex shrink-0 cursor-help">
                                        <InfoIcon className="w-3.5 h-3.5 text-brand-inactive-text/60 dark:text-dark-body/40" />
                                    </span>
                                </Tooltip>
                            )}
                        </div>
                        <span className={cn("font-bold shrink-0",
                            detail.isAbsorbed
                                ? "text-brand-inactive-text/70 dark:text-dark-body/50"
                                : detail.tone === "positive"
                                    ? "text-brand-green"
                                    : detail.tone === "negative"
                                        ? "text-brand-red"
                                        : "text-brand-dark dark:text-dark-heading"
                        )}>
                            {detail.prefix || ""}{formatCurrency(detail.amount)}
                        </span>
                    </div>
                ))}
            </div>

            <div className="flex justify-between items-center">
                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total a Cobrar</span>
                <span className="font-black text-2xl text-brand-dark dark:text-dark-heading tracking-tight">
                    {formatCurrency(total)}
                </span>
            </div>
        </div>

        {/* Bottom Scallop Edge */}
        <ReceiptScallopEdge />
    </div>
);
