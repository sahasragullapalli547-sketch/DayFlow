import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env.js";

loadEnv();
const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(here, "..", "dayflow.db");
const db = new Database(databasePath);

db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    due_date TEXT,
    due_time TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    priority TEXT NOT NULL DEFAULT 'medium',
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    total_minutes INTEGER NOT NULL,
    plan_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrate databases created by earlier DayFlow versions.
try {
  db.exec("ALTER TABLE tasks ADD COLUMN due_time TEXT");
} catch (error) {
  if (!String(error.message).includes("duplicate column name")) throw error;
}

export const queries = {
  listTasks: db.prepare("SELECT * FROM tasks ORDER BY completed ASC, due_date IS NULL, due_date ASC, id ASC"),
  getTask: db.prepare("SELECT * FROM tasks WHERE id = ?"),
  insertTask: db.prepare(`
    INSERT INTO tasks (title, due_date, due_time, duration_minutes, priority)
    VALUES (@title, @due_date, @due_time, @duration_minutes, @priority)
  `),
  updateTask: db.prepare("UPDATE tasks SET completed = ? WHERE id = ?"),
  editTask: db.prepare(`
    UPDATE tasks
    SET title = @title, due_date = @due_date, due_time = @due_time, duration_minutes = @duration_minutes, priority = @priority
    WHERE id = @id
  `),
  deleteTask: db.prepare("DELETE FROM tasks WHERE id = ?"),
  insertPlan: db.prepare("INSERT INTO plans (title, total_minutes, plan_json) VALUES (?, ?, ?)"),
  getPlan: db.prepare("SELECT * FROM plans WHERE id = ?"),
  latestPlan: db.prepare("SELECT * FROM plans ORDER BY id DESC LIMIT 1")
};

export { db };

