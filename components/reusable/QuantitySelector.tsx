import React from 'react';
import { PlusIcon, MinusIcon } from "@/lib/icons"

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  value,
  onChange,
  min = 0,
  max,
  size = 'md',
  disabled = false
}) => {
  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (max === undefined || value < max) {
      onChange(value + 1);
    }
  };

  const heightClass = size === 'sm' ? 'h-8' : 'h-10';
  const iconSize = size === 'sm' ? 14 : 16;
  const fontSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const widthClass = size === 'sm' ? 'w-24' : 'w-28';

  return (
    <div className={`flex items-center border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface ${heightClass} ${widthClass} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <button
        type="button"
        onClick={handleDecrement}
        disabled={value <= min}
        className={`h-full w-9 flex items-center justify-center text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading hover:bg-brand-gray dark:hover:bg-gray-800 transition-colors rounded-l-lg border-r border-brand-border dark:border-dark-border disabled:opacity-30`}
      >
        <MinusIcon size={iconSize} />
      </button>
      <div className={`flex-1 flex items-center justify-center font-bold text-brand-dark dark:text-dark-heading ${fontSize}`}>
        {value}
      </div>
      <button
        type="button"
        onClick={handleIncrement}
        disabled={max !== undefined && value >= max}
        className={`h-full w-9 flex items-center justify-center text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading hover:bg-brand-gray dark:hover:bg-gray-800 transition-colors rounded-r-lg border-l border-brand-border dark:border-dark-border disabled:opacity-30`}
      >
        <PlusIcon size={iconSize} />
      </button>
    </div>
  );
};

export default QuantitySelector;
