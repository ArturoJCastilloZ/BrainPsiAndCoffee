import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const indexHtml = read('index.html');
assert(indexHtml.includes('<!doctype html>'), 'index.html debe declarar doctype.');
assert(indexHtml.includes('lang="es-MX"'), 'index.html debe declarar lang es-MX.');
assert(indexHtml.includes('name="description"'), 'index.html debe incluir meta description.');

assert(exists('public/robots.txt'), 'Debe existir public/robots.txt.');
assert(exists('public/sitemap.xml'), 'Debe existir public/sitemap.xml.');
const sitemap = read('public/sitemap.xml');
['/', '/coffee', '/therapy', '/contacto', '/privacidad'].forEach((route) => {
  assert(sitemap.includes(`brainpsicoffee.com${route === '/' ? '/' : route}`), `Sitemap debe incluir ${route}.`);
});

const envExample = read('.env.example');
[
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_AUTH_INACTIVITY_MINUTES',
  'VITE_AUTH_WARNING_SECONDS',
  'VITE_ANALYTICS_ENDPOINT',
].forEach((needle) => {
  assert(envExample.includes(needle), `.env.example debe documentar ${needle}.`);
});

const schema = read('scripts/legacy/supabase-schema.sql');
[
  'enable row level security',
  'business_settings',
  'profiles',
  'patients',
  'appointment_notes',
  'appointment_notifications',
  'Public can create appointments',
  'Admins can manage business settings',
  'Doctors can manage own clinical notes',
  'Clinic staff can manage appointment notifications',
  'Cafe staff can read orders',
  'prevent_barista_order_data_changes',
  'queue_appointment_notification',
  'order_can_receive_public_items',
].forEach((needle) => {
  assert(schema.includes(needle), `Schema debe incluir ${needle}.`);
});

const app = read('src/App.jsx');
assert(app.includes('lazy(() => import'), 'App debe usar lazy imports para code splitting.');
assert(app.includes('Suspense'), 'App debe usar Suspense para rutas lazy.');

const monitoring = read('src/monitoring.js');
assert(monitoring.includes('trackEvent'), 'Debe existir trackEvent.');
assert(monitoring.includes('installGlobalErrorReporting'), 'Debe existir reporte global de errores.');

const permissions = read('src/auth/permissions.js');
[
  'super_admin',
  'admin_cafe',
  'admin_consultorio',
  'doctor',
  'barista',
].forEach((role) => {
  assert(permissions.includes(role), `permissions.js debe incluir rol ${role}.`);
});

const login = read('src/components/Login.jsx');
assert(login.includes('Recuperar contraseña'), 'Login debe incluir recuperación de contraseña.');
assert(login.includes('requestPasswordReset'), 'Login debe llamar requestPasswordReset.');

// Solo se quitan las lineas que EMPIEZAN con //. Nada mas.
//
// La primera version tambien borraba bloques /* ... */ y eso producia un
// FALSO NEGATIVO: el regex corre sobre texto plano, sin saber de strings.
// Un literal con '/*' dentro —una regex, un 'text/*' de Content-Type— abre
// un bloque que se cierra en el primer '*/' que aparezca mas abajo, y se
// lleva por delante todo el codigo intermedio. Si en ese tramo estaba la
// regresion, la asercion pasaba en VERDE sobre codigo vulnerable.
// Comprobado: con 'text/*' antes de un updateUserById({ email }), la
// asercion de email daba false.
//
// El problema real que se queria resolver —la prosa que explica el
// peligro disparando el guard— vive en comentarios de LINEA, asi que el
// strip de bloques nunca hizo falta. Se prefiere un guard que a veces
// moleste de mas a uno que calle cuando importa.
const sinComentarios = (source) => source
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

const doctor = read('src/doctor/DoctorApp.jsx');
assert(doctor.includes('createClinicalNote'), 'DoctorApp debe poder crear notas clínicas.');
assert(doctor.includes('signClinicalNote'), 'DoctorApp debe poder firmar la nota.');
assert(doctor.includes('addNoteAddendum'), 'DoctorApp debe permitir addenda sobre una nota firmada.');
// Borrar una nota clínica no es una función que falte: es una que no debe
// existir. NOM-004 exige conservar el expediente 5 años desde el último
// acto médico, así que si alguien la reintroduce, esto lo detiene.
assert(!doctor.includes('deleteClinicalNote'), 'DoctorApp no debe poder borrar notas clínicas.');
const dataLayer = read('src/api/supabaseData.js');
assert(!dataLayer.includes('export const deleteClinicalNote'), 'La capa de datos no debe exponer borrado de notas clínicas.');
assert(doctor.includes('Pacientes'), 'DoctorApp debe incluir vista de pacientes.');

