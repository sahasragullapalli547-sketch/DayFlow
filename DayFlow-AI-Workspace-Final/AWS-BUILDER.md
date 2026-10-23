# AWS Builder mini-challenge integration — DayFlow

## What is integrated

DayFlow can call **Amazon Bedrock Runtime's Converse API** as its language-model provider. The integration is in `server/src/llm.js` and is selected with `LLM_PROVIDER=bedrock`. It sends the user's current message, a bounded recent conversation history, and the task context needed to interpret a productivity request. The server validates the model's structured action and task fields before performing database writes.

The integration signs HTTPS requests with AWS Signature Version 4 using Node's built-in `node:crypto`; it adds no external SDK dependency. Temporary credentials are supported through `AWS_SESSION_TOKEN`.

## Configuration

```dotenv
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Optional for temporary credentials
AWS_SESSION_TOKEN=...
LLM_MODEL=amazon.nova-lite-v1:0
```

Before testing, enable access to the selected model in the configured AWS account and region. Use credentials with the minimum Bedrock inference permissions needed. Never commit credentials or put them in frontend code. Bedrock calls may incur AWS charges.

## Verification steps

1. Start DayFlow with the environment configured.
2. Open `/api/status` and verify that the provider reports configured. This is a configuration check, not proof of successful inference.
3. Send a general assistant prompt and a task-creation prompt from the UI.
4. Confirm the assistant responds, the task preview can be reviewed, and mutations only occur after the app's existing validation/confirmation flow.
5. Test with invalid credentials and confirm the app reports a provider failure and falls back to local command parsing where possible.
6. Record the AWS region, model ID, what was tested, any latency or permission friction, and the observed result in the submission's product-feedback response.

## Hackathon transparency

This integration is optional and is **not verified against a live AWS account in this repository environment**. Do not claim a successful live Bedrock call in a submission/demo until the steps above pass using your own AWS account. The Alexa+ experience remains a simulated web experience, as permitted by the supplied hackathon brief; it is not a live Alexa+ skill or MCP server.

## Product feedback template for submission

- **Service used:** Amazon Bedrock Runtime Converse API.
- **Purpose:** Semantic intent interpretation and natural-language task planning in DayFlow.
- **What worked:** Fill in only after running a real inference; mention structured responses and server-side validation if observed.
- **What needs improvement:** Record actual onboarding, model-access, IAM, latency, error-message, or documentation friction encountered.
- **Would build again:** Answer based on your experience after testing.
