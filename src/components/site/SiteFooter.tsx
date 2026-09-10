import { GraduationCap } from "lucide-react";
import Link from "next/link";

import {
  InstagramIcon,
  LinkedinIcon,
  YoutubeIcon,
} from "@/components/site/SocialIcons";
import { Container } from "@/components/ui/Container";
import { COURSES } from "@/lib/data/home";

const COMPANY = [
  { label: "About us", href: "#advantage" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Educators", href: "#educators" },
  { label: "Hire from us", href: "#contact" },
  { label: "Contact", href: "#contact" },
];

const RESOURCES = [
  { label: "Free resources", href: "#programs" },
  { label: "Student login", href: "/login" },
  { label: "Verify a certificate", href: "/verify" },
  { label: "Placement report", href: "#" },
];

const SOCIALS = [
  { label: "Instagram", href: "#", Icon: InstagramIcon },
  { label: "YouTube", href: "#", Icon: YoutubeIcon },
  { label: "LinkedIn", href: "#", Icon: LinkedinIcon },
];

export function SiteFooter() {
  return (
    <footer className="bg-night-900 py-12 text-night-300 md:py-16">
      <Container>
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-solid text-white">
                <GraduationCap size={20} aria-hidden />
              </span>
              <span className="text-sm font-extrabold tracking-tight text-white">
                COURSE UNBOX
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-night-400">
              The school of skills. Live, cohort-based marketing programs with real
              projects and placement support.
            </p>

            <ul className="mt-6 flex gap-2">
              {SOCIALS.map(({ label, href, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    aria-label={label}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-night-700 text-night-300 transition-colors hover:border-brand-500 hover:bg-brand-solid hover:text-white"
                  >
                    <Icon size={18} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <FooterColumn
            title="Programs"
            links={COURSES.map((course) => ({
              label: course.title,
              href: `/courses/${course.slug}`,
            }))}
          />
          <FooterColumn title="Company" links={COMPANY} />
          <FooterColumn title="Resources" links={RESOURCES} />
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-night-800 pt-6 text-xs text-night-500 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Course Unbox. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="#" className="hover:text-night-300">
              Privacy policy
            </Link>
            <Link href="#" className="hover:text-night-300">
              Terms of use
            </Link>
            <Link href="#" className="hover:text-night-300">
              Refund policy
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-night-400">
        {title}
      </h2>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-night-300 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
