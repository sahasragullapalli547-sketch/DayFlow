# DayFlow — AI Productivity Workspace

DayFlow is a local-first productivity workspace with a React/Vite frontend, Express API, SQLite storage, a deterministic schedule engine, and an optional LLM provider for natural-language understanding and general conversation.

## What it includes

- A polished responsive dashboard with task filters, animated micro-interactions, status indicators, and chat history retained in the browser.
- Task create, edit, complete/reopen, delete, deadline, duration, and priority controls.
- Review-before-save bulk task extraction from longer prompts.
- A timed scheduler with start/end clock times, breaks, a configurable final review buffer, priority/deadline ordering, and explicit unscheduled-task reporting.
- A task-aware LLM adapter supporting Ollama locally, OpenAI-compatible providers (including OpenAI and OpenRouter), and optional Amazon Bedrock using AWS Signature Version 4 with Node's built-in crypto (AWS Builder mini-challenge integration).
- Alexa+ simulated web-assistant experience for the primary hackathon track; this is explicitly a simulation, not a live Alexa+ integration.
- Production serving of the built React app from Express, optional HTTP Basic Auth for a public demo, and an assistant request rate limit.
- Server-side validation for task writes, schedule inputs, and saved schedule blocks.
- A dev launcher that starts the API first, discovers a free API port if 3001 is occupied, and points Vite at the correct port automatically.
- Automated tests for bulk extraction and schedule arithmetic.

## Requirements

- Node.js 18.17+ (Node 20 LTS recommended)
- npm
- For AI features: either Ollama with a downloaded model, or an API key for an OpenAI-compatible provider.

## Install and run on Windows

1. Extract this ZIP to a new folder.
2. Open that folder in VS Code.
3. Open a terminal at the folder containing the root `package.json`.
4. Install dependencies:

   ```powershell
   npm install
   ```

5. Run automated tests:

   ```powershell
   npm test
   ```

6. Start DayFlow:

   ```powershell
   npm run dev
   ```

   The dev launcher starts the backend first, automatically tries ports 3001–3010 if the default API port is busy, and then starts Vite with the correct API target. Open the **Local** URL printed by Vite (often `http://localhost:5173/` or `http://localhost:5174/`). Keep the terminal open while using DayFlow. Press `Ctrl+C` in that terminal to stop both processes.

7. To make a production frontend build:

   ```powershell
   npm run build
   ```

8. To run the production app locally after building, configure `APP_USERNAME` and `APP_PASSWORD` in `.env`, set `NODE_ENV=production`, then run `npm start`. The server serves both the API and `client/dist` on the same port. Production mode intentionally refuses to start without both credentials.

## Enable actual LLM understanding

Without an LLM configured, DayFlow remains usable in local compatibility mode for its supported commands and deterministic planner. It cannot reliably answer arbitrary questions or understand every typo in this mode. For flexible language understanding, configure one of the following options.

### Option A: Ollama (local model, no per-request API fee)

1. Install Ollama from its official website and start it.
2. In a separate terminal, download a model. For example:

   ```powershell
   ollama pull qwen2.5:3b
   ```

   Model availability and hardware requirements vary; smaller models can run on less powerful machines.

3. In the DayFlow project folder, create `.env` from the template:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Open `.env` and set:

   ```dotenv
   LLM_PROVIDER=ollama
   LLM_BASE_URL=http://127.0.0.1:11434
   LLM_MODEL=qwen2.5:3b
   ```

5. Stop and restart DayFlow with `npm run dev`.

The local model receives the user's recent chat and current DayFlow task list. Model quality and speed depend on the chosen model and hardware.

### Option B: OpenAI API or an OpenAI-compatible provider

1. Create an API key with the provider you choose. API usage may cost money.
2. Copy `.env.example` to `.env` and set the provider details, for example:

   ```dotenv
   LLM_PROVIDER=openai-compatible
   LLM_BASE_URL=https://api.openai.com/v1
   LLM_API_KEY=put-your-own-key-here
   LLM_MODEL=gpt-4o-mini
   ```

3. Restart DayFlow.

Never paste your API key into chat or commit `.env` to Git. `.env` is ignored by `.gitignore`. DayFlow sends the user's prompt and recent conversation/task context to the provider you configure; use a local Ollama model if you do not want that context sent to a third-party AI API.

### Option C: OpenRouter (can route to different model families)

