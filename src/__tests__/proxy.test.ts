import { afterEach, describe, expect, it } from "vitest";
import {
  EnvHttpProxyAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
  type Dispatcher,
} from "undici";
import { configureProxyFromEnv } from "../proxy.js";

const originalDispatcher: Dispatcher = getGlobalDispatcher();

afterEach(async () => {
  const current = getGlobalDispatcher();
  if (current !== originalDispatcher) {
    setGlobalDispatcher(originalDispatcher);
    await current.close();
  }
  delete process.env.HTTPS_PROXY;
  delete process.env.HTTP_PROXY;
});

describe("configureProxyFromEnv", () => {
  it("returns null and leaves the dispatcher untouched when no proxy is set", () => {
    const before = getGlobalDispatcher();
    const result = configureProxyFromEnv({});
    expect(result).toBeNull();
    expect(getGlobalDispatcher()).toBe(before);
  });

  it("treats a blank proxy value as unset", () => {
    const result = configureProxyFromEnv({ HTTPS_PROXY: "   " });
    expect(result).toBeNull();
  });

  it("installs an EnvHttpProxyAgent when HTTPS_PROXY is set", () => {
    // EnvHttpProxyAgent reads HTTP(S)_PROXY from process.env at construction.
    process.env.HTTPS_PROXY = "http://localhost:10054";
    const result = configureProxyFromEnv({ HTTPS_PROXY: "http://localhost:10054" });
    expect(result).toBe("http://localhost:10054");
    expect(getGlobalDispatcher()).toBeInstanceOf(EnvHttpProxyAgent);
  });

  it("prefers HTTPS_PROXY over HTTP_PROXY", () => {
    process.env.HTTPS_PROXY = "http://https-proxy:2";
    const result = configureProxyFromEnv({
      HTTP_PROXY: "http://http-proxy:1",
      HTTPS_PROXY: "http://https-proxy:2",
    });
    expect(result).toBe("http://https-proxy:2");
  });
});
