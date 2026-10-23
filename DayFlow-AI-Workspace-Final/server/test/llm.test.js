import test from "node:test";
import assert from "node:assert/strict";
import { getLLMStatus, signBedrockRequest } from "../src/llm.js";

const keys = ["LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"];
function withEnv(values, callback) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  try { callback(); }
  finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("reports local compatibility mode when no provider is configured", () => {
  withEnv({}, () => {
    const status = getLLMStatus();
    assert.equal(status.configured, false);
    assert.equal(status.mode, "fallback");
  });
});

test("reports Ollama as configured when a model is supplied", () => {
  withEnv({ LLM_PROVIDER: "ollama", LLM_MODEL: "qwen2.5:7b" }, () => {
    const status = getLLMStatus();
    assert.equal(status.configured, true);
    assert.equal(status.provider, "ollama");
  });
});

test("requires both a key and model for OpenAI-compatible providers", () => {
  withEnv({ LLM_PROVIDER: "openai-compatible", LLM_MODEL: "example-model" }, () => {
    assert.equal(getLLMStatus().configured, false);
  });
  withEnv({ LLM_PROVIDER: "openai-compatible", LLM_MODEL: "example-model", LLM_API_KEY: "test-key" }, () => {
    assert.equal(getLLMStatus().configured, true);
  });
});


test("requires region, credentials, and model for Amazon Bedrock", () => {
  withEnv({ LLM_PROVIDER: "bedrock", LLM_MODEL: "amazon.nova-lite-v1:0" }, () => {
    assert.equal(getLLMStatus().configured, false);
  });
  withEnv({ LLM_PROVIDER: "bedrock", LLM_MODEL: "amazon.nova-lite-v1:0", AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test-access", AWS_SECRET_ACCESS_KEY: "test-secret" }, () => {
    assert.equal(getLLMStatus().configured, true);
    assert.equal(getLLMStatus().provider, "bedrock");
  });
});


test("signs Bedrock requests with required SigV4 headers", () => {
  const headers = signBedrockRequest({
    url: new URL("https://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.nova-lite-v1%3A0/converse"),
    body: "{}", region: "us-east-1", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret-example",
    now: new Date("2026-10-23T12:00:00.000Z")
  });
  assert.match(headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
  assert.equal(headers["x-amz-date"], "20261023T120000Z");
  assert.equal(headers["x-amz-content-sha256"].length, 64);
  assert.ok(headers["content-type"].includes("application/json"));
});
