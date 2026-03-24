import React from 'react';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}

export const Switch = ({ checked, onCheckedChange, className = "" }: SwitchProps) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)} // Retorna o inverso do estado atual
      className={`
        relative w-[40px] h-[22px] rounded-full p-0.5 cursor-pointer
        transition-colors duration-300 ease-in-out focus:outline-none
        ${checked ? "bg-brand-green" : "bg-gray-200 dark:bg-dark-border/50"}
        ${className}
      `}
    >
      <div
        className={`
          w-[18px] h-[18px] bg-white rounded-full shadow-sm
          transform transition-transform duration-300 ease-in-out
          ${checked ? "translate-x-[18px]" : "translate-x-0"}
        `}
      />
    </button>
  );
};
