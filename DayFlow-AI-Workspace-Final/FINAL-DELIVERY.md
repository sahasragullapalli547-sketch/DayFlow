# DayFlow final handover

## Implemented in this delivery

- Alexa+-inspired simulated web-assistant framing in the UI and submission documentation.
- Existing task CRUD, task-aware assistant, review-before-save bulk task extraction, schedule proposals, plan saving, and SQLite persistence retained.
- Ollama default configuration uses the supplied local model settings (`http://127.0.0.1:11434`, `qwen2.5:3b`, 30-second timeout); the real `.env` is intentionally not included in the archive.
- Optional Amazon Bedrock Converse API integration, including AWS SigV4 request signing and temporary session token support, to support the AWS Builder mini-challenge after live verification.
- Production server serves the compiled frontend from Express.
- Optional HTTP Basic Auth, required in production mode, plus an assistant request rate limit.
- Configurable database path for persistent deployment storage.
- Docker and Render deployment configuration, CI workflow, MIT license, and competition submission checklist.
- Corrected root package/lockfile version mismatch and fixed task-focus totals so catch-up buffers are not reported as actual task focus.

## Run locally on Windows

1. Install Node.js 20 LTS and Ollama.
2. Extract the archive and open its root folder in VS Code.
3. In PowerShell:

   ```powershell
   Copy-Item .env.example .env
   npm ci
   npm test
   npm run dev
   ```

4. Open the exact Vite URL printed in the terminal.
5. Download the configured local model once if needed:

   ```powershell
   ollama pull qwen2.5:3b
   ```

## Production deployment

- Render: use `render.yaml`, set strong `APP_USERNAME` and `APP_PASSWORD` values when prompted, and keep the persistent disk enabled. Set `LLM_PROVIDER=bedrock` plus AWS credentials/model configuration only if you want the AWS mini-challenge integration enabled. Otherwise, the app remains in local compatibility mode on the hosted service.
- Docker: build with `docker build -t dayflow .`, then run with a persistent `/data` mount and the required `APP_USERNAME` and `APP_PASSWORD` environment variables. Configure an LLM provider separately if desired.
- Never commit `.env`, AWS credentials, or any real secret. Use HTTPS for public hosting.

## Verification status in the preparation environment

- Automated tests: 15 passed.
- JavaScript source syntax checks: passed.
- React JSX syntax parsing: passed using the installed TypeScript parser.
- Package and lockfile root versions: aligned at 2.0.0.
- Production frontend build and full live-server/browser test: **not verified here** because dependency installation timed out and Vite/React/Express/SQLite packages were not available in the preparation environment. Run `npm ci`, `npm test`, and `npm run build` on a network-enabled machine before claiming a successful production build.
- Amazon Bedrock live inference: **not verified**; an AWS account, model access, IAM permissions, region, and credentials are required.

## Hackathon submission still requires human actions

The code package does not create or submit your GitHub repository, Devpost entry, reviewer invitations, product feedback, or public demo video. Complete the checklist in `SUBMISSION-CHECKLIST.md`; do not claim live AWS integration until it has been demonstrated.
