import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import pg from "pg";
const url = process.env.DATABASE_URL;
let db;
if (url) db = new pg.Pool({ connectionString: url });
else {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.resolve(
    process.env.DATA_DIR || path.join(os.homedir(), ".chorusroom", "data"),
  );
  await fs.mkdir(dir, { recursive: true });
  db = new PGlite(dir);
}
export async function transaction(fn) {
  if (!url) return db.transaction(fn);
  const conn = await db.connect();
  try {
    await conn.query("BEGIN");
    const result = await fn(conn);
    await conn.query("COMMIT");
    return result;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}
export const rows = async (sql, params = []) =>
  (await db.query(sql, params)).rows;
export const one = async (...args) => (await rows(...args))[0];
await transaction(async (conn) => {
  if (url) await conn.query("SELECT pg_advisory_xact_lock(584230)");
  const sql = await fs.readFile(
    new URL("../migrations/001.sql", import.meta.url),
    "utf8",
  );
  for (const statement of sql.split(";").filter((x) => x.trim()))
    await conn.query(statement);
});
