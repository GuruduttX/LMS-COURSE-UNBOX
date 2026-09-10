import { ArrowRight, Mail, MapPin, Phone } from "lucide-react";

import { EnquiryButton } from "@/components/enquiry/EnquiryButton";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

export function CtaBand() {
  return (
    <section id="contact" className="scroll-mt-20 bg-brand-solid-hover py-14 md:py-20">
      <Container>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-2xl font-extrabold leading-tight text-white md:text-3xl">
              Start learning with Course Unbox
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-brand-100">
              Free counselling, no upfront payment. Tell us where you are and a real
              person from our Noida team will help you pick the right program.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <EnquiryButton source="cta-band" size="lg" variant="inverse">
                Apply now
                <ArrowRight size={18} />
              </EnquiryButton>
              <ButtonLink
                href="tel:+918923660886"
                size="lg"
                variant="ghost"
                className="border border-brand-400 text-white hover:bg-brand-solid hover:text-white"
              >
                <Phone size={18} />
                Call us now
              </ButtonLink>
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <ContactRow
              icon={<Phone size={18} />}
              label="Call us"
              value="+91 89236 60886"
              href="tel:+918923660886"
            />
            <ContactRow
              icon={<Mail size={18} />}
              label="Email"
              value="support@courseunbox.com"
              href="mailto:support@courseunbox.com"
            />
            <ContactRow
              icon={<MapPin size={18} />}
              label="Visit the centre"
              value="Sandesh Tower, C-56/31, Sector-62, Noida 201309"
            />
          </ul>
        </div>
      </Container>
    </section>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-2xs font-semibold uppercase tracking-[0.12em] text-brand-200">
          {label}
        </span>
        <span className="mt-0.5 block text-sm font-semibold text-white">
          {value}
        </span>
      </span>
    </>
  );

  return (
    <li>
      {href ? (
        <a
          href={href}
          className="flex items-center gap-3 rounded-xl border border-brand-500 bg-brand-800/40 p-4 transition-colors hover:bg-brand-800"
        >
          {content}
        </a>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-brand-500 bg-brand-800/40 p-4">
          {content}
        </div>
      )}
    </li>
  );
}
