"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { EnquiryDialog } from "./EnquiryDialog";

type EnquiryContextValue = {
  /** `source` records which CTA opened the form; it is stored with the lead. */
  open: (source?: string) => void;
  close: () => void;
  isOpen: boolean;
};

const EnquiryContext = createContext<EnquiryContextValue | null>(null);

export function useEnquiry(): EnquiryContextValue {
  const context = useContext(EnquiryContext);
  if (!context) {
    throw new Error("useEnquiry must be used inside <EnquiryProvider>.");
  }
  return context;
}

export function EnquiryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState("unknown");

  const open = useCallback((from = "unknown") => {
    setSource(from);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ open, close, isOpen }),
    [open, close, isOpen],
  );

  return (
    <EnquiryContext.Provider value={value}>
      {children}
      <EnquiryDialog isOpen={isOpen} onClose={close} source={source} />
    </EnquiryContext.Provider>
  );
}
