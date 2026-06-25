"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function TasksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
      <h2 className="text-xl font-semibold text-text-primary">Something went wrong!</h2>
      <p className="text-text-secondary text-sm max-w-md text-center">
        There was a problem loading your tasks. Please try again.
      </p>
      <Button onClick={() => reset()} variant="primary">
        Try again
      </Button>
    </div>
  );
}
