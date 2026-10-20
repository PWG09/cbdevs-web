// Validation and normalization for public website inquiries.
// Pure module (no framework imports) so it can be unit-tested with `node --test`.
// The database function cbdevs_submit_inquiry re-validates everything server-side.

export const SERVICE_OPTIONS = [
  "Sitio Web",
  "Aplicación Web",
  "Software Personalizado/Automatización",
  "Otro",
] as const;

export const BUDGET_OPTIONS = [
  { value: "lt_10k", label: "Menos de $10,000 MXN" },
  { value: "10k_30k", label: "$10,000 – $30,000 MXN" },
  { value: "30k_80k", label: "$30,000 – $80,000 MXN" },
  { value: "gt_80k", label: "Más de $80,000 MXN" },
  { value: "unknown", label: "Aún no lo sé" },
] as const;

export const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "referrer"] as const;

// Submissions faster than this after the form rendered are treated as automated.
export const MIN_FILL_MS = 2500;

export type InquiryField = "name" | "email" | "phone" | "company" | "service" | "budget" | "message" | "consent";

export type InquiryInput = {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  serviceInterest: string | null;
  budgetRange: string | null;
  message: string;
  attribution: Record<string, string>;
};

export type ParseResult =
  | { kind: "valid"; data: InquiryInput }
  | { kind: "invalid"; fieldErrors: Partial<Record<InquiryField, string>> }
  | { kind: "bot" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\-.\s]{7,40}$/;
// Strip C0/C1 control characters except tab/newline (kept for multi-line messages).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(CONTROL, "").trim() : "";
}

function oneLine(value: unknown): string {
  return text(value).replace(/\s+/g, " ");
}

function cleanAttribution(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const raw = oneLine(source[key]);
    if (!raw) continue;
    if (key === "referrer") {
      // Keep only the referring host; full URLs can carry personal data.
      try {
        const host = new URL(raw).hostname.toLowerCase();
        if (host) out.referrer = host.slice(0, 120);
      } catch {
        // Ignore malformed referrers.
      }
      continue;
    }
    out[key] = raw.slice(0, 120);
  }
  return out;
}

export function parseInquiry(body: unknown, now: number = Date.now()): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { kind: "invalid", fieldErrors: {} };
  }
  const b = body as Record<string, unknown>;

  // Honeypot: real visitors never see or fill this field.
  if (text(b.website)) return { kind: "bot" };
  if (typeof b.startedAt === "number" && Number.isFinite(b.startedAt) && now - b.startedAt < MIN_FILL_MS) {
    return { kind: "bot" };
  }

  const name = oneLine(b.name);
  const email = oneLine(b.email).toLowerCase();
  const phone = oneLine(b.phone);
  const company = oneLine(b.company);
  const service = oneLine(b.service);
  const budget = oneLine(b.budget);
  const message = text(b.message);

  const errors: Partial<Record<InquiryField, string>> = {};
  if (name.length < 2 || name.length > 100) errors.name = "Escribe tu nombre (2 a 100 caracteres).";
  if (!EMAIL.test(email) || email.length > 254) errors.email = "Escribe un email válido.";
  if (phone && !PHONE.test(phone)) errors.phone = "Usa solo números, espacios y + ( ) -.";
  if (company.length > 160) errors.company = "Máximo 160 caracteres.";
  if (service && !(SERVICE_OPTIONS as readonly string[]).includes(service)) errors.service = "Selecciona una opción de la lista.";
  if (budget && !BUDGET_OPTIONS.some((o) => o.value === budget)) errors.budget = "Selecciona una opción de la lista.";
  if (message.length < 10) errors.message = "Cuéntanos un poco más (mínimo 10 caracteres).";
  else if (message.length > 3000) errors.message = "Máximo 3000 caracteres.";
  if (b.consent !== true) errors.consent = "Necesitamos tu autorización para contactarte.";

  if (Object.keys(errors).length) return { kind: "invalid", fieldErrors: errors };

  return {
    kind: "valid",
    data: {
      name,
      email,
      phone: phone || null,
      company: company || null,
      serviceInterest: service || null,
      budgetRange: budget || null,
      message,
      attribution: cleanAttribution(b.attribution),
    },
  };
}

// Same-origin check for browser submissions. Requests without an Origin header
// (non-browser clients) are allowed through and remain subject to rate limiting.
export function isAllowedOrigin(origin: string | null, requestHost: string | null, extraOrigins: string[] = []): boolean {
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  if (requestHost && host === requestHost.toLowerCase()) return true;
  return extraOrigins.some((allowed) => {
    try {
      return new URL(allowed).host.toLowerCase() === host;
    } catch {
      return false;
    }
  });
}

export function clientIp(headers: { get(name: string): string | null }): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}