// El servidor recalcula el precio del pedido desde el catalogo (0023) y
// identifica los modificadores por ID. Si MenuPage vuelve a mandar solo
// nombres, el trigger no encuentra los ids, cobra solo el precio base, y
// el negocio regala los extras de cada pedido sin que nada falle.
const menuPage = sinComentarios(read('src/user/MenuPage.jsx'));
assert(
  /optionIds\s*:/.test(menuPage),
  'MenuPage debe mandar optionIds: el servidor valida los modificadores por id, no por nombre, y sin ellos cobra solo el precio base.',
);

// La pantalla del STAFF muestra el precio que cobra el servidor, no el
// que guardo el navegador. customizations.totalPrice viaja dentro del
// jsonb de options y ningun trigger lo valida: si tiene precedencia, el
// cliente se cobra 45 y al barista le aparece $5.
const adminOrders = sinComentarios(read('src/admin/AdminOrders.jsx'));
assert(
  !/customizations\?\.totalPrice\s*\|\|/.test(adminOrders),
  'AdminOrders no debe preferir customizations.totalPrice sobre item.price: ese numero lo pone el navegador y nadie lo valida.',
);

// El combo se decide por categoria en los dos lados. Con prefijos de id,
// el total mostrado y el cobrado podian diferir.
const cartPage = sinComentarios(read('src/user/CartPage.jsx'));

// La oferta que descuenta se elige por dato. "La primera activa" hacia
// que cualquier promo informativa descontara del total.
assert(
  !/activeOffers\([^)]*\)\[0\]/.test(cartPage),
  'CartPage debe elegir la oferta de combo por kind, no tomar la primera activa: una promo cualquiera descontaria del total.',
);

assert(
  !/startsWith\(\s*'[hcp]'\s*\)/.test(cartPage),
  'CartPage no debe decidir el combo por el prefijo del id: el servidor usa products.category y los totales divergirian.',
);

