import * as React from "react";
import { cn } from "@/lib/utils";
import { Typography } from "./Typography";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const textareaId = id || React.useId();

    return (
      <div className="w-full space-y-space-2">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-small font-medium text-text-primary block"
          >
            {label}
          </label>
        )}
        <textarea
          className={cn(
            "flex min-h-[120px] w-full px-4 py-3 rounded-radius-lg text-small bg-background-surface border border-border text-text-primary placeholder:text-text-muted transition-all duration-premium focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
            error && "border-error focus:border-error focus:ring-error/20",
            className
          )}
          ref={ref}
          id={textareaId}
          {...props}
        />
        {error && (
          <Typography variant="caption" className="text-error mt-space-1">
            {error}
          </Typography>
        )}
        {helperText && !error && (
          <Typography variant="caption" className="text-text-muted mt-space-1">
            {helperText}
          </Typography>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
