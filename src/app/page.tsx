import { EnquiryProvider } from "@/components/enquiry/EnquiryProvider";
import { Advantage } from "@/components/home/Advantage";
import { CtaBand } from "@/components/home/CtaBand";
import { Educators } from "@/components/home/Educators";
import { Faq } from "@/components/home/Faq";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Programs } from "@/components/home/Programs";
import { Testimonials } from "@/components/home/Testimonials";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getTheme } from "@/lib/theme-server";

/**
 * Public home page — what a visitor sees before logging in.
 * All content is static (src/lib/data/home.ts) until the models land.
 */
export default async function HomePage() {
  const theme = await getTheme();

  return (
    <EnquiryProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-lg focus:bg-brand-solid focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <SiteHeader theme={theme} />

      <main id="main" className="flex-1">
        <Hero />
        <Programs />
        <Advantage />
        <HowItWorks />
        <Educators />
        <Testimonials />
        <Faq />
        <CtaBand />
      </main>

      <SiteFooter />
    </EnquiryProvider>
  );
}
