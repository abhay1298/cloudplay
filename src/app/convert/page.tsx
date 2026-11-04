import { Suspense } from "react";
import type { Metadata } from "next";
import { ConvertView } from "./ConvertView";

export const metadata: Metadata = { title: "Convert" };

export default function ConvertPage() {
  return (
    <Suspense>
      <ConvertView />
    </Suspense>
  );
}
