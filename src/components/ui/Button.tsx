import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center gap-2 rounded-radius-lg font-medium text-small tracking-wide transition-all duration-premium ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50";
    
    const variants = {
      primary: "bg-accent text-white hover:opacity-90 hover:-translate-y-[1px] hover:shadow-shadow-md active:translate-y-0 active:opacity-100",
      secondary: "border border-border text-text-primary bg-transparent hover:border-accent hover:text-accent hover:bg-accent/5",
      outline: "border border-border text-text-primary bg-transparent hover:border-accent hover:text-accent hover:bg-accent/5",
      ghost: "text-text-primary hover:text-accent hover:bg-accent/5",
      danger: "bg-error text-white hover:opacity-90 hover:-translate-y-[1px] hover:shadow-shadow-md active:translate-y-0 active:opacity-100",
    };

    const sizes = {
      sm: "h-8 px-4 text-caption",
      md: "px-6 py-3",
      lg: "px-8 py-4 text-body",
      icon: "h-10 w-10 p-0",
    };

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {!isLoading && leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
