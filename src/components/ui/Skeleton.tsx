import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-radius-md bg-background-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
