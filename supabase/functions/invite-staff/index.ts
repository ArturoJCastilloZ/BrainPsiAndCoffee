import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// La generacion de la temporal y la forma del app_metadata viven fuera
// para poder probarlas. Ver password.mjs.
import {
  generarTemporal,
  caducidadTemporal,
  metadatosDeAlta,
  validarAlta,
  puedeRegenerarTemporal,
  MENSAJE_TEMPORAL_NEGADA,
  debeCambiarClave,
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

// Alta de personal: por CORREO de invitacion (lo normal) o con contraseña
// temporal entregada en mano (plan B).
//
// La temporal existe porque el correo de Supabase no llegaba (su SMTP por
// defecto solo envia a miembros del equipo del proyecto). Con SMTP propio
// el correo es el camino normal; la temporal queda para cuando el correo
// no llega o la persona no tiene acceso a el.
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
const buscarUsuario = async (
  adminClient: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; app_metadata?: Record<string, unknown>; last_sign_in_at?: string | null } | null> => {
  const porPagina = 200;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: porPagina });
    if (error) throw error;
    const usuarios = data?.users ?? [];
    const hallado = usuarios.find((u) => (u.email || '').toLowerCase() === email);
    if (hallado) return hallado as { id: string; app_metadata?: Record<string, unknown>; last_sign_in_at?: string | null };
    if (usuarios.length < porPagina) return null;
  }
  // 20 000 usuarios sin encontrarlo: se falla CERRADO. Seguir y crear la
  // cuenta seria decidir "no existe" sin haber mirado.
  throw new Error('No se pudo comprobar si el correo ya tiene cuenta.');
};

