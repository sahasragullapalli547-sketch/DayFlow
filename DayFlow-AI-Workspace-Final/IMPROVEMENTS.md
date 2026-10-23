# DayFlow P0 improvements

This package keeps the original React + Express + SQLite architecture and improves the current P0 rather than claiming a real Alexa+ integration.

## Files replaced or updated

- `server/src/intents.js`
  - Uses local calendar dates for today/tomorrow.
  - Validates ISO dates as real dates.
  - fixes help text line breaks.
  - improves removal of command metadata and duration parsing.
- `server/src/planner.js`
  - handles invalid time budgets safely.
  - returns used and remaining minutes consistently.
  - avoids mutating the original tasks array.
  - makes ordering rules explicit in the response.
- `server/src/db.js`
  - adds a prepared query to retrieve a newly saved plan by ID.
- `server/src/index.js`
  - validates task inputs and task IDs.
  - validates actual calendar dates, not just date formatting.
  - validates completion values and saved plan items.
  - catches errors in assistant and plan routes.
  - marks a plan as saved after persisting and after loading it.
- `client/vite.config.js`
  - proxies `/api` requests to the local backend.
- `client/src/App.jsx`
  - now uses `/api` rather than a hard-coded API host.

## Run

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.

## Manual verification

1. Open `http://localhost:3001/api/health`; expect JSON with `ok: true`.
2. Add `Add task DBMS revision due tomorrow high 90 minutes`.
3. Add `Add task finish Java assignment`.
4. Ask `Show my tasks`.
5. Ask `Make a study plan for 3 hours`.
6. Save the plan.
7. Refresh the browser. The plan should still show as saved, not as a new unsaved proposal.
8. Complete a task, refresh, and verify its completed state persists.
9. Try `Add task test due 2026-02-30`; it should ask for a valid date rather than saving it.
10. Try an unsupported sentence; the app should explain that it does not understand it yet.

## Known limitations

- The intent parser is rule-based, not a large language model.
- This is an Alexa+ simulated web experience, not a live Alexa+ integration.
- There is no authentication, multi-user separation, live calendar integration, reminders, or deployment configuration.
- The plan ordering is a transparent heuristic, not an advanced optimization algorithm.
- Runtime behavior still needs to be verified on the developer's machine after installing dependencies.

## Deployment and hackathon additions (2.1)

- Optional Bedrock provider for AWS Builder; requires real AWS model access and has not been live-tested in this preparation environment.
- Express production static serving, configurable database path, Basic Auth in production, and assistant request rate limiting.
- Docker/Render deployment configuration, CI workflow, MIT license, and competition submission checklist.
- The Alexa+ integration is a simulated web experience, not a live skill or MCP server.
- Full production build and live end-to-end verification remain to be run on a machine where dependencies can be installed.
