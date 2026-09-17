import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and run `docker compose up -d db`.");
}

// postgres.js works against both local Docker Postgres and Neon's pooled
// endpoint. Cache the client across HMR reloads so dev doesn't leak connections.
const globalForDb = globalThis as unknown as { __tophSql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.__tophSql ??
  postgres(url, {
    max: process.env.VERCEL ? 1 : 10, // serverless: one connection per lambda
    prepare: false, // required for Neon's pgbouncer (transaction pooling)
  });

if (process.env.NODE_ENV !== "production") globalForDb.__tophSql = sql;

export const db = drizzle(sql, { schema });
export { schema };
