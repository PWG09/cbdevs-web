import type { Metadata } from "next";
import { ContactForm } from "./form";

export const metadata: Metadata = {
  title: "Contacto — C.B.devs",
  description: "Cuéntanos sobre tu proyecto y te contactamos para conocer los detalles.",
};

export default function Contacto() {
  return (
    <main className="contactpage">
      <a href="/" className="back">← C.B.devs</a>
      <div className="contactwrap">
        <div>
          <div className="eyebrow">HABLEMOS</div>
          <h1>Cuéntanos sobre tu proyecto.</h1>
          <p>Déjanos tus datos y una breve descripción. Te contactaremos para conocer los detalles.</p>
          <ol className="nextsteps">
            <li><b>01</b> Revisamos tu mensaje.</li>
            <li><b>02</b> Te contactamos por el medio que nos dejes.</li>
            <li><b>03</b> Agendamos una llamada y te enviamos una propuesta.</li>
          </ol>
        </div>
        <ContactForm />
      </div>
    </main>
  );
}
