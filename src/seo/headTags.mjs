// Las etiquetas del <head> de una ruta, como texto. Las escribe el build
// en cada index.html; la app hace lo mismo sobre el DOM al navegar
// (useRouteHead.js), con los mismos datos de routes.mjs.

import { SITE_NAME, absoluteUrl } from './routes.mjs';

const escapar = (texto) => String(texto ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function headTags(meta, siteUrl) {
  const url = meta.indexable ? absoluteUrl(siteUrl, meta.path) : '';
  const tags = [
    `<title>${escapar(meta.title)}</title>`,
    `<meta name="description" content="${escapar(meta.description)}" />`,
    `<meta name="robots" content="${meta.indexable ? 'index, follow' : 'noindex, follow'}" />`,
  ];
  if (url) tags.push(`<link rel="canonical" href="${escapar(url)}" />`);
  if (meta.indexable) {
    tags.push(
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${SITE_NAME}" />`,
      `<meta property="og:locale" content="es_MX" />`,
      `<meta property="og:title" content="${escapar(meta.title)}" />`,
      `<meta property="og:description" content="${escapar(meta.description)}" />`,
      `<meta name="twitter:card" content="summary" />`,
    );
    if (url) tags.push(`<meta property="og:url" content="${escapar(url)}" />`);
  }
  return tags.join('\n    ');
}

// El contenido que ve quien no ejecuta JavaScript (buscadores, vistas
// previas de enlaces, lectores sin JS). React lo reemplaza al montar.
export function fallbackBody(meta, navLinks) {
  const enlaces = navLinks
    .map((l) => `<a href="${escapar(l.path)}">${escapar(l.label)}</a>`)
    .join(' ');
  return [
    '<div class="prerender">',
    `<header><a href="/">${SITE_NAME}</a> <nav aria-label="Principal">${enlaces}</nav></header>`,
    '<main>',
    `<h1>${escapar(meta.h1 || meta.title)}</h1>`,
    meta.text ? `<p>${escapar(meta.text)}</p>` : '',
    '<p><a href="/reservar">Ver horarios disponibles</a></p>',
    '</main>',
    '</div>',
  ].join('');
}
