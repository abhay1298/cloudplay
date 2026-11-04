import Link from "next/link";
import { linkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <p className="text-6xl font-extrabold brand-text">404</p>
      <p className="mt-2 text-muted">This page doesn&apos;t exist.</p>
      <Link href="/" className={`${linkButton.primary} mt-6`}>
        Go home
      </Link>
    </div>
  );
}
