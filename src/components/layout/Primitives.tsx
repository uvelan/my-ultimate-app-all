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

  const gapMap: Record<string, string> = {
    "space-1": "gap-space-1",
    "space-2": "gap-space-2",
    "space-3": "gap-space-3",
    "space-4": "gap-space-4",
    "space-6": "gap-space-6",
    "space-8": "gap-space-8",
    "space-12": "gap-space-12",
  };

  return (
    <div
      className={cn(
        "flex",
        direction === "col" ? "flex-col" : "flex-row",
        gapMap[gap] || "gap-space-4",
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
  cols?: number | { base?: number; sm?: number; md?: number; lg?: number; xl?: number };
  gap?: string;
}) => {
  const colMap: Record<number, string> = {
    1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6", 7: "grid-cols-7", 8: "grid-cols-8"
  };
  const smColMap: Record<number, string> = {
    1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5", 6: "sm:grid-cols-6", 7: "sm:grid-cols-7"
  };
  const mdColMap: Record<number, string> = {
    1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5", 6: "md:grid-cols-6", 7: "md:grid-cols-7"
  };
  const lgColMap: Record<number, string> = {
    1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6", 7: "lg:grid-cols-7"
  };
  const xlColMap: Record<number, string> = {
    1: "xl:grid-cols-1", 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4", 5: "xl:grid-cols-5", 6: "xl:grid-cols-6", 7: "xl:grid-cols-7"
  };

  const getColClass = (c: any) => {
    if (typeof c === "number") return colMap[c] || "grid-cols-1";
    const classes = [];
    if (c.base) classes.push(colMap[c.base] || "grid-cols-1");
    else classes.push("grid-cols-1");

    if (c.sm) classes.push(smColMap[c.sm]);
    if (c.md) classes.push(mdColMap[c.md]);
    if (c.lg) classes.push(lgColMap[c.lg]);
    if (c.xl) classes.push(xlColMap[c.xl]);
    return classes.join(" ");
  };

  const gapMap: Record<string, string> = {
    "space-1": "gap-space-1",
    "space-2": "gap-space-2",
    "space-3": "gap-space-3",
    "space-4": "gap-space-4",
    "space-6": "gap-space-6",
    "space-8": "gap-space-8",
    "space-12": "gap-space-12",
  };

  return (
    <div
      className={cn(
        "grid",
        getColClass(cols),
        gapMap[gap] || "gap-space-4",
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
