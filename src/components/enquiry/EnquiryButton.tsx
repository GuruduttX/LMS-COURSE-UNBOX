"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { useEnquiry } from "./EnquiryProvider";

/**
 * Opens the enquiry dialog. Lets server components (Hero, CtaBand) trigger it
 * without becoming client components themselves.
 */
export function EnquiryButton({
  source,
  children,
  ...props
}: { source: string; children: ReactNode } & Omit<
  ComponentProps<typeof Button>,
  "onClick"
>) {
  const { open } = useEnquiry();

  return (
    <Button onClick={() => open(source)} {...props}>
      {children}
    </Button>
  );
}
