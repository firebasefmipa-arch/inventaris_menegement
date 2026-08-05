import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __nextJsMysqlPool?: mysql.Pool;
};

export const pool =
  globalForDb.__nextJsMysqlPool ??
  mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__nextJsMysqlPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
