import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// La generacion de la temporal y la forma del app_metadata viven fuera
// para poder probarlas. Ver password.mjs.
import {
  generarTemporal,
  caducidadTemporal,
  metadatosDeAlta,
  validarAlta,
} from './password.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-tenant-id es un header PERSONALIZADO: el navegador manda un
  // preflight OPTIONS y lo rechaza si no esta aqui. La funcion no
  // llegaria a ejecutarse.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Alta de personal con contraseña temporal.
//
// Existe porque el correo de invitacion de Supabase no llega: su SMTP por
// defecto esta limitado a unos pocos envios por hora. Sin esto, el unico
// modo de dar de alta a un admin de cafeteria era crear la cuenta a mano
// en el panel de Supabase — el dueño de una clinica necesitando la
// consola del proveedor.
//
// Va APARTE de sync-doctor-access: esa ya sincroniza fichas, concede y
// revoca, y ha sido la fuente de tres hallazgos de seguridad. Meterle un
// cuarto trabajo la empeora.
// Si ya hay una cuenta con ese correo.
//
// PAGINA. listUsers trae 50 por pagina y una sola llamada se queda corta
// en cuanto la instalacion crece: creer que no existe a alguien que si
// existe termina en un segundo intento de crear la cuenta, que rebota
// con un error del proveedor que nadie sabe leer. Es el mismo motivo por
// el que sync-doctor-access tiene listAllUsers.
const existeUsuario = async (
  adminClient: ReturnType<typeof createClient>,
  email: string,
): Promise<boolean> => {
  const porPagina = 200;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: porPagina });
    if (error) throw error;
    const usuarios = data?.users ?? [];
    if (usuarios.some((u) => (u.email || '').toLowerCase() === email)) return true;
    if (usuarios.length < porPagina) return false;
  }
  // 20 000 usuarios sin encontrarlo: se falla CERRADO. Seguir y crear la
  // cuenta seria decidir "no existe" sin haber mirado.
  throw new Error('No se pudo comprobar si el correo ya tiene cuenta.');
};

