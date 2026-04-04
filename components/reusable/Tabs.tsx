"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils" // Assumindo que você tem o cn configurado

// Contexto para gerenciar a animação e o estado ativo
interface TabsContextValue {
  activeTab: string
  uniqueId: string
}
const TabsContext = React.createContext<TabsContextValue | undefined>(undefined)

interface TabsProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> { }

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  TabsProps
>(({ children, value, defaultValue, onValueChange, ...props }, ref) => {
  // Geramos um ID único para garantir que, se houver 2 Tabs na tela, 
  // a animação não pule de um para o outro.
  const uniqueId = React.useId()

  // Precisamos saber o estado atual para renderizar a linha no lugar certo.
  // Gerenciamos o estado interno se for uncontrolled, ou usamos o value se for controlled.
  const [internalValue, setInternalValue] = React.useState(value || defaultValue || "")

  // Sincroniza se o componente for controlado externamente
  React.useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value)
    }
  }, [value])

  const handleValueChange = (newValue: string) => {
    setInternalValue(newValue)
    onValueChange?.(newValue)
  }

  return (
    <TabsContext.Provider value={{ activeTab: internalValue, uniqueId }}>
      <TabsPrimitive.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        {...props}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsContext.Provider>
  )
})
Tabs.displayName = TabsPrimitive.Root.displayName

interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  className?: string
}

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className = "", ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      // Adicionado 'relative' para contexto de posicionamento se necessário
      className={cn(
        "relative flex items-center gap-6 md:gap-8 border-b border-brand-border dark:border-dark-border w-full overflow-x-auto hide-scrollbar px-4 md:px-0",
        className
      )}
      {...props}
    />
  ),
)
TabsList.displayName = "TabsList"

interface TabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  className?: string
  icon?: React.ElementType
  badge?: React.ReactNode
}

const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, TabsTriggerProps>(
  ({ className = "", icon: Icon, badge, children, value, ...props }, ref) => {
    const context = React.useContext(TabsContext)
    const isActive = context?.activeTab === value

    return (
      <TabsPrimitive.Trigger
        ref={ref}
        value={value}
        className={cn(
          "relative pb-3 text-sm flex items-center gap-2 whitespace-nowrap transition-colors outline-none select-none cursor-pointer",
          "disabled:pointer-events-none disabled:opacity-50",
          // Base styles (hover, text color)
          "font-medium text-brand-inactive-text dark:text-dark-body hover:text-gray-700 dark:hover:text-gray-300",
          // Active text styles (removed border styles here, controlled by motion div below)
          "data-[state=active]:text-brand-dark dark:data-[state=active]:text-white",
          className
        )}
        {...props}
      >
        <span className="relative z-10 flex items-center gap-2">
          {Icon && <Icon size={16} />}
          {children}
          {badge}
        </span>

        {/* A Mágica do Framer Motion: */}
        {isActive && (
          <motion.div
            layoutId={`${context?.uniqueId}-indicator`}
            className="absolute left-0 right-0 bottom-0 h-[2px] bg-brand-green"
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 30, // Ajuste fino para não ser nem muito elástico nem muito rígido
            }}
          />
        )}
      </TabsPrimitive.Trigger>
    )
  },
)
TabsTrigger.displayName = "TabsTrigger"

interface TabsContentProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {
  className?: string
}

const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, TabsContentProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <TabsPrimitive.Content
        ref={ref}
        className={cn(
          "mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className
        )}
        {...props}
      >
        {children}
      </TabsPrimitive.Content>
    )
  },
)
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps }
