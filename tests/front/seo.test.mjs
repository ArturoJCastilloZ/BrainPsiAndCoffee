// Fase 4 de la auditoria del 2026-10-09: rutas reales, <head> por ruta,
// prerender, robots, sitemap y datos estructurados.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PUBLIC_ROUTES, PRIVATE_ROUTES, LEGACY_REDIRECTS, routeMeta, absoluteUrl,
} from '../../src/seo/routes.mjs';
import { headTags } from '../../src/seo/headTags.mjs';
import { businessJsonLd, serializeJsonLd } from '../../src/seo/jsonLd.mjs';
import { renderRouteHtml, robotsTxt, sitemapXml } from '../../scripts/prerender.mjs';

const plantilla = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const SITIO = 'https://ejemplo.mx';

// 1 · Cada ruta publica es una pagina DISTINTA para Google: titulo y
//     descripcion propios. Antes las cinco compartian los de la portada.
{
  const titulos = new Set(PUBLIC_ROUTES.map((r) => r.title));
  const descripciones = new Set(PUBLIC_ROUTES.map((r) => r.description));
  assert.equal(titulos.size, PUBLIC_ROUTES.length, 'dos rutas publicas comparten titulo');
  assert.equal(descripciones.size, PUBLIC_ROUTES.length, 'dos rutas publicas comparten descripcion');
  for (const r of PUBLIC_ROUTES) {
    assert.ok(r.title.length <= 70, `titulo demasiado largo en ${r.path}`);
    assert.ok(r.description.length >= 50 && r.description.length <= 170, `descripcion fuera de rango en ${r.path}`);
  }
}

// 2 · El canonical apunta a LA ruta, no a "/" — y sin dominio no hay
//     canonical (uno a un dominio ajeno es peor que ninguno).
{
  const html = renderRouteHtml(plantilla, routeMeta('/terapia'), SITIO);
  assert.match(html, /<link rel="canonical" href="https:\/\/ejemplo\.mx\/terapia" \/>/);
  assert.match(html, /<title>Terapia infantil/);
  assert.equal((html.match(/<title>/g) || []).length, 1, 'el HTML quedo con dos <title>');
  assert.ok(!/<!--route-head-->|<!--prerender-->/.test(html), 'quedaron marcas sin reemplazar');
  // El buscador lee texto y ENLACES sin JavaScript. Antes: un div vacio.
  assert.match(html, /<h1>Terapia con precio a la vista<\/h1>/);
  assert.match(html, /<a href="\/cafeteria">/);

  const sinDominio = renderRouteHtml(plantilla, routeMeta('/terapia'), '');
  assert.ok(!/rel="canonical"/.test(sinDominio), 'sin SITE_URL no debe emitirse canonical');
  assert.equal(absoluteUrl('http://inseguro.mx', '/'), '', 'un dominio sin https no sirve de canonical');
  assert.equal(absoluteUrl('https://x.mx/', '/a'), 'https://x.mx/a');
}

// 3 · La puerta del personal y lo personal no se indexan.
{
  for (const r of PRIVATE_ROUTES) {
    const html = renderRouteHtml(plantilla, routeMeta(r.path), SITIO);
    assert.match(html, /<meta name="robots" content="noindex, follow" \/>/, `${r.path} quedo indexable`);
    assert.ok(!/rel="canonical"/.test(html), `${r.path} no debe tener canonical`);
    assert.ok(!/application\/ld\+json/.test(html), `${r.path} no debe llevar el schema del negocio`);
  }
  assert.equal(routeMeta('/no-existe').indexable, false, 'una URL inventada no es indexable');
  assert.equal(routeMeta('/terapia/').path, '/terapia', 'la barra final es la misma pagina');
  for (const destino of Object.values(LEGACY_REDIRECTS)) {
    assert.ok(PUBLIC_ROUTES.some((r) => r.path === destino), `la redireccion apunta a ${destino}, que no existe`);
  }
}

// 4 · robots y sitemap salen de la misma lista.
{
  const robots = robotsTxt(SITIO);
  // Sin Disallow: el noindex de cada privada solo funciona si se rastrea.
  assert.ok(!/Disallow: \/(admin|login|doctor)/.test(robots), 'robots bloquea una privada: Google no veria su noindex');
  assert.ok(robots.includes(`Sitemap: ${SITIO}/sitemap.xml`));
  assert.ok(!robotsTxt('').includes('Sitemap:'), 'sin dominio no hay sitemap que anunciar');

  const mapa = sitemapXml(SITIO);
  for (const r of PUBLIC_ROUTES) assert.ok(mapa.includes(`<loc>${absoluteUrl(SITIO, r.path)}</loc>`), `sitemap sin ${r.path}`);
  for (const r of PRIVATE_ROUTES) assert.ok(!mapa.includes(r.path + '<'), `sitemap incluye la privada ${r.path}`);
  assert.equal(sitemapXml(''), null);
}

// 5 · El schema solo dice lo que es verdad: los datos de relleno de
//     businessInfo.js (telefono de ejemplo, "Direccion por confirmar") no
//     entran, y "</script>" en un dato no cierra la etiqueta.
{
  const defaults = { phone: '8112345678', address: 'Dirección por confirmar', email: 'hola@x.mx' };
  const relleno = businessJsonLd({ settings: { ...defaults }, defaults, siteUrl: SITIO });
  assert.equal(relleno.telephone, undefined, 'el telefono de ejemplo entro al schema');
  assert.equal(relleno.address.streetAddress, undefined, '"Direccion por confirmar" entro al schema');

  const real = businessJsonLd({
    settings: { ...defaults, phone: '81 5555 0000', address: 'Calle 1 #2' },
    defaults,
    siteUrl: SITIO,
    services: [{ name: 'Psicología infantil', price: 550, active: true }, { name: 'Oculto', price: 1, active: false }],
  });
  assert.equal(real.telephone, '81 5555 0000');
  assert.equal(real.address.streetAddress, 'Calle 1 #2');
  assert.equal(real.hasOfferCatalog.itemListElement.length, 1, 'un servicio inactivo se anuncio en el schema');
  assert.equal(real.hasOfferCatalog.itemListElement[0].price, '550.00');
  assert.ok(!serializeJsonLd({ x: '</script><script>alert(1)</script>' }).includes('</script>'));
}

// 6 · La app usa la MISMA lista: el <head> que pone al navegar es el que
//     el build escribio para esa ruta.
{
  const meta = routeMeta('/cafeteria');
  const tags = headTags(meta, SITIO);
  assert.ok(tags.includes(meta.title) && tags.includes(meta.description));
  const head = readFileSync(new URL('../../src/seo/useRouteHead.js', import.meta.url), 'utf8');
  assert.match(head, /routeMeta\(pathname\)/);
}

// 7 · nginx: lo que no existe es 404 de verdad, no la portada con 200.
{
  const nginx = readFileSync(new URL('../../docker/nginx.conf', import.meta.url), 'utf8');
  assert.match(nginx, /try_files \$uri \$uri\/index\.html =404;/, 'nginx volvio a mandar todo a index.html');
  assert.match(nginx, /error_page 404 \/404\.html;/);
  const csp = readFileSync(new URL('../../docker/security-headers.conf', import.meta.url), 'utf8');
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(csp), 'las fuentes son propias: la CSP no debe abrir Google Fonts');
}

console.log('seo: ok');
