// Cada entrada del menu lateral del admin tiene que llevar a algo.
//
// Existe por un error real: se agrego la pantalla de Personalizacion como
// una pestaña DENTRO de AdminCatalog, pero todas las pantallas se montan
// con lockedTab —que oculta la barra de pestañas interna y muestra solo
// la que le pasan—, y no se agrego la entrada del menu. La pantalla
// existia, compilaba y pasaba las pruebas, y no habia forma de llegar a
// ella desde ningun lado.
//
// Las tres piezas tienen que coincidir: la entrada del menu, la rama que
// la renderiza, y el permiso que la autoriza. Que falte cualquiera deja
// una pantalla muerta o un enlace roto, y ninguna de las dos cosas se ve
// compilando.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminApp = readFileSync('src/admin/AdminApp.jsx', 'utf8');
const permisos = readFileSync('src/auth/permissions.js', 'utf8');

// Solo el bloque de navSections: fuera de ahi hay otros objetos con id.
const navBloque = adminApp.slice(
  adminApp.indexOf('const navSections'),
  adminApp.indexOf('const navItems'),
);
assert.ok(navBloque.length > 200, 'no se encontro el bloque de navSections');

const enMenu = [...navBloque.matchAll(/\{\s*id:\s*'([a-z-]+)'/g)].map((m) => m[1]);
const conRender = [...adminApp.matchAll(/page === '([a-z-]+)'/g)].map((m) => m[1]);
const conPermiso = [...permisos.matchAll(/page === '([a-z-]+)'/g)].map((m) => m[1]);

assert.ok(enMenu.length >= 8, `se esperaban varias entradas de menu, se hallaron ${enMenu.length}`);

const sinRender = enMenu.filter((id) => !conRender.includes(id));
assert.deepEqual(sinRender, [],
  `estas entradas del menu no tienen rama que las renderice, asi que la pantalla queda en blanco: ${sinRender.join(', ')}`);

const sinPermiso = enMenu.filter((id) => !conPermiso.includes(id));
assert.deepEqual(sinPermiso, [],
  `estas entradas del menu no estan en canAccessAdminPage, asi que el guard las rebota al entrar: ${sinPermiso.join(', ')}`);

// Y al reves: una rama de render sin entrada de menu es una pantalla a la
// que nadie puede llegar — el error exacto que se cometio.
const huerfanas = [...new Set(conRender)].filter((id) => !enMenu.includes(id));
assert.deepEqual(huerfanas, [],
  `estas pantallas se renderizan pero no hay como llegar a ellas desde el menu: ${huerfanas.join(', ')}`);

console.log(`admin-nav: ${enMenu.length} entradas, todas con render y permiso`);
