import * as React from "react";
import { cn } from "@/lib/utils";

interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  variant?: "display" | "h1" | "h2" | "h3" | "h4" | "body" | "small" | "caption";
  as?: React.ElementType;
}

const Typography = React.forwardRef<HTMLElement, TypographyProps>(
  ({ className, variant = "body", as: Component = "p", ...props }, ref) => {
    const variants = {
      display: "text-display",
      h1: "text-h1",
      h2: "text-h2",
      h3: "text-h3",
      h4: "text-h4",
      body: "text-body",
      small: "text-small",
      caption: "text-caption",
    };

    return (
      <Component
        ref={ref}
        className={cn(variants[variant], className)}
        {...props}
      />
    );
  }
);
Typography.displayName = "Typography";

export { Typography };
