import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  min = 1,
  max,
  size = 'md',
  disabled = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(String(value));
    }
  }, [value, isEditing]);

  const commitInput = useCallback(() => {
    setIsEditing(false);
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed) && parsed >= min) {
      onChange(parsed);
    } else {
      setInputValue(String(value));
    }
  }, [inputValue, min, onChange, value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (/^\d*$/.test(raw)) {
      setInputValue(raw);
    }
  };

  const handleInputBlur = () => {
    commitInput();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitInput();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setInputValue(String(value));
    }
  };

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setIsEditing(true);
    setInputValue(String(value));
    requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (max === undefined || value < max) {
      onChange(value + 1);
    }
  };

  const heightMap = {
    sm: 'h-8',
    md: 'h-10'
  };

  const buttonSizeMap = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8'
  };

  const heightClass = heightMap[size];
  const buttonSizeClass = buttonSizeMap[size];
  const iconSize = size === 'sm' ? 12 : 14;
  const fontSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div
      className={`flex items-center justify-between rounded-full bg-brand-gray dark:bg-dark-border/30 p-1 ${heightClass} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      style={{ minWidth: size === 'sm' ? '80px' : '100px' }}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={value <= min}
        className={`${buttonSizeClass} rounded-full bg-white dark:bg-dark-surface flex items-center justify-center transition-all disabled:opacity-30 active:scale-90 text-brand-dark dark:text-dark-heading`}
      >
        <MinusIcon size={iconSize} />
      </button>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          className={`flex-1 text-center font-semibold text-brand-dark dark:text-dark-heading ${fontSize} bg-transparent outline-none tabular-nums w-0`}
          autoFocus
        />
      ) : (
        <div
          className={`flex-1 text-center font-semibold text-brand-dark dark:text-dark-heading ${fontSize} tabular-nums cursor-text`}
          onClick={startEditing}
        >
          {value < 10 ? `0${value}` : value}
        </div>
      )}

      <button
        type="button"
        onClick={handleIncrement}
        disabled={max !== undefined && value >= max}
        className={`${buttonSizeClass} rounded-full bg-white dark:bg-dark-surface flex items-center justify-center transition-all disabled:opacity-30 active:scale-90 text-brand-dark dark:text-dark-heading`}
      >
        <PlusIcon size={iconSize} />
      </button>
    </div>
  );
};

export default QuantitySelector;
