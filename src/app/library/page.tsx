import type { Metadata } from "next";
import { VideoLibrary } from "@/components/VideoLibrary";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "My Library" };

export default function LibraryPage() {
  return (
    <div>
      <PageHeader title="My Library" subtitle="Saved Diskwala, TeraBox and direct video links. Only the link, title and playback position are stored." />
      <VideoLibrary />
    </div>
  );
}
