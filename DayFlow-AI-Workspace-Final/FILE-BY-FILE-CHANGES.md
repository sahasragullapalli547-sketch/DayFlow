# DayFlow AI Workspace — File-by-file guide

## New files

- `server/src/llm.js` — Provider adapter for Ollama and OpenAI-compatible APIs; sends recent chat and current tasks as context; requests structured JSON actions; applies a request timeout.
- `server/src/env.js` — Minimal `.env` loader for Node 18, so no extra environment dependency is required.
- `scripts/dev.js` — Starts the API first, waits for the selected API port, then starts Vite with the matching proxy target. Stops both children on exit.
- `.env.example` — Safe template for local Ollama or API-provider configuration. Copy it to `.env`; never commit API keys.
- `server/test/llm.test.js` — Tests provider status and required configuration.

## Updated files

- `server/src/index.js` — Adds `/api/status`; attempts semantic LLM interpretation before the rule-based fallback; validates every model-suggested task; adds task-aware actions for list/count/create/update/complete/delete and proposed schedules; retries the API on ports 3001–3010.
- `client/src/App.jsx` — Sends recent chat history with messages, retains the recent conversation in browser local storage, displays whether AI is configured, and uses more natural example prompts.
- `client/src/styles.css` — Adds small transitions, better chat readability, focus styling, status colors, and respects reduced-motion preferences.
- `client/vite.config.js` — Uses the backend port chosen by the dev launcher.
- `package.json` — Uses the coordinated dev launcher and identifies the workspace as DayFlow AI Workspace.
- `package-lock.json` — Updated root package name.
- `client/index.html` — Updated title, theme color, and description.
- `README.md` — Full setup, provider configuration, privacy notes, testing, limitations, and troubleshooting.

## Design choices

- The model interprets natural language and proposes structured actions; the server validates and executes them. The model cannot bypass duration, date, priority, or schedule validation.
- Multi-task prompts are shown in a review panel before being saved. Schedule proposals remain unsaved until the user confirms them.
- SQLite remains local in `server/dayflow.db`. The archive deliberately excludes that database so an update doesn't overwrite personal task data.
- No API key is bundled. The app runs in local compatibility mode until an LLM is configured.
