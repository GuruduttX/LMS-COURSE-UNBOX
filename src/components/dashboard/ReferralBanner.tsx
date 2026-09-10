import Image from "next/image";
import Link from "next/link";

import banner from "../../../public/referral-banner.webp";

/**
 * Referral banner. Narrower than the page content so it reads as a promo rather
 * than a page header, with clear space either side (design.md §4 — proximity).
 * The whole banner is the link; the "Refer now" button is baked into the artwork.
 *
 * No card, radius or shadow on the wrapper: the artwork carries transparent
 * margins and its own rounded corners, so a container box would draw a visible
 * frame around empty space.
 */
export function ReferralBanner() {
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/refer"
        className="block rounded-xl opacity-100 transition-opacity duration-200 hover:opacity-95"
      >
        <Image
          src={banner}
          alt="Refer our courses to your friends and earn up to ₹10,000. Share your link, your friend joins and enrolls, you earn."
          sizes="(min-width: 896px) 896px, 100vw"
          priority
          className="h-auto w-full"
        />
      </Link>
    </div>
  );
}
