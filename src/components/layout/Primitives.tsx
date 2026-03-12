import * as React from "react";
import { cn } from "@/lib/utils";

export const Container = ({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mx-auto w-full max-w-7xl px-space-4 md:px-space-6 lg:px-space-8", className)}
    {...props}
  >
    {children}
  </div>
);

export const Stack = ({
  children,
  className,
  direction = "col",
  gap = "space-4",
  align = "start",
  justify = "start",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  direction?: "row" | "col";
  gap?: string;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
}) => {
  const aligns = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    stretch: "items-stretch",
  };

  const justifies = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
    between: "justify-between",
  };

  return (
    <div
      className={cn(
        "flex",
        direction === "col" ? "flex-col" : "flex-row",
        `gap-${gap}`,
        aligns[align],
        justifies[justify],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const Grid = ({
  children,
  className,
  cols = 1,
  gap = "space-4",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  cols?: number | { sm?: number; md?: number; lg?: number; xl?: number };
  gap?: string;
}) => {
  const getColClass = (c: any) => {
    if (typeof c === "number") return `grid-cols-${c}`;
    const classes = [];
    if (c.sm) classes.push(`sm:grid-cols-${c.sm}`);
    if (c.md) classes.push(`md:grid-cols-${c.md}`);
    if (c.lg) classes.push(`lg:grid-cols-${c.lg}`);
    if (c.xl) classes.push(`xl:grid-cols-${c.xl}`);
    return classes.join(" ");
  };

  return (
    <div
      className={cn(
        "grid",
        getColClass(cols),
        `gap-${gap}`,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const Section = ({
  children,
  className,
  title,
  description,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  title?: string;
  description?: string;
}) => (
  <section className={cn("space-y-space-6 py-space-6 md:py-space-8", className)} {...props}>
    {(title || description) && (
      <div className="space-y-space-2 max-w-2xl">
        {title && <h2 className="text-h2 font-semibold tracking-tight text-text-primary">{title}</h2>}
        {description && <p className="text-small text-text-secondary">{description}</p>}
      </div>
    )}
    {children}
  </section>
);
