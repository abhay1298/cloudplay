import { AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button, linkButton } from "./ui";

export function ErrorMessage({
  title = "Something went wrong",
  message,
  externalUrl,
  externalLabel = "Open original link",
  onRetry,
  children,
}: {
  title?: string;
  message: string;
  externalUrl?: string;
  externalLabel?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 p-4 sm:p-5">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted">{message}</p>
          {children}
          {(externalUrl || onRetry) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {externalUrl && (
                <a href={externalUrl} target="_blank" rel="noopener noreferrer nofollow" className={linkButton.secondary}>
                  <ExternalLink className="size-4" aria-hidden /> {externalLabel}
                </a>
              )}
              {onRetry && (
                <Button variant="secondary" onClick={onRetry}>
                  <RotateCcw className="size-4" aria-hidden /> Retry
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
