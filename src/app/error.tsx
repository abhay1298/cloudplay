"use client";

import { ErrorMessage } from "@/components/ErrorMessage";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorMessage title="Unexpected error" message="Something went wrong while rendering this page." onRetry={reset} />;
}
