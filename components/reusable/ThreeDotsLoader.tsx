"use client"

import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ThreeDotsLoaderProps extends HTMLMotionProps<"div"> {
  className?: string;
  dotClassName?: string;
}

const ThreeDotsLoader: React.FC<ThreeDotsLoaderProps> = ({
  className,
  dotClassName,
  ...props
}) => {
  return (
    <motion.div
      className={cn("w-full h-full flex items-center justify-center p-8 opacity-50", className)}
      {...props}
    >
      <div className="animate-pulse flex items-center gap-2">
        <div className={cn("w-2 h-2 rounded-full bg-brand-green", dotClassName)}></div>
        <div className={cn("w-2 h-2 rounded-full bg-brand-green animation-delay-200", dotClassName)}></div>
        <div className={cn("w-2 h-2 rounded-full bg-brand-green animation-delay-400", dotClassName)}></div>
      </div>
    </motion.div>
  );
};

export default ThreeDotsLoader;
