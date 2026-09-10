/**
 * POST /api/enquiries — store a lead from the public enquiry form.
 *
 * Re-validates with the same rules as the client (never trust the browser) and
 * returns field-level errors the dialog can render inline.
 */
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/db";
import {
  EMPTY_ENQUIRY,
  hasErrors,
  normalisePhone,
  validateEnquiry,
  type EnquiryInput,
} from "@/lib/validation/enquiry";
import { Enquiry } from "@/models/Enquiry";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Expected a JSON body." },
      { status: 400 },
    );
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const input: EnquiryInput = {
    fullName: asString(raw.fullName),
    phone: asString(raw.phone),
    email: asString(raw.email),
    program: asString(raw.program),
  };

  const errors = validateEnquiry({ ...EMPTY_ENQUIRY, ...input });
  if (hasErrors(errors)) {
    return NextResponse.json({ ok: false, errors }, { status: 422 });
  }

  try {
    await connectToDatabase();

    await Enquiry.create({
      fullName: input.fullName.trim(),
      phone: normalisePhone(input.phone),
      email: input.email.trim().toLowerCase(),
      program: input.program,
      source: asString(raw.source) || "unknown",
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    // The driver error names the cluster and user — log it, don't return it.
    console.error("[api/enquiries] failed to save enquiry:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          "We couldn't save your enquiry just now. Please try again, or call us on +91 89236 60886.",
      },
      { status: 503 },
    );
  }
}
