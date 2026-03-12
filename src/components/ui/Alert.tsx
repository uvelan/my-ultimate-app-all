import * as React from "react";
import { cn } from "@/lib/utils";
import { Typography } from "./Typography";
import { AlertCircle, CheckCircle2, Info, XCircle, X } from "lucide-react";

const alertVariants = {
  info: "bg-primary/5 text-primary border-primary/20",
  success: "bg-success/5 text-success border-success/20",
  warning: "bg-warning/5 text-warning border-warning/20",
  error: "bg-error/5 text-error border-error/20",
};

const alertIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  error: XCircle,
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof alertVariants;
  title?: string;
  onClose?: () => void;
}

export const Alert = ({
  variant = "info",
  title,
  children,
  onClose,
  className,
  ...props
}: AlertProps) => {
  const Icon = alertIcons[variant];

  return (
    <div
      className={cn(
        "relative w-full rounded-radius-md border p-space-4 flex gap-space-3 animate-in fade-in slide-in-from-top-2 duration-premium",
        alertVariants[variant],
        className
      )}
      role="alert"
      {...props}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-space-1">
        {title && (
          <Typography variant="small" className="font-semibold leading-none tracking-tight">
            {title}
          </Typography>
        )}
        <div className="text-small opacity-90 [&_p]:leading-relaxed">
          {children}
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 rounded-radius-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
