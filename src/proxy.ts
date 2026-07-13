import process from "node:process";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

/**
 * Node's global `fetch` (powered by undici) does NOT honor the HTTP(S)_PROXY
 * environment variables on its own. In proxied environments — e.g. a corporate
 * egress proxy — every `fetch` to an external host therefore fails with
 * `ENETUNREACH`, because Node attempts a direct connection that isn't routable.
 *
 * Installing an {@link EnvHttpProxyAgent} as the global dispatcher makes `fetch`
 * route through the proxy described by `HTTP_PROXY` / `HTTPS_PROXY` (and respect
 * `NO_PROXY`). This is a no-op when no proxy is configured, so non-proxied
 * environments and tests are unaffected.
 *
 * @returns the proxy URL that was applied, or `null` if no proxy env var is set.
 */
export function configureProxyFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const proxy = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy ?? null;
  if (proxy === null || proxy.trim().length === 0) {
    return null;
  }
  // EnvHttpProxyAgent reads HTTP_PROXY / HTTPS_PROXY / NO_PROXY from process.env.
  setGlobalDispatcher(new EnvHttpProxyAgent());
  return proxy;
}
