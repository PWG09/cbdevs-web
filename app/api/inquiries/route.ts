import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (
      name.length < 2 ||
      name.length > 100 ||
      !emailPattern.test(email) ||
      email.length > 254 ||
      message.length < 10 ||
      message.length > 3000
    ) {
      return NextResponse.json({ error: "Revisa los datos enviados." }, { status: 400 });
    }

    // Use explicitly named central-project variables so this route cannot silently
    // write to the website's previous Supabase project during the migration.
    const url = process.env.CBDEVS_CENTRAL_SUPABASE_URL;
    const key = process.env.CBDEVS_CENTRAL_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Backend central no configurado." }, { status: 503 });
    }

    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await supabase.from("cbdevs_inquiries").insert({
      app_key: "web",
      name,
      email,
      phone: phone || null,
      message,
      status: "new",
    });

    if (error) {
      // Keep database details out of public responses.
      console.error("[CENTRAL_INQUIRY_INSERT_FAILED]", error.code, error.message);
      return NextResponse.json({ error: "No fue posible enviar tu solicitud." }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[INQUIRY_ROUTE_FAILED]", error);
    return NextResponse.json({ error: "No fue posible enviar tu solicitud." }, { status: 500 });
  }
}
