// Prerender de Nivel 0 (auditoria 2026-10-09, seccion 6).
//
// Plugin de Vite que, al terminar el build, escribe en dist/:
//   · un <ruta>/index.html por cada ruta publica, con su <head> propio y
//     un texto clave que el buscador lee sin ejecutar JavaScript;
//   · un index.html por ruta privada, con noindex;
//   · 404.html (nginx lo sirve con estado 404 para URLs inventadas);
//   · robots.txt y, si hay dominio, sitemap.xml.
//
// El dominio sale de SITE_URL en el build (https://, sin barra final). Sin
// el, no se emiten canonical, og:url ni sitemap: hoy el sitio no tiene
// dominio y un canonical a uno ajeno le diria a Google que la pagina vive
// en otro lado.
//
// React reemplaza el contenido previo al montar (createRoot, no hydrate):
// no hay riesgo de desajuste de hidratacion. El siguiente nivel —render
// real de los componentes con el catalogo— pide que la portada no toque
// window al importar; queda para cuando Supabase salga de la portada.

import fs from 'node:fs';
import path from 'node:path';
import {
  LEGACY_REDIRECTS, NAV_LINKS, NOT_FOUND, PRIVATE_ROUTES, PUBLIC_ROUTES, absoluteUrl, routeMeta,
} from '../src/seo/routes.mjs';
import { fallbackBody, headTags } from '../src/seo/headTags.mjs';
import { businessJsonLd, serializeJsonLd } from '../src/seo/jsonLd.mjs';

const ENTRE = (inicio, fin) => new RegExp(`${inicio}[\\s\\S]*?${fin}`);

export function renderRouteHtml(plantilla, meta, siteUrl) {
  if (!plantilla.includes('<!--route-head-->') || !plantilla.includes('<!--prerender-->')) {
    throw new Error('index.html perdio las marcas <!--route-head--> o <!--prerender-->');
  }
  const ld = meta.indexable
    ? `<script type="application/ld+json" id="ld-negocio">${serializeJsonLd(businessJsonLd({ siteUrl }))}</script>`
    : '';
  return plantilla
    .replace(ENTRE('<!--route-head-->', '<!--/route-head-->'), headTags(meta, siteUrl))
    .replace('<!--json-ld-->', ld)
    .replace('<!--prerender-->', fallbackBody(meta, NAV_LINKS));
}

export function robotsTxt(siteUrl) {
  // SIN Disallow para las rutas privadas, a proposito: lo que las saca del
  // indice es su <meta robots noindex>, y Google solo lo lee si puede
  // rastrear la pagina. Bloqueada en robots.txt, una URL enlazada desde
  // fuera puede indexarse igual — sin contenido, pero indexada.
  const lineas = ['User-agent: *', 'Allow: /'];
  const mapa = absoluteUrl(siteUrl, '/sitemap.xml');
  if (mapa) lineas.push('', `Sitemap: ${mapa}`);
  return `${lineas.join('\n')}\n`;
}

export function sitemapXml(siteUrl) {
  if (!absoluteUrl(siteUrl, '/')) return null;
  const urls = PUBLIC_ROUTES.map((r) => [
    '  <url>',
    `    <loc>${absoluteUrl(siteUrl, r.path)}</loc>`,
    `    <priority>${r.priority}</priority>`,
    '  </url>',
  ].join('\n'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export default function prerender({ siteUrl = process.env.SITE_URL || '' } = {}) {
  let outDir = 'dist';
  return {
    name: 'brainpsi-prerender',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const plantilla = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
      const escribir = (rel, contenido) => {
        const destino = path.join(outDir, rel);
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, contenido);
      };

      for (const ruta of [...PUBLIC_ROUTES, ...PRIVATE_ROUTES]) {
        const meta = routeMeta(ruta.path);
        const rel = ruta.path === '/' ? 'index.html' : `${ruta.path.slice(1)}/index.html`;
        escribir(rel, renderRouteHtml(plantilla, meta, siteUrl));
      }
      escribir('404.html', renderRouteHtml(plantilla, { ...NOT_FOUND, indexable: false }, siteUrl));

      // Las URLs viejas tambien deben existir para que nginx no responda
      // 404 antes de que React las redirija. noindex: el destino es la
      // pagina que cuenta.
      for (const vieja of Object.keys(LEGACY_REDIRECTS)) {
        const meta = { ...routeMeta(LEGACY_REDIRECTS[vieja]), indexable: false };
        escribir(`${vieja.slice(1)}/index.html`, renderRouteHtml(plantilla, meta, siteUrl));
      }

      escribir('robots.txt', robotsTxt(siteUrl));
      const mapa = sitemapXml(siteUrl);
      if (mapa) escribir('sitemap.xml', mapa);
    },
  };
}
