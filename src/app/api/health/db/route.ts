/**
 * Database health check — GET /api/health/db
 *
 * Confirms the Atlas connection string works and the cluster is reachable.
 * Errors are logged in full server-side but never returned to the client:
 * a Mongo connection error contains the username and host.
 */
import { NextResponse } from "next/server";

import { connectToDatabase, connectionState, mongoose } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectToDatabase();
    await mongoose.connection.db?.admin().command({ ping: 1 });

    return NextResponse.json({
      ok: true,
      state: connectionState(),
      database: mongoose.connection.name,
    });
  } catch (error) {
    console.error("[health/db] connection failed:", error);

    return NextResponse.json(
      { ok: false, state: connectionState(), error: "Database connection failed" },
      { status: 503 },
    );
  }
}
