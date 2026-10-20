// Run with: npm test  (Node 22+ strips TypeScript types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, isAllowedOrigin, MIN_FILL_MS, parseInquiry } from "../lib/inquiry.ts";

const NOW = 1_800_000_000_000;
const valid = {
  name: "  Ana   López ",
  email: " Ana@Example.COM ",
  phone: "+52 (55) 1234-5678",
  company: "Taquería Ana",
  service: "Sitio Web",
  budget: "10k_30k",
  message: "Necesito un sitio web para mi restaurante",
  consent: true,
  website: "",
  startedAt: NOW - 10_000,
  attribution: { utm_source: "google", utm_medium: "cpc", evil: "x", referrer: "https://www.google.com/search?q=ana%40example.com" },
};

test("accepts and normalizes a complete inquiry", () => {
  const result = parseInquiry(valid, NOW);
  assert.equal(result.kind, "valid");
  assert.equal(result.data.name, "Ana López");
  assert.equal(result.data.email, "ana@example.com");
  assert.equal(result.data.serviceInterest, "Sitio Web");
  assert.equal(result.data.budgetRange, "10k_30k");
});

test("keeps only whitelisted attribution and strips referrer to its host", () => {
  const result = parseInquiry(valid, NOW);
  assert.deepEqual(result.data.attribution, { utm_source: "google", utm_medium: "cpc", referrer: "www.google.com" });
});

test("optional fields become null", () => {
  const result = parseInquiry({ ...valid, phone: "", company: " ", service: "", budget: "" }, NOW);
  assert.equal(result.kind, "valid");
  assert.equal(result.data.phone, null);
  assert.equal(result.data.company, null);
  assert.equal(result.data.serviceInterest, null);
  assert.equal(result.data.budgetRange, null);
});

test("reports field errors", () => {
  const result = parseInquiry({ ...valid, name: "A", email: "nope", phone: "abc", message: "corto", consent: false, service: "Hackeo", budget: "1M" }, NOW);
  assert.equal(result.kind, "invalid");
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["budget", "consent", "email", "message", "name", "phone", "service"]);
});

test("consent must be the boolean true", () => {
  assert.equal(parseInquiry({ ...valid, consent: "true" }, NOW).kind, "invalid");
});

test("rejects oversized message", () => {
  assert.equal(parseInquiry({ ...valid, message: "x".repeat(3001) }, NOW).kind, "invalid");
});

test("honeypot and too-fast submissions are flagged as bots", () => {
  assert.equal(parseInquiry({ ...valid, website: "http://spam" }, NOW).kind, "bot");
  assert.equal(parseInquiry({ ...valid, startedAt: NOW - (MIN_FILL_MS - 1) }, NOW).kind, "bot");
});

test("non-object bodies are invalid", () => {
  for (const body of [null, "x", 1, []]) assert.equal(parseInquiry(body, NOW).kind, "invalid");
});

test("strips control characters", () => {
  const result = parseInquiry({ ...valid, name: "Ana\u0000\u0007 López" }, NOW);
  assert.equal(result.data.name, "Ana López");
});

test("origin check", () => {
  assert.equal(isAllowedOrigin(null, "cbdevs.com"), true);
  assert.equal(isAllowedOrigin("https://cbdevs.com", "cbdevs.com"), true);
  assert.equal(isAllowedOrigin("https://evil.com", "cbdevs.com"), false);
  assert.equal(isAllowedOrigin("not a url", "cbdevs.com"), false);
  assert.equal(isAllowedOrigin("https://www.cbdevs.com", "cbdevs-web.vercel.app", ["https://www.cbdevs.com"]), true);
});

test("client ip prefers x-real-ip, then first forwarded hop", () => {
  const h = (map) => ({ get: (k) => map[k] ?? null });
  assert.equal(clientIp(h({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" })), "1.1.1.1");
  assert.equal(clientIp(h({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" })), "2.2.2.2");
  assert.equal(clientIp(h({})), "unknown");
});