// Las OTRAS clinicas de esa persona, segun tenant_members.
//
// Decide si esta clinica puede reescribirle la contraseña. Sale de la
// TABLA y no del claim: el claim es su cache y puede quedarse corta, y
// decidir con ella reabre el secuestro de cuenta que cerro 8.3.
//
// SIN filtrar por active: una invitacion pendiente en otra clinica ya es
// una relacion con esa clinica. Filtrando, la temporal le abria a esta
// clinica la cuenta de alguien a quien otra acababa de invitar. Misma
// doctrina que otherTenantsFromDb en sync-doctor-access.
const otrasClinicasDe = async (
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  tenantId: string,
): Promise<string[]> => {
  const { data, error } = await adminClient
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .neq('tenant_id', tenantId);
  if (error) throw error;
  return (data ?? []).map((r) => r.tenant_id as string);
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

  // Quien aun debe cambiar su contraseña temporal no administra nada: esa
  // contraseña la conoce quien se la dio, asi que actuar con ella seria
  // actuar como otra persona.
  if (debeCambiarClave(callerData.user)) {
    return json({ error: 'Cambia tu contraseña temporal antes de administrar accesos.' }, 403);
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

  let body: { email?: string; role?: string; therapistId?: string; accion?: string; metodo?: string; redirectTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo invalido: se esperaba JSON.' }, 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '');
  const therapistId = String(body.therapistId ?? '').trim() || null;
  // 'temporal' = volver a generar la temporal de alguien a quien esta
  // clinica le creo la cuenta y que la perdio antes de entrar. Ver la
  // rama de abajo y puedeRegenerarTemporal.
  const accion = String(body.accion ?? 'alta');
  // Solo para cuentas NUEVAS: 'correo' (por defecto) o 'temporal'.
  const metodo = body.metodo === 'temporal' ? 'temporal' : 'correo';

  // En la accion 'temporal' el rol y la ficha NO vienen del cuerpo: salen
  // de la membresia que ya existe en esta clinica. Validar aqui lo que el
  // cliente mando obligaria a la pantalla a reenviarlos, y entonces el
  // cliente podria cambiarlos de paso.
  if (accion === 'alta') {
    const problema = validarAlta({ email, role, therapistId });
    if (problema) return json({ error: problema }, 400);
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Correo invalido.' }, 400);
  }

  // Un doctor necesita que la ficha exista Y este libre. Se comprueba
  // aqui porque en la rama de creacion no pasa por
  // set_tenant_member_role, que es donde vivian estos chequeos.
  if (accion === 'alta' && role === 'doctor') {
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
  const existente = await buscarUsuario(adminClient, email);

  // ------------------------------------------------------------
  // Volver a generar una contraseña temporal.
  //
  // Reescribirle la contraseña a alguien es tomarle la cuenta. Antes
  // bastaba una invitacion pendiente y que no tuviera otra clinica activa,
  // y el dueño podia fabricar esa invitacion para cualquier correo: era
  // la via para quedarse con la cuenta de un especialista (auditoria S1).
  //
  // Ahora solo procede para quien ESTA clinica creo y nunca ha entrado:
  // ver puedeRegenerarTemporal. Toda negativa responde lo mismo, para no
  // revelar si un correo tiene cuenta (S10).
  // ------------------------------------------------------------
  if (accion === 'temporal') {
    const negada = () => json({ error: MENSAJE_TEMPORAL_NEGADA }, 400);
    if (!existente) return negada();

    const { data: aqui, error: aquiError } = await adminClient
      .from('tenant_members')
      .select('role, therapist_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', existente.id)
      .maybeSingle();
    if (aquiError) throw aquiError;

    const otras = await otrasClinicasDe(adminClient, existente.id, tenantId);
    if (!puedeRegenerarTemporal({
      user: existente, tenantId, otrasClinicas: otras, esMiembroAqui: Boolean(aqui),
    })) {
      return negada();
    }

    // Primero la membresia: si la base la rechaza (por ejemplo, la ficha
    // tiene expediente de otra persona, 0035), no se toca la contraseña.
    const { error: activarError } = await adminClient
      .from('tenant_members')
      .update({ active: true, invited_at: null, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('user_id', existente.id);
    if (activarError) return json({ error: activarError.message }, 400);

    if (aqui!.therapist_id) {
      const { error: fichaError } = await adminClient
        .from('therapists')
        .update({ user_id: existente.id, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('id', aqui!.therapist_id);
      if (fichaError) return json({ error: fichaError.message }, 400);
    }

    const temporalNueva = generarTemporal();
    const caducaNueva = caducidadTemporal();

    // app_metadata se REEMPLAZA, no se fusiona, asi que se parte del que
    // el usuario ya tiene. Fabricar uno nuevo le borraria sus otras
    // claves — el mismo defecto que qa-check vigila en sync-doctor-access.
    const metaPrevio = (existente.app_metadata ?? {}) as Record<string, unknown>;
    const membresias = { ...((metaPrevio.memberships ?? {}) as Record<string, string>), [tenantId]: aqui!.role };
    const fichas = { ...((metaPrevio.therapist_ids ?? {}) as Record<string, string>) };
    if (aqui!.therapist_id) fichas[tenantId] = aqui!.therapist_id;

    const { error: claveError } = await adminClient.auth.admin.updateUserById(existente.id, {
      password: temporalNueva,
      // Si se le invito por correo y nunca abrio el enlace, su correo sigue
      // sin confirmar y Supabase no la dejaria entrar con la temporal. Es
      // una cuenta que esta clinica creo y nadie ha usado
      // (puedeRegenerarTemporal): confirmarla es lo que hacia el alta con
      // temporal desde el principio.
      email_confirm: true,
      app_metadata: {
        ...metaPrevio,
        memberships: membresias,
        therapist_ids: fichas,
        must_change_password: true,
        temp_expires_at: caducaNueva,
      },
    });
    if (claveError) return json({ error: claveError.message }, 400);

    return json({ estado: 'temporal', email, temporal: temporalNueva, caduca: caducaNueva });
  }

  if (existente) {
    const { error: invitarError } = await callerClient.rpc('set_tenant_member_role', {
      p_email: email,
      p_role: role,
      p_therapist_id: therapistId,
    });
    if (invitarError) return json({ error: invitarError.message }, 400);
    return json({ estado: 'invitado' });
  }

  // Cuenta nueva.
  //
  // Los dos metodos dejan el MISMO app_metadata (metadatosDeAlta): la
  // cuenta nace encerrada (must_change_password) hasta que su titular
  // pone contraseña. Por correo eso importa doble: si el enlace aterriza
  // en la portada y no en /set-password (sin ALLOWED_REDIRECT_ORIGINS se
  // usa el Site URL), App ve el flag y abre "Crear contraseña" igual.
  // Y deja created_by_tenant, asi que si el correo no llega el dueño
  // puede pasar al plan B (puedeRegenerarTemporal) mientras no haya
  // entrado.
  const caducidad = caducidadTemporal();
  const metadatos = metadatosDeAlta({ tenantId, role, therapistId, caducidad });
  let temporal: string | null = null;
  let nuevoId: string | undefined;

  if (metodo === 'correo') {
    const destino = destinoPermitido(body.redirectTo);
    if (destino.error) return json({ error: destino.error }, 400);
    const { data: invitado, error: invitarError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: destino.url,
    });
    if (invitarError) {
      return json({ error: `No se pudo enviar el correo de invitacion: ${invitarError.message}. Prueba con la contraseña temporal.` }, 400);
    }
    nuevoId = invitado?.user?.id;
    if (!nuevoId) return json({ error: 'No se pudo crear la cuenta.' }, 500);
    // inviteUserByEmail no acepta app_metadata: se pone enseguida. Si
    // fallara, la cuenta se deshace — sin membresias ni flag seria una
    // cuenta suelta que ademas bloquea el correo.
    const { error: metaError } = await adminClient.auth.admin.updateUserById(nuevoId, { app_metadata: metadatos });
    if (metaError) {
      await adminClient.auth.admin.deleteUser(nuevoId);
      return json({ error: metaError.message }, 400);
    }
  } else {
    // email_confirm: true porque el correo NO participa en este metodo —
    // la contraseña se entrega en mano. Sin esto la cuenta quedaria
    // esperando una confirmacion que nadie va a mandar.
    temporal = generarTemporal();
    const { data: creado, error: crearError } = await adminClient.auth.admin.createUser({
      email,
      password: temporal,
      email_confirm: true,
      app_metadata: metadatos,
    });
    if (crearError) return json({ error: crearError.message }, 400);
    nuevoId = creado?.user?.id;
    if (!nuevoId) return json({ error: 'No se pudo crear la cuenta.' }, 500);
  }

  // La membresia nace ACTIVA: la cuenta existe porque esta clinica la
  // creo (por correo o con temporal), asi que no hay a quien pedirle
  // consentimiento. Lo que la contiene es el flag, no el active.
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

  if (metodo === 'correo') return json({ estado: 'correo', email });

  // La temporal viaja UNA vez, aqui. No se guarda en ningun sitio ni se
  // vuelve a poder consultar: si se pierde, se regenera.
  return json({ estado: 'creado', email, temporal, caduca: caducidad });
};

// A donde manda el boton del correo. Misma regla que sync-doctor-access:
// sin ALLOWED_REDIRECT_ORIGINS se falla CERRADO (se ignora lo que mande el
// cliente y Supabase usa el Site URL); con lista, solo esos origenes.
const destinoPermitido = (crudo: unknown): { url?: string; error?: string } => {
  if (crudo === undefined || crudo === null || crudo === '') return {};
  if (typeof crudo !== 'string') return { error: 'redirectTo invalido.' };
  const permitidos = (Deno.env.get('ALLOWED_REDIRECT_ORIGINS') ?? '')
    .split(',').map((v) => v.trim()).filter(Boolean);
  let url: URL;
  try {
    url = new URL(crudo);
  } catch {
    return { error: 'redirectTo no es una URL valida.' };
  }
  if (!permitidos.length) return {};
  if (!permitidos.includes(url.origin)) return { error: 'redirectTo no esta permitido.' };
  return { url: url.toString() };
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