const manejar = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Missing Supabase environment variables.' }, 500);
  }

  const authorization = req.headers.get('Authorization') || '';
  const tenantId = req.headers.get('x-tenant-id') || '';
  if (!tenantId) {
    return json({ error: 'Falta la clinica.' }, 400);
  }

  // x-tenant-id va AQUI, y no solo Authorization.
  //
  // requested_tenant() lo lee de request.headers, y current_tenant_id()
  // cuelga de el; sin ese header, cualquier RPC que este cliente haga se
  // ejecuta SIN clinica activa y assert_tenant_owner() corta con "No hay
  // una clinica activa en esta sesion". La rama de "ya tiene cuenta"
  // -que llama a set_tenant_member_role- fallaba siempre por esto.
  //
  // El tenant sigue sin creerse por venir del cliente: abajo se verifica
  // contra tenant_members, y la RPC ademas lo vuelve a comprobar.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization, 'x-tenant-id': tenantId } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return json({ error: 'No autenticado.' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // La autorizacion se comprueba contra tenant_members, NO contra el
  // claim. sync-doctor-access mira memberships del JWT, que es su cache:
  // un dueño al que le quitaron el rol conserva el claim hasta que su
  // token se renueve. Aqui se crean CUENTAS, asi que se pregunta a la
  // fuente de verdad.
  const { data: miembro, error: miembroError } = await adminClient
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', callerData.user.id)
    .eq('active', true)
    .maybeSingle();
  if (miembroError) throw miembroError;
  if (!miembro || miembro.role !== 'owner') {
    return json({ error: 'Solo el dueño de la clinica puede dar de alta personal.' }, 403);
  }

  let body: { email?: string; role?: string; therapistId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo invalido: se esperaba JSON.' }, 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '');
  const therapistId = String(body.therapistId ?? '').trim() || null;

  const problema = validarAlta({ email, role, therapistId });
  if (problema) return json({ error: problema }, 400);

  // Un doctor necesita que la ficha exista Y este libre. Se comprueba
  // aqui porque en la rama de creacion no pasa por
  // set_tenant_member_role, que es donde vivian estos chequeos.
  if (role === 'doctor') {
    const { data: ficha, error: fichaError } = await adminClient
      .from('therapists')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', therapistId)
      .maybeSingle();
    if (fichaError) throw fichaError;
    if (!ficha) return json({ error: `No existe la ficha de terapeuta "${therapistId}" en esta clinica.` }, 400);

    const { data: ocupada, error: ocupadaError } = await adminClient
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('therapist_id', therapistId)
      .maybeSingle();
    if (ocupadaError) throw ocupadaError;
    if (ocupada) return json({ error: 'Esa ficha de terapeuta ya esta asignada a otro usuario.' }, 400);
  }

  // ¿La persona ya tiene cuenta? Entonces NO se le crea otra ni se le
  // toca la suya: se le INVITA, con el flujo de consentimiento de 0032,
  // y ejecutado con los permisos del llamante. Crear cuentas es para
  // quien no tiene; meter a alguien que ya existe es otra cosa y necesita
  // su permiso.
  const yaExiste = await existeUsuario(adminClient, email);

  if (yaExiste) {
    const { error: invitarError } = await callerClient.rpc('set_tenant_member_role', {
      p_email: email,
      p_role: role,
      p_therapist_id: therapistId,
    });
    if (invitarError) return json({ error: invitarError.message }, 400);
    return json({ estado: 'invitado' });
  }

  // Cuenta nueva. email_confirm: true porque el correo NO participa en
  // este flujo — la contraseña se entrega en mano. Sin esto la cuenta
  // quedaria esperando una confirmacion que nadie va a mandar.
  const temporal = generarTemporal();
  const caducidad = caducidadTemporal();

  const { data: creado, error: crearError } = await adminClient.auth.admin.createUser({
    email,
    password: temporal,
    email_confirm: true,
    app_metadata: metadatosDeAlta({ tenantId, role, therapistId, caducidad }),
  });
  if (crearError) return json({ error: crearError.message }, 400);
  const nuevoId = creado?.user?.id;
  if (!nuevoId) return json({ error: 'No se pudo crear la cuenta.' }, 500);

  // La membresia nace ACTIVA: la cuenta existe porque esta clinica la
  // creo y la contraseña se entrega en mano, asi que no hay a quien
  // pedirle consentimiento. Lo que la contiene es el flag, no el active.
  const { error: membresiaError } = await adminClient.from('tenant_members').insert({
    tenant_id: tenantId,
    user_id: nuevoId,
    role,
    therapist_id: therapistId,
    active: true,
  });
  if (membresiaError) {
    // Sin membresia la cuenta es un cascaron que no puede entrar a nada y
    // que ademas bloquea el correo para un segundo intento. Se deshace.
    await adminClient.auth.admin.deleteUser(nuevoId);
    throw membresiaError;
  }

  if (therapistId) {
    const { error: fichaError } = await adminClient
      .from('therapists')
      .update({ user_id: nuevoId, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', therapistId);
    if (fichaError) throw fichaError;
  }

  // La temporal viaja UNA vez, aqui. No se guarda en ningun sitio ni se
  // vuelve a poder consultar: si se pierde, se regenera.
  return json({ estado: 'creado', email, temporal, caduca: caducidad });
};

// Todo error acaba en una respuesta JSON, no en un throw suelto.
//
// Un throw sin atrapar dentro de Deno.serve devuelve un 500 SIN cuerpo
// JSON y SIN cabeceras CORS: el navegador ni siquiera puede leerlo, asi
// que el cliente cae a "No se pudo dar de alta al usuario" y el motivo
// real se pierde. Habia siete throws en esta funcion y ninguno llegaba a
// la pantalla.
//
// El mensaje se manda tal cual. Esta funcion la llama el dueño de la
// clinica, no un visitante: esconderle la causa no protege de nada y le
// impide arreglar lo que suele ser suyo (una ficha ocupada, un rol
// invalido). Lo que NUNCA sale de aqui es la contraseña temporal, y eso
// lo vigila un guard de qa-check.
Deno.serve(async (req) => {
  try {
    return await manejar(req);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    return json({ error: `No se pudo completar el alta: ${motivo}` }, 500);
  }
});
