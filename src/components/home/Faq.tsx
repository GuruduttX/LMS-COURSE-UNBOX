"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { FAQS } from "@/lib/data/home";
import { collapse } from "@/lib/motion";
import { cn } from "@/lib/cn";

export function Faq() {
  // Single-open accordion: keeps the list scannable instead of a wall of text.
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reduced = useReducedMotion();

  return (
    <section className="border-t border-border bg-surface py-14 md:py-20">
      <Container>
        <SectionHeading eyebrow="Before you apply" title="Common questions" />

        <div className="mt-8 max-w-3xl divide-y divide-border overflow-hidden rounded-xl border border-border">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={faq.q}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${index}`}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between gap-4 bg-surface px-5 py-4 text-left text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-50 md:text-base"
                  >
                    {faq.q}
                    <Plus
                      size={18}
                      aria-hidden
                      className={cn(
                        "shrink-0 text-ink-500 transition-transform duration-200",
                        isOpen && "rotate-45",
                      )}
                    />
                  </button>
                </h3>

                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      id={`faq-panel-${index}`}
                      variants={reduced ? undefined : collapse}
                      initial="hidden"
                      animate="show"
                      exit="hidden"
                      className="overflow-hidden bg-surface"
                    >
                      <p className="px-5 pb-5 text-sm leading-relaxed text-ink-600">
                        {faq.a}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
