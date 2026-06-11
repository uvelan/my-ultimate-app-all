import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Typography } from '@/components/ui/Typography';

export interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    children: React.ReactNode;
}

export function Drawer({ isOpen, onClose, title, description, children }: DrawerProps) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    return (
        <>
            {isOpen && (
                <div 
                    className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm transition-all duration-base ease-stitch animate-in fade-in"
                    onClick={onClose}
                />
            )}
            <div 
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? "drawer-title" : undefined}
                aria-describedby={description ? "drawer-description" : undefined}
                className={cn(
                    "fixed inset-y-0 right-0 z-[70] w-full max-w-md bg-background border-l border-border shadow-shadow-xl transform transition-transform duration-base ease-stitch flex flex-col",
                    isOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                <div className="flex items-center justify-between p-space-6 border-b border-border bg-secondary/50">
                    <div>
                        {title && <Typography variant="h3" id="drawer-title" className="font-bold text-text-primary tracking-tight">{title}</Typography>}
                        {description && <Typography variant="caption" id="drawer-description" className="text-text-secondary mt-1">{description}</Typography>}
                    </div>
                    <button 
                        onClick={onClose}
                        aria-label="Close drawer"
                        className="p-2 text-text-muted hover:text-text-primary hover:bg-secondary rounded-radius-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-space-6 bg-background no-scrollbar">
                    {children}
                </div>
            </div>
        </>
    );
}
