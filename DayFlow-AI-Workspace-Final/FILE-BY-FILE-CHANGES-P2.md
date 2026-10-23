# DayFlow P2 — Bulk prompt task extraction

## What changed

- `server/src/batchTasks.js` — new deterministic extractor for numbered task lists, including duration, priority, date and clock deadline metadata. It only creates a preview; it does not write to the database.
- `server/src/index.js` — detects multi-task planning prompts and returns a preview; adds `POST /api/tasks/batch` to validate and save a reviewed batch atomically; adds task-count intent handling.
- `server/src/db.js` — adds a `due_time` column and safely migrates existing SQLite databases; insert/edit queries persist deadline time.
- `server/src/intents.js` — supports questions such as “How many pending tasks do I have?”
- `server/src/planner.js` — considers a task's due time as a secondary ordering signal when priorities and dates tie.
- `client/src/App.jsx` — displays an editable batch-review panel with title, duration, priority, due date, and deadline time; users must confirm before tasks are saved.
- `client/src/styles.css` — styles the batch-review panel.
- `server/test/batchTasks.test.js` — tests multi-task extraction and exclusion of non-batch requests.

## How to test

1. Install dependencies from the project root with `npm install`.
2. Run `npm test`.
3. Run `npm run dev` and open the Vite URL printed in the terminal.
4. Paste a numbered planning prompt with multiple task headings and metadata lines.
5. Inspect the **Review extracted tasks** panel. Edit any incorrect field.
6. Choose **Cancel import** and confirm the task list does not change, then repeat and choose **Confirm & add**.
7. Refresh the browser and verify the imported tasks and deadline times persist.

## Current limitations

- Extraction is deterministic and works best with numbered headings plus explicit metadata lines. It is not an LLM and may not parse every free-form paragraph. When it recognizes a start and end time, confirming the task batch also generates an unsaved schedule proposal.
- Breaks/lunch are not imported as tasks; they are identified as constraints. The existing scheduler does not yet enforce a lunch window or arbitrary deadline feasibility. Lunch and refresh-break windows are detected but not enforced as fixed-time blocks.
- The planner orders tasks using priority and deadline metadata, supports a requested final review block, and reports tasks that cannot fit. It does not yet guarantee every clock deadline.
