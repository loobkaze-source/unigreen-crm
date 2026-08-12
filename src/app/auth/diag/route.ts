/**
 * TEMPORARY latency diagnostic. Reports which region this serverless function
 * runs in and how long a Supabase round trip takes *from inside* the function,
 * so compute-region vs database-region cost can be measured directly.
 *
 * Lives under /auth/* because that prefix is already public in the middleware
 * (see lib/supabase/middleware.ts PUBLIC_PATHS). Returns no secrets — only
 * region names and timings. Delete once the region work is settled.
 */
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

async function timed(label: string, fn: () => Promise<unknown>) {
  const t0 = performance.now();
  let ok = true;
  try {
    await fn();
  } catch {
    ok = false;
  }
  return { label, ms: Math.round(performance.now() - t0), ok };
}

export async function GET() {
  const env = process.env;

  // One PostgREST query and one auth call, each measured on its own.
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const rest = await timed("supabase_rest", () =>
    fetch(`${SUPABASE_URL}/rest/v1/organizations?select=id&limit=1`, { headers, cache: "no-store" })
  );
  const auth = await timed("supabase_auth_health", () =>
    fetch(`${SUPABASE_URL}/auth/v1/health`, { headers, cache: "no-store" })
  );
  // Second REST call: shows the warm/connection-reused cost.
  const rest2 = await timed("supabase_rest_2nd", () =>
    fetch(`${SUPABASE_URL}/rest/v1/organizations?select=id&limit=1`, { headers, cache: "no-store" })
  );

  return Response.json(
    {
      compute: {
        aws_region: env.AWS_REGION ?? null,
        aws_default_region: env.AWS_DEFAULT_REGION ?? null,
        lambda: env.AWS_LAMBDA_FUNCTION_NAME ?? null,
        netlify: env.NETLIFY ?? null,
        deploy_id: env.DEPLOY_ID ?? null,
        runtime: `node ${process.version}`,
      },
      supabase_host: (() => {
        try {
          return new URL(SUPABASE_URL).host;
        } catch {
          return null;
        }
      })(),
      timings: [rest, auth, rest2],
    },
    { headers: { "cache-control": "no-store" } }
  );
}
