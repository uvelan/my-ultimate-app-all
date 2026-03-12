import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  wrapperClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, label, error, helperText, id, wrapperClassName, ...props }, ref) => {
    return (
      <div className={cn("w-full space-y-space-1", wrapperClassName)}>
        {label && (
          <label
            htmlFor={id}
            className="text-small font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <div className="relative group">
          <select
            className={cn(
              "appearance-none w-full px-4 py-3 rounded-radius-lg text-small bg-background-surface border border-border text-text-primary placeholder:text-text-muted transition-all duration-premium focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-error focus:border-error focus:ring-error/20",
              className
            )}
            id={id}
            ref={ref}
            {...props}
          >
            {children}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none group-focus-within:text-accent transition-colors">
            <ChevronDown size={16} />
          </div>
        </div>
        {error ? (
          <p className="text-caption text-error">{error}</p>
        ) : helperText ? (
          <p className="text-caption text-text-muted">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
