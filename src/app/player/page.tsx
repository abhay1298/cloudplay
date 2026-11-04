import { Suspense } from "react";
import type { Metadata } from "next";
import { PlayerView } from "./PlayerView";

export const metadata: Metadata = { title: "Universal Player" };

export default function PlayerPage() {
  return (
    <Suspense>
      <PlayerView />
    </Suspense>
  );
}
