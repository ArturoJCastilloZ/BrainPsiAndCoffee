import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { routeMeta } from './routes.mjs';
import { serializeJsonLd } from './jsonLd.mjs';

// Al navegar dentro de la app, el <head> cambia como si se hubiera
// cargado el HTML prerenderizado de esa ruta. Sin esto, entrar por "/" y
// pasar a /terapia dejaba el titulo de la portada (y la analitica lo
// reportaba asi).
const setMeta = (selector, attr, value) => {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
};

export function useRouteHead(override) {
  const { pathname } = useLocation();
  const titulo = override?.title;
  useEffect(() => {
    const meta = routeMeta(pathname);
    document.title = titulo || meta.title;
    setMeta('meta[name="description"]', 'content', meta.description);
    setMeta('meta[name="robots"]', 'content', meta.indexable ? 'index, follow' : 'noindex, follow');
    // El canonical solo existe si el build tenia dominio (SITE_URL). Se
    // conserva su origen y se cambia la ruta.
    const canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical && meta.indexable) {
      const origen = new URL(canonical.href).origin;
      canonical.href = `${origen}${meta.path}`;
      setMeta('meta[property="og:url"]', 'content', canonical.href);
    }
    setMeta('meta[property="og:title"]', 'content', meta.title);
    setMeta('meta[property="og:description"]', 'content', meta.description);
  }, [pathname, titulo]);
}

// El JSON-LD del build no conoce el catalogo ni los datos del negocio;
// cuando llegan de la base se reemplaza por el completo. Google renderiza
// JavaScript, asi que esta version es la que termina leyendo.
export function useJsonLd(objeto) {
  const texto = objeto ? serializeJsonLd(objeto) : '';
  useEffect(() => {
    if (!texto) return;
    let el = document.getElementById('ld-negocio');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'ld-negocio';
      document.head.appendChild(el);
    }
    el.textContent = texto;
  }, [texto]);
}
