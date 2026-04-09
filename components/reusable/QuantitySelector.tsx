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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);

    if (isNaN(newValue)) return;

    if (newValue < min) {
      onChange(min);
    } else if (max !== undefined && newValue > max) {
      onChange(max);
    } else {
      onChange(newValue);
    }
  };

  const heightMap = {
    sm: 'h-8',
    md: 'h-10'
  };


  const heightClass = heightMap[size];
  const iconSize = size === 'sm' ? 14 : 14;
  const fontSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div
      className={`flex items-center border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface ${heightClass} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={value <= min}
        className="w-9 h-full flex items-center justify-center hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors disabled:opacity-30"
      >
        <MinusIcon size={iconSize} />
      </button>

      <input
        type="number"
        value={value}
        onChange={handleInputChange}
        min={min}
        max={max}
        className={`w-10 text-center font-medium bg-transparent outline-none text-brand-dark dark:text-dark-heading ${fontSize}`}
      />

      <button
        type="button"
        onClick={handleIncrement}
        disabled={max !== undefined && value >= max}
        className="w-9 h-full flex items-center justify-center hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors disabled:opacity-30"
      >
        <PlusIcon size={iconSize} />
      </button>
    </div>
  );
};

export default QuantitySelector;