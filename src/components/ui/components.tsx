import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'outline';
    isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', isLoading, children, ...props }, ref) => {
        const variants = {
            primary: 'btn-primary-custom',
            secondary: 'btn-secondary',
            danger: 'btn-danger',
            outline: 'btn-outline-primary',
        };

        return (
            <button
                ref={ref}
                className={cn('btn', variants[variant], className)}
                disabled={isLoading || props.disabled}
                {...props}
            >
                {isLoading ? (
                    <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Loading...
                    </>
                ) : (
                    children
                )}
            </button>
        );
    }
);
Button.displayName = 'Button';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, id, ...props }, ref) => {
        return (
            <div className="mb-3">
                {label && (
                    <label htmlFor={id} className="form-label">
                        {label}
                    </label>
                )}
                <input
                    id={id}
                    ref={ref}
                    className={cn('form-control glass-input', error && 'is-invalid', className)}
                    {...props}
                />
                {error && <div className="invalid-feedback">{error}</div>}
            </div>
        );
    }
);
Input.displayName = 'Input';

export const Card = ({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) => {
    return <div className={cn('card glass-card p-4', className)}>{children}</div>;
};