Configure `.env` with `LLM_PROVIDER=openrouter`, `LLM_BASE_URL=https://openrouter.ai/api/v1`, your own `LLM_API_KEY`, and a model identifier available to your account. Provider model names and pricing can change.

### Option D: Amazon Bedrock (AWS Builder mini challenge)

DayFlow includes an optional native Amazon Bedrock Converse API integration. It uses AWS Signature Version 4 signing with Node's built-in `crypto`, so it does not add an AWS SDK dependency. You must have an AWS account, enable access to a supported Bedrock model in your region, and configure credentials with least privilege. AWS usage may incur charges.

Set these values in `.env` (or the deployment platform's secret settings):

```dotenv
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
# Optional when using temporary credentials:
# AWS_SESSION_TOKEN=your-session-token
LLM_MODEL=amazon.nova-lite-v1:0
```

Restart the server and check `/api/status`. The status endpoint only verifies that the required configuration values exist; make a real assistant request to verify IAM permissions, model access, region, and network connectivity. Never commit credentials. Use a dedicated IAM principal and the minimum Bedrock permissions needed for inference. See `AWS-BUILDER.md` for the documented integration and feedback checklist.

## How to test

1. Open DayFlow and check the top-right AI status. `AI connected` means the server has provider configuration; it does not guarantee the model endpoint is reachable until a request succeeds.
2. Ask a normal question, including a typo or informal phrasing, to test general chat.
3. Try a follow-up referring to the previous answer; recent chat history is passed to the model.
4. Describe several tasks in a paragraph and ask for a plan. Review extracted tasks before confirming.
5. Confirm the tasks, then inspect the proposed schedule and unscheduled-task warnings.
6. Edit, complete, delete, and refresh the page to confirm persistence.
7. Check `http://localhost:<API_PORT>/api/status` if you need the backend AI configuration status. The API port is printed when the server starts.

## Important behavior and limitations

- The LLM interprets user intent and suggests structured actions; the server validates task fields and schedule options before writes. Multi-task imports require review and confirmation.
- Schedule placement is deterministic and explainable; the model does not get to invent clock blocks or bypass schedule validation.
- A task's due date/time is stored, but the current planner's prioritization is a heuristic. It is not a formal constraint solver and may not guarantee all fixed appointments or meal windows. Always review warnings.
- Alexa+ is simulated in this web application; it is not a live Alexa+ Agent Skill or MCP integration. The Amazon hackathon materials explicitly permit this simulated-experience path for Alexa+.
- The application does not currently include web search, calendar sync, email access, live Alexa+ voice, cloud sync, or multi-user accounts. General answers depend on the model you configure and its own knowledge/tools; do not assume it has live internet access.
- The local SQLite database defaults to `server/dayflow.db`. Set `DB_PATH` to a persistent writable path in deployment, and back up the database before replacing source files or running cleanup tools.
- Public deployment requires `APP_USERNAME` and `APP_PASSWORD` (HTTP Basic Auth). This is suitable for a controlled hackathon demo, not a substitute for a full account system. Keep the service behind HTTPS and use a strong random password. A persistent disk is required to retain SQLite data across deploys/restarts.

## Troubleshooting

- **Port 5173 is occupied:** Vite automatically chooses another port; open the exact URL it prints.
- **Port 3001 is occupied:** the dev launcher asks the server to try the next available port and configures Vite to proxy to it.
- **The AI badge says local mode:** copy `.env.example` to `.env`, configure Ollama or an API provider, then restart the server.
- **AI request fails:** check the server terminal, confirm the model name/base URL/API key, and verify Ollama is running if selected. For Bedrock, check AWS region, IAM permissions, model access, and temporary-session expiry.
- **Production server exits immediately:** set both `APP_USERNAME` and `APP_PASSWORD` in the deployment environment; production intentionally fails closed without them.
- **Tasks do not persist after deployment:** set `DB_PATH` to a path on the platform's persistent disk, not an ephemeral filesystem.
- **Tasks disappear:** confirm you're opening the same project folder and database (`server/dayflow.db`). Do not delete that file when updating the source.
- **Dependencies fail to install:** use Node.js 20 LTS and rerun `npm install` from the root folder.

## Scripts

- `npm run dev` — coordinated frontend/backend development server
- `npm test` — automated tests
- `npm run build` — production frontend build
- `npm start` — starts the API server
- `npm run cleanup:atlas -- --delete` — Atlas cleanup utility; read its dry-run behavior before using destructive options
