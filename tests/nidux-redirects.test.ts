import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const ENV_KEYS = ["DISABLE_NIDUX_REDIRECT", "NIDUX_REDIRECT_PERMANENT", "NIDUX_STORE_URL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

// The module reads NIDUX_STORE_URL at import time, so load a fresh copy per case.
async function load(storeUrl?: string) {
  if (storeUrl === undefined) delete process.env.NIDUX_STORE_URL;
  else process.env.NIDUX_STORE_URL = storeUrl;
  return import(`../nidux-redirects.ts?store=${encodeURIComponent(storeUrl ?? "default")}-${Math.random()}`);
}

describe("niduxRedirects", () => {
  it("redirects only the root to the Nidux store, temporarily by default", async () => {
    delete process.env.DISABLE_NIDUX_REDIRECT;
    delete process.env.NIDUX_REDIRECT_PERMANENT;
    const { niduxRedirects } = await load();
    assert.deepEqual(niduxRedirects(), [
      { source: "/", destination: "https://slow.minidux.com/", permanent: false },
    ]);
  });

  it("becomes permanent with NIDUX_REDIRECT_PERMANENT=1", async () => {
    process.env.NIDUX_REDIRECT_PERMANENT = "1";
    const { niduxRedirects } = await load();
    assert.equal(niduxRedirects()[0].permanent, true);
  });

  it("is switched off with DISABLE_NIDUX_REDIRECT=1", async () => {
    process.env.DISABLE_NIDUX_REDIRECT = "1";
    const { niduxRedirects } = await load();
    assert.deepEqual(niduxRedirects(), []);
  });

  it("uses NIDUX_STORE_URL and trims trailing slashes", async () => {
    delete process.env.DISABLE_NIDUX_REDIRECT;
    const { niduxRedirects } = await load("https://example.test///");
    assert.equal(niduxRedirects()[0].destination, "https://example.test/");
  });

  it("never touches admin, api or locale routes", async () => {
    delete process.env.DISABLE_NIDUX_REDIRECT;
    const { niduxRedirects } = await load();
    for (const rule of niduxRedirects()) {
      assert.equal(rule.source, "/");
    }
  });
});
