/**
 * Safe, opt-in legacy-context cleanup for the local DayFlow SQLite database.
 * Default mode is a dry run. To delete rows containing the word "Atlas" from
 * text columns, run: npm run cleanup:atlas -- --delete
 * Back up server/dayflow.db before using --delete. This only affects this DB;
 * it cannot clean external Cognee/Atlas/vector databases.
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(here, "..", "dayflow.db"));
const deleting = process.argv.includes("--delete");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
let totalMatches = 0;

for (const { name: table } of tables) {
  const safeTable = `"${table.replaceAll('"', '""')}"`;
  const columns = db.prepare(`PRAGMA table_info(${safeTable})`).all();
  const textColumns = columns.filter((column) => /TEXT|CHAR|CLOB/i.test(column.type || ""));
  if (!textColumns.length || !columns.some((column) => column.pk)) continue;
  const primaryKey = columns.find((column) => column.pk);
  const where = textColumns.map((column) => `CAST("${column.name.replaceAll('"', '""')}" AS TEXT) LIKE ?`).join(" OR ");
  const params = textColumns.map(() => "%atlas%");
  const rows = db.prepare(`SELECT "${primaryKey.name.replaceAll('"', '""')}" AS row_id FROM ${safeTable} WHERE ${where}`).all(...params);
  if (!rows.length) continue;
  totalMatches += rows.length;
  console.log(`${deleting ? "MATCHED" : "DRY RUN"}: ${table} — ${rows.length} row(s) containing Atlas`);
  if (deleting) {
    const deleteRows = db.prepare(`DELETE FROM ${safeTable} WHERE ${where}`);
    const result = deleteRows.run(...params);
    console.log(`  Deleted ${result.changes} row(s) from ${table}`);
  } else {
    console.log(`  Matching row IDs: ${rows.map((row) => row.row_id).join(", ")}`);
  }
}

if (totalMatches === 0) console.log("No Atlas-containing rows found in the DayFlow SQLite database.");
else if (!deleting) console.log(`Dry run complete: ${totalMatches} row(s) matched. Back up the DB, review the result, then rerun with --delete to remove them.`);
else console.log(`Cleanup complete: ${totalMatches} matching row(s) were targeted.`);
db.close();
