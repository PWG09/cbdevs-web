import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientIp, isAllowedOrigin, parseInquiry } from "../../../lib/inquiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const GENERIC_ERROR = "No fue posible enviar tu solicitud. Intenta de nuevo o escríbenos directamente.";

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    const extraOrigins = (process.env.CBDEVS_WEB_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const requestHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!isAllowedOrigin(req.headers.get("origin"), requestHost, extraOrigins)) {
      return json({ error: "Origen no permitido." }, 403);
    }

    if (!(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      return json({ error: "Solicitud no válida." }, 415);
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ error: "La solicitud es demasiado grande." }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Solicitud no válida." }, 400);
    }

    const parsed = parseInquiry(body);
    if (parsed.kind === "bot") {
      // Look like success so automated senders get no signal.
      return json({ ok: true }, 201);
    }
    if (parsed.kind === "invalid") {
      return json({ error: "Revisa los campos marcados.", fieldErrors: parsed.fieldErrors }, 400);
    }

    // Explicitly named central-project variables so this route cannot silently
    // write to the website's previous Supabase project.
    const url = process.env.CBDEVS_CENTRAL_SUPABASE_URL;
    const key = process.env.CBDEVS_CENTRAL_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error("[INQUIRY_CONFIG_MISSING] Central Supabase variables are not configured");
      return json({ error: GENERIC_ERROR }, 503);
    }

    // Only a keyed hash of the IP is sent to the database, for rate limiting.
    const hashSecret = process.env.CBDEVS_INQUIRY_HASH_SECRET || key;
    const ipHash = createHmac("sha256", hashSecret).update(clientIp(req.headers)).digest("hex");

    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: lead } = parsed;
    const { data, error } = await supabase.rpc("cbdevs_submit_inquiry", {
      p_name: lead.name,
      p_email: lead.email,
      p_message: lead.message,
      p_ip_hash: ipHash,
      p_phone: lead.phone,
      p_company: lead.company,
      p_service_interest: lead.serviceInterest,
      p_budget_range: lead.budgetRange,
      p_source: "web_contact",
      p_attribution: lead.attribution,
      p_consent: true,
    });

    if (error) {
      // Keep database details out of public responses.
      console.error("[CENTRAL_INQUIRY_SUBMIT_FAILED]", error.code, error.message);
      if (error.code === "22023") return json({ error: "Revisa los datos enviados." }, 400);
      return json({ error: GENERIC_ERROR }, 500);
    }

    const status = (data as { status?: string } | null)?.status;
    if (status === "rate_limited") {
      return json({ error: "Recibimos varios mensajes desde tu conexión. Intenta de nuevo en una hora." }, 429);
    }
    if (status !== "created" && status !== "duplicate") {
      console.error("[CENTRAL_INQUIRY_UNEXPECTED_RESULT]", status);
      return json({ error: GENERIC_ERROR }, 500);
    }

    return json({ ok: true }, 201);
  } catch (error) {
    console.error("[INQUIRY_ROUTE_FAILED]", error instanceof Error ? error.message : "unknown");
    return json({ error: GENERIC_ERROR }, 500);
  }
}
