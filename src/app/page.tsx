import { EnquiryProvider } from "@/components/enquiry/EnquiryProvider";
import { Advantage } from "@/components/home/Advantage";
import { CtaBand } from "@/components/home/CtaBand";
import { Educators } from "@/components/home/Educators";
import { Faq } from "@/components/home/Faq";
import { FirstDay } from "@/components/home/FirstDay";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Programs } from "@/components/home/Programs";
import { Testimonials } from "@/components/home/Testimonials";
import { PublicHeader } from "@/components/site/SiteChrome";
import { SiteFooter } from "@/components/site/SiteFooter";
import { publicProgramTitles } from "@/lib/data/public-programs";

/**
 * Public home page — what a visitor sees before logging in.
 *
 * The programs come from the database (`Programs` reads them, and the header,
 * footer and enquiry dropdown each read what they need); everything else —
 * the testimonials, the FAQ, the educators — is institution-level copy with no
 * database counterpart and stays in `data/home.ts`.
 *
 * Dynamic rather than revalidated: `PublicHeader` reads the theme cookie, so
 * this page cannot be statically rendered anyway, and `export const revalidate`
 * here would claim a caching behaviour it does not have.
 */
export default async function HomePage() {
  const programs = await publicProgramTitles();
  return (
    <EnquiryProvider programs={programs}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-lg focus:bg-brand-solid focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <PublicHeader />

      <main id="main" className="flex-1">
        <Hero />
        <Programs />
        <Advantage />
        <HowItWorks />
        <FirstDay />
        <Educators />
        <Testimonials />
        <Faq />
        <CtaBand />
      </main>

      <SiteFooter />
    </EnquiryProvider>
  );
}
