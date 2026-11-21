// Redirects the site root to the Nidux store (https://slow.minidux.com).
// Only "/" is redirected; every other route (storefront, /admin, /api) keeps working as before.

export const NIDUX_STORE_URL = (process.env.NIDUX_STORE_URL ?? "https://slow.minidux.com").replace(/\/+$/, "");

type Redirect = { source: string; destination: string; permanent: boolean };

/**
 * Set DISABLE_NIDUX_REDIRECT=1 to turn the redirect off (e2e tests, local work on the old storefront).
 * Set NIDUX_REDIRECT_PERMANENT=1 once the cut-over is final (308 is cached by browsers).
 */
export function niduxRedirects(): Redirect[] {
  if (process.env.DISABLE_NIDUX_REDIRECT === "1") return [];
  return [
    {
      source: "/",
      destination: `${NIDUX_STORE_URL}/`,
      permanent: process.env.NIDUX_REDIRECT_PERMANENT === "1",
    },
  ];
}
