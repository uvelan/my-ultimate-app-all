import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
}

export const Tabs = ({ value, onValueChange, children, className, ...props }: TabsProps) => {
  return (
    <div className={cn("w-full", className)} {...props}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, { activeValue: value, onValueChange });
        }
        return child;
      })}
    </div>
  );
};

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  activeValue?: string;
  onValueChange?: (value: string) => void;
}

export const TabsList = ({ activeValue, onValueChange, children, className, ...props }: TabsListProps) => {
  return (
    <div
      className={cn(
        "inline-flex h-12 items-center justify-start gap-space-4 border-b border-border w-full px-space-2 overflow-x-auto no-scrollbar",
        className
      )}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement<{ value: string }>(child)) {
          return React.cloneElement(child, {
            active: child.props.value === activeValue,
            onClick: () => onValueChange?.(child.props.value),
          } as any);
        }
        return child;
      })}
    </div>
  );
};

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  active?: boolean;
}

export const TabsTrigger = ({
  value,
  active,
  children,
  className,
  ...props
}: TabsTriggerProps) => {
  return (
    <button
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
  activeValue?: string;
}

export const TabsContent = ({
  value,
  activeValue,
  children,
  className,
  ...props
}: TabsContentProps) => {
  if (value !== activeValue) return null;
  return (
    <div
      className={cn("mt-space-6 animate-in fade-in duration-premium", className)}
      {...props}
    >
      {children}
    </div>
  );
};
