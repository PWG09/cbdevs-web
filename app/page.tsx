import Link from "next/link";

export default function Home() {
  return <main>
    <nav className="nav"><div className="brand">C.B.devs</div><div className="navlinks"><a href="#servicios">Servicios</a><a href="#proceso">Proceso</a><a href="#contacto">Contacto</a></div></nav>
    <section className="hero"><div className="eyebrow">DESARROLLO WEB • SOLUCIONES DIGITALES</div><h1>Tu negocio merece una presencia digital que <span>trabaje por ti.</span></h1><p>Diseñamos y desarrollamos sitios web modernos, rápidos y hechos a la medida para negocios que quieren crecer.</p><div className="actions"><a className="button primary" href="#contacto">Quiero mi sitio</a><a className="button secondary" href="#servicios">Ver servicios</a></div></section>
    <section id="servicios" className="section"><div className="sectionhead"><span>01</span><h2>Lo que hacemos</h2></div><div className="grid">{[['Sitios web','Diseños profesionales, responsive y optimizados para convertir visitantes en clientes.'],['Sistemas personalizados','Herramientas internas, dashboards y plataformas adaptadas a tu negocio.'],['Automatización','Conectamos formularios, pagos, datos y procesos para reducir trabajo manual.'],['Mantenimiento','Mejoras, seguridad, rendimiento y soporte continuo después del lanzamiento.']].map(([t,d])=><article className="card" key={t}><h3>{t}</h3><p>{d}</p></article>)}</div></section>
    <section id="proceso" className="section process"><div className="sectionhead"><span>02</span><h2>Un proceso claro</h2></div><div className="steps">{[['01','Entendemos','Conocemos tu negocio, objetivos y necesidades.'],['02','Construimos','Diseñamos y desarrollamos una solución enfocada en resultados.'],['03','Lanzamos','Probamos, optimizamos y dejamos todo listo para producción.']].map(([n,t,d])=><div className="step" key={n}><b>{n}</b><h3>{t}</h3><p>{d}</p></div>)}</div></section>
    <section id="contacto" className="contact"><div><div className="eyebrow">03 • EMPECEMOS</div><h2>¿Tienes una idea?</h2><p>Cuéntanos qué necesitas y nos ponemos en contacto contigo.</p></div><Link className="button primary" href="/contacto">Contactar C.B.devs →</Link></section>
    <footer><span>© {new Date().getFullYear()} C.B.devs</span><span>Desarrollamos para crecer.</span></footer>
  </main>;
}
