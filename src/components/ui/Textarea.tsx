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
            "flex min-h-[120px] w-full rounded-radius-md border-none bg-background-muted px-space-4 py-space-3 text-small ring-offset-background placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-premium resize-none",
            error && "ring-2 ring-error/20",
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
