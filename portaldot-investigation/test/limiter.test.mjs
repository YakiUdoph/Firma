import test from "node:test";
import assert from "node:assert/strict";
import { BoundedRateLimiter } from "../src/limiter.mjs";

test("rate limiter rejects requests above the window limit", () => {
  const limiter = new BoundedRateLimiter({ limit: 2, windowMs: 1_000, maxKeys: 10 });
  assert.equal(limiter.consume("client", 0).allowed, true);
  assert.equal(limiter.consume("client", 100).allowed, true);
  assert.equal(limiter.consume("client", 200).allowed, false);
  assert.equal(limiter.consume("client", 1_001).allowed, true);
});

test("rate limiter bounds attacker-controlled keys", () => {
  const limiter = new BoundedRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
  for (let index = 0; index < 20; index += 1) limiter.consume(`client-${index}`, index);
  assert.ok(limiter.entries.size <= 3);
});

