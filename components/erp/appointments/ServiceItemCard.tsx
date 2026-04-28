
import React from 'react';
import { Check, Edit3, Trash2 } from 'lucide-react';
import { getEndTime } from './utils';

interface ServiceItemCardProps {
    service: any;
    onEdit?: (id: number) => void;
    onRemove?: (id: number) => void;
    onClick?: () => void;
    showActions?: boolean;
    unavailable?: boolean;
    timeRange?: string; // New Prop
}

export const ServiceItemCard: React.FC<ServiceItemCardProps> = ({ 
    service, 
    onEdit, 
    onRemove, 
    onClick, 
    showActions = true,
    unavailable = false,
    timeRange
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
            <div className={`absolute left-1.5 top-1.5 bottom-1.5 w-1 rounded-full ${service.colorClass || 'bg-purple-500'}`}></div>
            
            <div className="pl-4 flex-1">
                <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[15px] leading-tight pr-4">{service.name}</h4>
                    
                    {showActions && (
                        <div className="flex gap-2 flex-shrink-0">
                            {onEdit && (
                                <button onClick={(e) => { e.stopPropagation(); onEdit(service.id); }} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading p-1">
                                    <Edit3 size={16} />
                                </button>
                            )}
                            {onRemove && (
                                <button onClick={(e) => { e.stopPropagation(); onRemove(service.id); }} className="text-brand-inactive-text hover:text-red-500 p-1">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="flex justify-between items-center mb-2">
                    <div className="text-sm text-brand-inactive-text">
                        {service.duration}min
                    </div>
                    {/* Display Individual Service Price, not accumulated total */}
                    <div className="font-bold text-brand-dark dark:text-dark-heading">R$ {service.price}</div>
                </div>
                
                <div className="border-t border-brand-border dark:border-dark-border pt-2 mt-1 flex justify-between items-center">
                    <span className="text-sm font-normal text-brand-dark dark:text-dark-heading">{service.staff}</span>
                    {timeDisplay && (
                        <span className="text-xs font-bold text-brand-inactive-text">{timeDisplay}</span>
                    )}
                </div>
                
                {unavailable && (
                    <div className="flex justify-between items-center mt-2">
                        <div className="flex gap-2 px-2 py-1 relative pl-3">
                            <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-orange-500 rounded-full"></div>
                            <span className="text-xs text-brand-dark dark:text-dark-heading font-medium">O colaborador não está disponível</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
