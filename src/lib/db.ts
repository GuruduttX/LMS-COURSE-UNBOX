/**
 * MongoDB Atlas connection (Mongoose).
 *
 * Next.js hot-reloads modules in dev and runs many serverless invocations in
 * prod, so a naive `mongoose.connect()` at module scope opens a new pool every
 * time and exhausts the Atlas connection limit. We cache the connection — and
 * the in-flight promise — on `globalThis` so every caller shares one pool.
 *
 * Usage (server components, route handlers, server actions only):
 *
 *   import { connectToDatabase } from "@/lib/db";
 *   await connectToDatabase();
 *   const courses = await Course.find().lean();
 */
import "server-only";
import mongoose, { type Mongoose } from "mongoose";

import { env } from "./env";

type MongooseCache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};

const cache: MongooseCache = (globalForMongoose._mongooseCache ??= {
  conn: null,
  promise: null,
});

// Fail fast on bad queries instead of silently writing unknown fields.
mongoose.set("strictQuery", true);

export async function connectToDatabase(): Promise<Mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(env.MONGODB_URI, {
        dbName: env.MONGODB_DB,
        // Don't queue operations forever when the cluster is unreachable —
        // surface the error to the request instead.
        bufferCommands: false,
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 10,
      })
      .catch((error: unknown) => {
        // Clear the cached promise so the next request retries rather than
        // re-awaiting a permanently rejected promise.
        cache.promise = null;
        throw error;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

const READY_STATES: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
  99: "uninitialized",
};

/** Human-readable state, for the health check and debugging. */
export function connectionState(): string {
  return READY_STATES[mongoose.connection.readyState] ?? "unknown";
}

export { mongoose };
