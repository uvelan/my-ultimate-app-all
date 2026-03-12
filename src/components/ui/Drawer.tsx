import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Typography } from "./Typography";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  side?: "left" | "right";
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

const sizeClasses = {
  sm: "max-w-xs",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-full",
};

export const Drawer = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  side = "right",
  size = "md",
}: DrawerProps) => {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background-overlay/60 backdrop-blur-sm transition-premium animate-in fade-in"
        onClick={onClose}
      />

      {/* Drawer Content */}
      <div
        className={cn(
          "relative flex w-full flex-col bg-background-surface shadow-shadow-xl transition-premium animate-in duration-premium",
          side === "left" ? "left-0 slide-in-from-left" : "right-0 ml-auto slide-in-from-right",
          sizeClasses[size]
        )}
      >
        <div className="flex items-center justify-between border-b border-border p-space-6 flex-shrink-0">
          <div className="space-y-space-1">
            {title && (
              <Typography variant="h4" className="font-semibold text-text-primary">
                {title}
              </Typography>
            )}
            {description && (
              <Typography variant="caption" className="text-text-muted">
                {description}
              </Typography>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-radius-md p-space-2 text-text-muted hover:bg-background-muted hover:text-text-primary transition-premium focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-space-6 no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};
