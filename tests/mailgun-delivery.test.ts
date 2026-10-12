import { test } from "node:test";
import assert from "node:assert/strict";

// Imports the REAL email module by path (other tests get the mocked one via
// "@/lib/email/send-email"); the network call is replaced by a fake fetch.
const { sendSignInEmail } = await import("../src/lib/email/send-email.ts");

interface Captured {
  url: string;
  auth: string | null;
  body: URLSearchParams;
}

function withMailgunEnv(fn: () => Promise<void>) {
  const saved = { ...process.env };
  Object.assign(process.env, {
    MAILGUN_SECRET: "test-key",
    MAILGUN_DOMAIN: "mg.falak.sa",
    MAILGUN_ENDPOINT: "api.mailgun.net",
    MAIL_FROM_ADDRESS: "info@falak.sa",
    MAIL_FROM_NAME: '"Angel Space"',
  });
  return fn().finally(() => {
    for (const k of ["MAILGUN_SECRET", "MAILGUN_DOMAIN", "MAILGUN_ENDPOINT", "MAIL_FROM_ADDRESS", "MAIL_FROM_NAME"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

function fakeFetch(status: number, captured: Captured[]) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { headers: Record<string, string>; body: URLSearchParams }) => {
    captured.push({ url: String(url), auth: init.headers.Authorization ?? null, body: init.body });
    return new Response(status === 200 ? '{"message":"Queued"}' : "Forbidden", { status });
  }) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("mailgun: sends through mg.falak.sa as Angel Space <info@falak.sa>, replies to info@falak.sa", async () => {
  const captured: Captured[] = [];
  const restore = fakeFetch(200, captured);
  try {
    await withMailgunEnv(() => sendSignInEmail("founder@example.com", "https://falakinvestments.space/verify?t=x"));
  } finally {
    restore();
  }
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, "https://api.mailgun.net/v3/mg.falak.sa/messages");
  assert.equal(captured[0].auth, `Basic ${Buffer.from("api:test-key").toString("base64")}`);
  assert.equal(captured[0].body.get("from"), "Angel Space <info@falak.sa>");
  assert.equal(captured[0].body.get("h:Reply-To"), "info@falak.sa");
  assert.equal(captured[0].body.get("to"), "founder@example.com");
  assert.match(captured[0].body.get("text") ?? "", /verify\?t=x/);
});

test("mailgun: a rejected send surfaces as an error, never silently", async () => {
  const captured: Captured[] = [];
  const restore = fakeFetch(403, captured);
  try {
    await assert.rejects(
      () => withMailgunEnv(() => sendSignInEmail("founder@example.com", "https://x")),
      /Failed to send sign-in email: Mailgun 403/
    );
  } finally {
    restore();
  }
});
