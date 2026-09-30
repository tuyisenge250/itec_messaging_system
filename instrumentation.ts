/**
 * Next.js server-startup hook (runs once, before any request is handled).
 * Only initializes anything in the Node runtime — the edge runtime doesn't
 * use Sentry here since this app has no edge routes.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initSentry } = await import("@/infrastructure/observability/sentry");
    initSentry();
  }
}
