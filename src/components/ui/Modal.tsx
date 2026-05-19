"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
}: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-space-4 bg-background/80 backdrop-blur-sm transition-premium animate-in fade-in">
      <div
        className={cn(
          "relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-radius-lg border border-border bg-background-surface shadow-xl animate-in zoom-in-95",
          className
        )}
      >
        <div className="flex flex-col space-y-space-2 p-space-6 pb-space-4 shrink-0">
          <div className="flex items-center justify-between">
            {title && (
              <h2 className="text-h3 font-semibold leading-none tracking-tight">
                {title}
              </h2>
            )}
            <button
              onClick={onClose}
              className="rounded-radius-sm opacity-70 transition-premium hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-border-focus"
            >
              <X className="h-space-4 w-space-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          {description && (
            <p className="text-small text-text-secondary">{description}</p>
          )}
        </div>
        <div className="p-space-6 pt-0 overflow-y-auto">{children}</div>
      </div>
      <div
        className="fixed inset-0 -z-10 cursor-pointer"
        onClick={onClose}
      />
    </div>
  );
};
