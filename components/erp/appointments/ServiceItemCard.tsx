
import React from 'react';
import { EditIcon, TrashIcon } from '@/lib/icons';
import { getEndTime } from './utils';
import { InfoCard } from '@/components/reusable';
import { formatCurrency } from '@/lib/utils/formatters';
import { getFulfillmentModeLabel } from '@/lib/orders/status';
import { findBestItemPrice } from '@/lib/services/pricing-engine';

interface ServiceItemCardProps {
    service: any;
    onEdit?: (id: number) => void;
    onRemove?: (id: number) => void;
    onClick?: () => void;
    showActions?: boolean;
    unavailable?: boolean;
    timeRange?: string;
    fulfillmentMode?: string | null;
    promotions?: any[];
}

export const ServiceItemCard: React.FC<ServiceItemCardProps> = ({
    service,
    onEdit,
    onRemove,
    onClick,
    showActions = true,
    unavailable = false,
    timeRange,
    fulfillmentMode,
    promotions = [],
}) => {
    // If explicit timeRange is passed, use it. Otherwise calc based on service.startTime or fallback
    const timeDisplay = timeRange
        ? timeRange
        : (service.startTime ? `${service.startTime} - ${getEndTime(service.startTime, parseInt(service.duration))}` : '');

    return (
        <div
            onClick={onClick}
            className={`relative flex justify-between items-center p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-zinc-900/50 group transition-all ${onClick ? 'cursor-pointer hover:border-gray-300 dark:hover:border-gray-600' : ''}`}
        >
            <div className="absolute left-1.5 top-1.5 bottom-1.5 w-1 rounded-full bg-brand-green dark:bg-brand-green"></div>

            <div className="pl-4 flex-1">
                <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[15px] leading-tight pr-4">{service.name}</h4>

                    {showActions && (
                        <div className="flex gap-2 flex-shrink-0">
                            {onEdit && (
                                <button onClick={(e) => { e.stopPropagation(); onEdit(service.id); }} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading p-1 transition-all duration-200 hover:scale-110">
                                    <EditIcon size={16} />
                                </button>
                            )}
                            {onRemove && (
                                <button onClick={(e) => { e.stopPropagation(); onRemove(service.id); }} className="text-brand-inactive-text hover:text-brand-red p-1 transition-all duration-200 hover:scale-110">
                                    <TrashIcon size={16} />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center mb-2">
                    <div className="text-sm text-brand-inactive-text">
                        {service.duration}min
                        {fulfillmentMode && (
                            <span className="ml-2">· {getFulfillmentModeLabel(fulfillmentMode)}</span>
                        )}
                    </div>
                    <div className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(findBestItemPrice(Number(service.price || 0), service.promotional_price && Number(service.promotional_price) < Number(service.price || 0) ? Number(service.promotional_price) : null, promotions, { serviceId: service.id }).bestPrice)}</div>
                </div>

                <div className="border-t border-brand-border dark:border-dark-border pt-2 mt-1 flex justify-between items-center">
                    <span className="text-sm font-normal text-brand-dark dark:text-dark-heading">{service.staff}</span>
                    {timeDisplay && (
                        <span className="text-xs font-bold text-brand-inactive-text">{timeDisplay}</span>
                    )}
                </div>

                {unavailable && (
                    <div className="flex justify-between items-center mt-2">
                        <InfoCard color="orange" title="Atenção" message="O colaborador não está disponível" />
                    </div>
                )}
            </div>
        </div>
    );
};
