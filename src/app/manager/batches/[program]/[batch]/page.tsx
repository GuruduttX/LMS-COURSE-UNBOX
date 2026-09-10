/**
 * One batch's students. Guard and scope check live in the screen's loaders.
 *
 * The batch name is the URL segment because it is what enrolments are keyed by
 * — see `batchDetail` — so it arrives encoded and is decoded once here.
 */
import type { Metadata } from "next";

import { BatchStudentsScreen } from "@/components/staff/students/screens";

/** Occupancy is a live count; a cached "2 seats left" is the one stale number
    this feature exists to prevent. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Batch" };

type Params = PageProps<"/manager/batches/[program]/[batch]">;

export default async function Page({ params }: Params) {
  const { program, batch } = await params;

  return (
    <BatchStudentsScreen
      programSlug={program}
      batchName={decodeURIComponent(batch)}
    />
  );
}
