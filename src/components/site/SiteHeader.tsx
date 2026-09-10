"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, GraduationCap, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useEnquiry } from "@/components/enquiry/EnquiryProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { COURSES } from "@/lib/data/home";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/cn";

const NAV = [
  { label: "About", href: "#advantage" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Educators", href: "#educators" },
  { label: "Contact", href: "#contact" },
];

/** `theme` is read on the server by the page and passed down — see app/page.tsx. */
export function SiteHeader({ theme }: { theme: Theme }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [programsOpen, setProgramsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const programsRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { open } = useEnquiry();

  // Header gains elevation only once the page has moved. design.md §4.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!programsOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!programsRef.current?.contains(event.target as Node)) {
        setProgramsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProgramsOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [programsOpen]);

  // Don't leave the page scrollable behind the mobile panel.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 bg-surface/95 backdrop-blur transition-shadow duration-200",
        scrolled ? "shadow-md" : "border-b border-border",
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            <div ref={programsRef} className="relative">
              <button
                type="button"
                aria-expanded={programsOpen}
                aria-haspopup="true"
                onClick={() => setProgramsOpen((open) => !open)}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                Programs
                <ChevronDown
                  size={16}
                  className={cn(
                    "transition-transform duration-200",
                    programsOpen && "rotate-180",
                  )}
                />
              </button>

              <AnimatePresence>
                {programsOpen ? (
                  <motion.div
                    initial={reduced ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full mt-2 w-80 rounded-2xl border border-border bg-surface p-2 shadow-lg"
                  >
                    {COURSES.map((course) => (
                      <Link
                        key={course.slug}
                        href={`/courses/${course.slug}`}
                        onClick={() => setProgramsOpen(false)}
                        className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-brand-50"
                      >
                        <span className="block text-sm font-semibold text-ink-900">
                          {course.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-500">
                          {course.durationWeeks} weeks · {course.modules} modules
                        </span>
                      </Link>
                    ))}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <ThemeToggle value={theme} />
            <ButtonLink href="/login" variant="ghost">
              Log in
            </ButtonLink>
            <Button onClick={() => open("header")}>Apply now</Button>
          </div>

          {/*
            Log in sits outside the menu on mobile, not just inside it: signing
            in is the one thing a returning visitor came for, and it should
            never cost them a tap on a hamburger to find. The panel keeps its
            own copy for anyone who opens it. `shrink-0` so the logo's second
            line gives way first on a narrow phone, rather than this.
          */}
          <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
            <ButtonLink href="/login" variant="secondary" size="sm">
              Log in
            </ButtonLink>

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-ink-100"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </Container>

      <AnimatePresence>
        {mobileOpen ? (
          <MobileMenu
            onClose={() => setMobileOpen(false)}
            onApply={() => {
              setMobileOpen(false);
              open("header-mobile");
            }}
            reduced={!!reduced}
            theme={theme}
          />
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function Logo() {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-2.5 rounded-lg"
      aria-label="Course Unbox home"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-solid text-white">
        <GraduationCap size={20} />
      </span>
      {/* The tagline truncates rather than wrapping: on a 320px phone the bar
          also carries Log in and the menu button, and the strapline is the one
          thing here that can afford to give way. */}
      <span className="min-w-0 leading-tight">
        <span className="block whitespace-nowrap text-sm font-extrabold tracking-tight text-ink-900">
          COURSE <span className="text-brand-600">UNBOX</span>
        </span>
        <span className="block truncate text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">
          The School of Skills
        </span>
      </span>
    </Link>
  );
}

function MobileMenu({
  onClose,
  onApply,
  reduced,
  theme,
}: {
  onClose: () => void;
  onApply: () => void;
  reduced: boolean;
  theme: Theme;
}) {
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? undefined : { opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex flex-col bg-surface lg:hidden"
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle value={theme} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      {/*
        The links scroll; the two actions below do not. They used to be the last
        children of this nav, pushed down with `mt-auto` — which does nothing
        once the programs and section links overflow, so Log in and Apply now
        sat below the fold and the open menu appeared to offer nothing but the
        theme toggle. `min-h-0` is what lets this shrink inside the flex column
        instead of growing and pushing the actions off-screen again.
      */}
      <nav
        aria-label="Mobile"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
      >
        <p className="px-3 pb-2 pt-1 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">
          Programs
        </p>
        {COURSES.map((course) => (
          <Link
            key={course.slug}
            href={`/courses/${course.slug}`}
            onClick={onClose}
            className="rounded-lg px-3 py-3 text-base font-semibold text-ink-900 hover:bg-brand-50"
          >
            {course.title}
          </Link>
        ))}

        <div className="my-3 h-px bg-border" />

        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="rounded-lg px-3 py-3 text-base font-medium text-ink-700 hover:bg-ink-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={onApply}>
            Apply now
          </Button>
          <ButtonLink
            href="/login"
            size="lg"
            variant="secondary"
            onClick={onClose}
          >
            Log in
          </ButtonLink>
        </div>
      </div>
    </motion.div>
  );
}