// La bitacora de LECTURA del expediente no se produce sola: Postgres no
// tiene triggers de SELECT, asi que si la aplicacion no la pide, abrir un
// expediente no deja rastro. La funcion de la base existia desde el
// esquema base y NADIE la llamaba — un control de cumplimiento que
// parecia estar y no estaba. En posicion de llamada, no un includes() del
// nombre: el import lo menciona igual.
assert(
  /logClinicalNoteAccess\s*\(/.test(doctor),
  'DoctorApp debe registrar el acceso al expediente llamando a logClinicalNoteAccess: sin eso, NOM-024 se queda sin bitacora de lectura.',
);

// La sincronizacion de doctores corre con service_role y auth.users.email
// NO esta acotado por tenant: es el login del usuario en todas sus
// clinicas. Quien lo controla controla la cuenta, porque el enlace de
// recuperacion va ahi. La decision de escribirlo vive en identity.mjs,
// que si se puede probar; si vuelve a escribirse a mano dentro de la
// funcion, ese control se evapora sin que ninguna prueba se entere.
// Las aserciones de abajo buscan patrones peligrosos como TEXTO. Sin
// quitar los comentarios, la prosa que EXPLICA el peligro los dispara:
// el comentario que documenta por que no se fabrica un app_metadata
// vacio contiene, literalmente, 'app_metadata: {}'. Un guard que se
// dispara con su propia documentacion es ruido, y el ruido se termina
// silenciando.
//
// Se quitan solo las lineas que EMPIEZAN con // y los bloques. Un '//' a
// media linea se conserva a proposito: 'https://esm.sh/...' lo lleva, y
// recortar desde ahi borraria codigo real — un falso NEGATIVO, que es el
// error caro. Queda vivo el caso de un comentario al final de una linea
// de codigo; es aceptable y preferible al otro lado del error.
const syncDoctor = sinComentarios(read('supabase/functions/sync-doctor-access/index.ts'));
assert(
  syncDoctor.includes('buildIdentityUpdate'),
  'sync-doctor-access debe decidir la identidad con buildIdentityUpdate, no a mano.',
);
// El guard anterior era /updateUserById\([^)]*\bemail\s*:/ y era un
// control con FALSO NEGATIVO: [^)]* no cruza un parentesis de cierre, asi
// que bastaba poner otra clave antes —'user_metadata: { ...(x || {}) }'—
// para que el parentesis cortara la busqueda y la forma peligrosa pasara
// en verde. Un guard que reporta OK ante la regresion que existe para
// frenar es peor que no tenerlo.
//
// index.ts hoy no asigna NINGUNA clave 'email:': la unica escritura de
// identidad sale de buildIdentityUpdate. Eso permite una asercion sin
// agujeros, que no depende de como se escriba la llamada.
// deleteUser borra la fila entera de auth.users y profiles.user_id es
// on delete cascade: no esta acotado por tenant. Solo puede correr detras
// de canRecreateUnconfirmedUser, que exige que la persona no pertenezca a
// ninguna otra clinica.
//
// Limite declarado: estas dos aserciones no prueban que la llamada este
// DENTRO del if — eso lo prueba tests/front/doctor-identity.test.mjs sobre
// el predicado. Lo que si detectan es que aparezca una SEGUNDA llamada, o
// que el guard desaparezca. Se prefieren dos comprobaciones simples y
// explicables a un regex de estructura que de falsos negativos.
// En POSICION DE LLAMADA, no un includes() del nombre: el import lo
// menciona igual, asi que un includes() seguia dando verde despues de
// quitar el guard del if. Comprobado quitandolo.
assert(
  /canRecreateUnconfirmedUser\s*\(/.test(syncDoctor),
  'sync-doctor-access debe decidir el borrado LLAMANDO a canRecreateUnconfirmedUser, no solo importarlo.',
);
assert(
  (syncDoctor.match(/\bdeleteUser\s*\(/g) || []).length === 1,
  'sync-doctor-access debe tener exactamente una llamada a deleteUser, la que va detras del guard: borra la cuenta GLOBAL del doctor y con ella su acceso a las demas clinicas.',
);

// updateUserById REEMPLAZA app_metadata, no lo fusiona. Fabricar un
// objeto de usuario con app_metadata vacio —en vez de usar el que
// devuelve la API— le borra al usuario las membresias de sus otras
// clinicas y lo deja fuera de ellas, porque las policies leen el claim.
assert(
  !/app_metadata\s*:\s*\{\s*\}/.test(syncDoctor),
  'sync-doctor-access no debe fabricar un app_metadata vacio: usa el usuario que devuelve la API (invitedUserFrom), o le borras al doctor sus otras clinicas.',
);

assert(
  !/\bemail\s*:/.test(syncDoctor),
  'sync-doctor-access no debe asignar email en index.ts: la identidad se decide en identity.mjs, que si se prueba. Escribirlo aqui puede secuestrar la cuenta de un doctor que atiende en otra clinica.',
);

// La REVOCACION tambien decide en identity.mjs, por las mismas dos
// razones que la identidad: estaba embebida entre llamadas de red y
// fallaba en silencio hacia los dos lados. Quitarla de ahi reabre el
// hallazgo D -revocar al doctor la membresia recien concedida- sin que
// ninguna prueba se entere, porque la prueba cubre el predicado y no el
// cableado. En POSICION DE LLAMADA: el import menciona el nombre igual.
// 0032: esta pantalla es la SEGUNDA puerta por la que se ataba a un
// usuario registrado a la clinica sin pedirle nada. El consentimiento
// depende de que grantMembership reciba si la persona ya es miembro
// ACTIVO, y eso sale de una consulta a tenant_members. Sin la consulta,
// no hay forma de distinguir un cambio de rol de una adhesion.
assert(
  /\.eq\('active',\s*true\)/.test(syncDoctor),
  'sync-doctor-access debe consultar quien es miembro ACTIVO antes de conceder: sin eso vuelve a atar usuarios registrados a la clinica sin su consentimiento (0032).',
);
assert(
  /pending/.test(syncDoctor),
  'sync-doctor-access debe pasar el estado pendiente a grantMembership: una invitacion no toca la cuenta de quien no ha aceptado.',
);

assert(
  /doctorsToRevoke\s*\(/.test(syncDoctor),
  'sync-doctor-access debe decidir la revocacion LLAMANDO a doctorsToRevoke, no a mano ni solo importandola.',
);

// Y esa decision sale de tenant_members, no del claim. app_metadata es
// su cache y puede quedarse corta: un doctor presente en la tabla y
// ausente del claim era invisible para el bucle, asi que darle de baja
// la ficha no le revocaba el acceso a pacientes ni a notas.
//
// therapist_ids se sigue leyendo en identity.mjs para EMPAREJAR, que es
// legitimo; lo que no puede volver es leerlo aqui, que es donde se
// decidia a quien se le quita el acceso.
//
// El regex se ancla a la LECTURA INDEXADA POR TENANT -therapist_ids[...]
// [tenantId]-, que es la forma que tenia la decision. Un
// !/app_metadata[^\n]*therapist_ids/ mas ancho parecia mas seguro y era
// un falso positivo: pegaba en el 'therapist_ids: therapistIds' con el
// que revokeMembership REESCRIBE el claim, que es justo lo que si debe
// hacer. Un guard que se dispara con codigo legitimo se acaba quitando.
assert(
  !/therapist_ids[^\n]*\[\s*tenantId\s*\]/.test(syncDoctor),
  'sync-doctor-access no debe leer therapist_ids del claim en index.ts: la revocacion se decide sobre tenant_members. El claim es su cache y deja fuera a quien no refleje, que conserva el acceso en silencio.',
);

// ---------------------------------------------------------------
// invite-staff: crea CUENTAS y maneja una contraseña en claro.
// ---------------------------------------------------------------
const inviteStaff = sinComentarios(read('supabase/functions/invite-staff/index.ts'));

// La contraseña temporal no puede acabar en los logs de la Edge
// Function: ahi se queda, con la retencion que tenga el proyecto, y
// cualquiera con acceso al panel la lee. Se prohibe console entero
// porque un console.log('alta', body) la arrastra igual sin nombrarla.
assert(
  !/\bconsole\s*\./.test(inviteStaff),
  'invite-staff no debe escribir a consola: la contraseña temporal quedaria en los logs de la Edge Function.',
);

// La autorizacion se comprueba contra tenant_members, NO contra el claim.
// sync-doctor-access mira memberships del JWT, que es su cache: un dueño
// al que le quitaron el rol lo conserva hasta que su token se renueve.
// Aqui se crean cuentas, asi que se pregunta a la fuente de verdad.
assert(
  /from\('tenant_members'\)[\s\S]{0,200}eq\('active',\s*true\)/.test(inviteStaff),
  'invite-staff debe verificar al llamante contra tenant_members (activo), no contra el claim del JWT.',
);

// En POSICION DE LLAMADA: el import menciona el nombre igual, y una
// contraseña generada a mano aqui no pasaria por las pruebas de sesgo,
// largo y caracteres ambiguos.
assert(
  /generarTemporal\s*\(/.test(inviteStaff),
  'invite-staff debe generar la temporal LLAMANDO a generarTemporal, no a mano.',
);

// El cliente que actua EN NOMBRE del llamante tiene que llevar
// x-tenant-id ademas de Authorization. requested_tenant() lo lee de
// request.headers y current_tenant_id() cuelga de el: sin ese header
// cualquier RPC sale sin clinica activa y assert_tenant_owner() corta
// con "No hay una clinica activa en esta sesion".
//
// Existe porque paso: la rama de "ya tiene cuenta" fallaba SIEMPRE, y no
// lo vio ninguna prueba porque la Edge Function no se puede ejecutar
// desde la suite. Lo encontro el dev al usarla.
assert(
  /Authorization:\s*authorization,\s*'x-tenant-id':\s*tenantId/.test(inviteStaff),
  'invite-staff: el cliente del llamante debe llevar x-tenant-id, o toda RPC que haga sale sin clinica activa.',
);

// Todo error tiene que salir como JSON con CORS. Un throw suelto dentro
// de Deno.serve devuelve un 500 sin cuerpo y sin cabeceras: el navegador
// no lo puede leer, el cliente cae a un mensaje generico y el motivo real
// se pierde. Habia siete throws y ninguno llegaba a la pantalla.
assert(
  /Deno\.serve\(async \(req\) => \{\s*try \{/.test(inviteStaff),
  'invite-staff debe envolver el manejador en try/catch y devolver JSON: un throw suelto da un 500 sin CORS que el navegador no puede leer.',
);

if (failures.length) {
  console.error('QA check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('QA check passed.');
