# Changelog

## DayFlow AI Workspace 2.1 — deployment and hackathon readiness

- Added optional Amazon Bedrock Converse API provider with AWS Signature Version 4 signing and temporary credential support for the AWS Builder mini-challenge.
- Added provider configuration and signing tests.
- Added production static frontend serving from Express and configurable SQLite `DB_PATH`.
- Added production HTTP Basic Auth guard, assistant rate limiting, and JSON errors for unknown API routes.
- Added Render and Docker deployment configuration plus a Node 20 CI workflow.
- Added MIT license, AWS Builder integration notes, final handover notes, and an Amazon hackathon submission checklist.
- Explicitly labels the product as an Alexa+-inspired simulated web experience.
- Fixed focus-minute reporting so review/catch-up buffers are not counted as task focus.
- Synchronized root package and lockfile versions at 2.0.0.

## DayFlow AI Workspace 2.0

- Added configurable LLM integration for Ollama and OpenAI-compatible providers.
- Added task-aware structured intent handling and general conversational answers when an LLM is configured.
- Added recent conversation context and browser-persisted chat history.
- Added an API status endpoint and visible AI/local mode indicator.
- Added safe `.env` configuration and provider setup documentation.
- Added a coordinated development launcher that selects a free backend port and points Vite to it.
- Preserved review-before-save task extraction and deterministic, validated scheduling.
