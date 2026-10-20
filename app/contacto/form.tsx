"use client";

import { useEffect, useRef, useState } from "react";
import { ATTRIBUTION_KEYS, BUDGET_OPTIONS, SERVICE_OPTIONS, type InquiryField } from "../../lib/inquiry";

type FieldErrors = Partial<Record<InquiryField, string>>;
type Phase = "idle" | "sending" | "sent";

const FIELD_ORDER: InquiryField[] = ["name", "email", "phone", "company", "service", "budget", "message", "consent"];

function readAttribution(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of ATTRIBUTION_KEYS) {
      if (key === "referrer") continue;
      const value = params.get(key);
      if (value) out[key] = value.slice(0, 120);
    }
    if (document.referrer) out.referrer = document.referrer;
  } catch {
    // Attribution is optional.
  }
  return out;
}

export function ContactForm() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const startedAt = useRef<number>(0);
  const attribution = useRef<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
    attribution.current = readAttribution();
  }, []);

  useEffect(() => {
    if (phase === "sent") successRef.current?.focus();
  }, [phase]);

  function focusFirstError(errors: FieldErrors) {
    const first = FIELD_ORDER.find((field) => errors[field]);
    if (!first) return;
    const el = formRef.current?.elements.namedItem(first);
    if (el instanceof HTMLElement) el.focus();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase === "sending") return;
    const form = event.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      company: fd.get("company"),
      service: fd.get("service"),
      budget: fd.get("budget"),
      message: fd.get("message"),
      consent: fd.get("consent") === "on",
      website: fd.get("website"),
      startedAt: startedAt.current,
      attribution: attribution.current,
    };

    setPhase("sending");
    setFormError("");
    setFieldErrors({});
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; fieldErrors?: FieldErrors };
      if (!response.ok) {
        const errors = result.fieldErrors || {};
        setFieldErrors(errors);
        setFormError(result.error || "No se pudo enviar el mensaje. Intenta de nuevo.");
        setPhase("idle");
        focusFirstError(errors);
        return;
      }
      form.reset();
      setPhase("sent");
    } catch {
      setFormError("No hay conexión. Revisa tu internet e intenta de nuevo.");
      setPhase("idle");
    }
  }

  function sendAnother() {
    startedAt.current = Date.now();
    setPhase("idle");
  }

  if (phase === "sent") {
    return (
      <div className="success" ref={successRef} tabIndex={-1} role="status">
        <div className="eyebrow">MENSAJE RECIBIDO</div>
        <h2>Gracias, ya tenemos tu solicitud.</h2>
        <p>Un miembro del equipo revisará tu proyecto y te contactará pronto por email, teléfono o WhatsApp.</p>
        <button type="button" className="button secondary" onClick={sendAnother}>Enviar otro mensaje</button>
      </div>
    );
  }

  const describe = (field: InquiryField) => (fieldErrors[field] ? `${field}-error` : undefined);
  const error = (field: InquiryField) =>
    fieldErrors[field] ? <span id={`${field}-error`} className="fielderror">{fieldErrors[field]}</span> : null;

  return (
    <form ref={formRef} onSubmit={submit} className="form" aria-busy={phase === "sending"}>
      <div className="row">
        <label>
          Nombre *
          <input name="name" autoComplete="name" required minLength={2} maxLength={100}
            aria-invalid={!!fieldErrors.name} aria-describedby={describe("name")} />
          {error("name")}
        </label>
        <label>
          Email *
          <input name="email" type="email" autoComplete="email" required maxLength={254}
            aria-invalid={!!fieldErrors.email} aria-describedby={describe("email")} />
          {error("email")}
        </label>
      </div>
      <div className="row">
        <label>
          Teléfono / WhatsApp
          <input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={40}
            aria-invalid={!!fieldErrors.phone} aria-describedby={describe("phone")} />
          {error("phone")}
        </label>
        <label>
          Empresa o negocio
          <input name="company" autoComplete="organization" maxLength={160}
            aria-invalid={!!fieldErrors.company} aria-describedby={describe("company")} />
          {error("company")}
        </label>
      </div>
      <div className="row">
        <label>
          ¿Qué necesitas?
          <select name="service" defaultValue="" aria-invalid={!!fieldErrors.service} aria-describedby={describe("service")}>
            <option value="">Selecciona una opción</option>
            {SERVICE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          {error("service")}
        </label>
        <label>
          Presupuesto estimado
          <select name="budget" defaultValue="" aria-invalid={!!fieldErrors.budget} aria-describedby={describe("budget")}>
            <option value="">Selecciona un rango</option>
            {BUDGET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {error("budget")}
        </label>
      </div>
      <label>
        Cuéntanos de tu proyecto *
        <textarea name="message" required minLength={10} maxLength={3000}
          aria-invalid={!!fieldErrors.message} aria-describedby={describe("message")} />
        {error("message")}
      </label>
      {/* Honeypot for bots; hidden from people and assistive tech. */}
      <div className="hp" aria-hidden="true">
        <label>
          Sitio web
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="consent">
        <input type="checkbox" name="consent" required
          aria-invalid={!!fieldErrors.consent} aria-describedby={describe("consent")} />
        <span>Acepto que C.B.devs me contacte por email, teléfono o WhatsApp sobre esta solicitud. *</span>
      </label>
      {error("consent")}
      <button className="button primary" disabled={phase === "sending"}>
        {phase === "sending" ? "Enviando…" : "Enviar mensaje →"}
      </button>
      {formError && <p className="formerror" role="alert">{formError}</p>}
    </form>
  );
}
