import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
}

export const Tabs = ({ value, onValueChange, children, className, ...props }: TabsProps) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

export const TabsList = ({ children, className, ...props }: TabsListProps) => {
  return (
    <div
      className={cn(
        "inline-flex h-12 items-center justify-start gap-space-4 border-b border-border w-full px-space-2 overflow-x-auto no-scrollbar",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = ({
  value,
  children,
  className,
  ...props
}: TabsTriggerProps) => {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used within Tabs");
  
  const active = context.value === value;

  return (
    <button
      onClick={() => context.onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap px-space-4 py-space-2 text-small font-medium transition-premium border-b-2",
        active
          ? "border-primary text-primary"
          : "border-transparent text-text-muted hover:text-text-primary hover:border-border",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  activeValue?: string; // Kept for backwards compatibility if passed explicitly somewhere
}

export const TabsContent = ({
  value,
  activeValue,
  children,
  className,
  ...props
}: TabsContentProps) => {
  const context = React.useContext(TabsContext);
  
  // Use context value if available, fallback to activeValue prop for backwards compatibility
  const currentValue = context ? context.value : activeValue;
  
  if (value !== currentValue) return null;

  return (
    <div
      className={cn("mt-space-6 animate-in fade-in duration-premium", className)}
      {...props}
    >
      {children}
    </div>
  );
};
