# Start DayFlow on Windows

## 1. Install and launch

1. Extract the ZIP into a new folder, for example `C:\Users\gulla\Downloads\DayFlow-AI-Workspace`.
2. Open that folder in VS Code. Make sure the root `package.json` is visible in Explorer.
3. Open **Terminal → New Terminal**.
4. Run these commands one at a time:

   ```powershell
   npm install
   npm test
   npm run dev
   ```

5. Wait for Vite to print a `Local:` URL, then open that exact URL in Chrome. It may use port 5173, 5174, or another available port.
6. Leave the terminal open while using the website. Press `Ctrl+C` in that terminal to stop DayFlow.

The development launcher starts the backend before the frontend, selects a free API port if port 3001 is occupied, and configures Vite to use that port. You should not need to kill an old Node process manually.

## 2. Turn on actual AI

The website works in local compatibility mode without an LLM, but general questions and typo-tolerant interpretation need a model.

### Free local model with Ollama

1. Install Ollama and start it.
2. In a separate terminal, run `ollama pull qwen2.5:3b` (or choose another model supported by your machine).
3. In the DayFlow root folder, run:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Edit `.env` so these lines are active (remove `#` before them):

   ```dotenv
   LLM_PROVIDER=ollama
   LLM_BASE_URL=http://127.0.0.1:11434
   LLM_MODEL=qwen2.5:3b
   ```

5. Save `.env`, stop DayFlow with `Ctrl+C`, and restart using `npm run dev`.
6. Check the top-right badge. It should say `AI configured · qwen2.5:3b`. Try an ordinary question and a long prompt with multiple tasks.

### Hosted AI provider

If you have an API key, configure `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` in `.env` as described in `README.md`. Hosted API use may cost money and sends the conversation/task context to that provider. Do not put the key in the chat or commit `.env`.

## 3. Run the feature tests

- Ask a general question in your own words.
- Ask a follow-up that refers to the previous answer.
- Describe multiple tasks in an unnumbered paragraph and ask for a schedule.
- Review the extracted tasks and confirm them.
- Inspect the schedule proposal, edit a task, complete a task, and delete a test task.
- Refresh the page and verify saved tasks remain.

If something fails, copy the full terminal error and the exact DayFlow response. The AI status badge only confirms that configuration values exist; the provider must also be running and reachable.
