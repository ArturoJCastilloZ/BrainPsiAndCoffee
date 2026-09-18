import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Las decisiones de identidad viven fuera para poder probarlas: a quien se
// considera el mismo usuario, y que se le escribe encima. Ver identity.mjs.
import {
  matchDoctorUser,
  buildIdentityUpdate,
  canRecreateUnconfirmedUser,
  invitedUserFrom,
  normalizeEmail,
} from './identity.mjs';

type TherapistPayload = {
  id: string;
  name: string;
  email?: string;
  active?: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-tenant-id va aqui porque es un header PERSONALIZADO: el navegador
  // manda un preflight OPTIONS antes de la llamada real y lo rechaza si
  // no esta en esta lista. La funcion nunca llegaria a ejecutarse.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
};

Deno.serve(async (req) => {
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
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return json({ error: 'No autenticado.' }, 401);
  }

  // La clinica sobre la que se opera la manda el cliente, pero no se le
  // cree: tiene que ser una membresia real del llamante, con rol de
  // administracion. Sin esto, un admin de una clinica podria dar de alta
  // doctores en otra.
  const tenantId = req.headers.get('x-tenant-id') || '';
  const memberships = (callerData.user.app_metadata?.memberships || {}) as Record<string, string>;
  const callerRole = memberships[tenantId];

  if (!tenantId || !['owner', 'admin_consultorio'].includes(callerRole)) {
    return json({ error: 'No tienes permisos de administracion en esa clinica.' }, 403);
  }

  // El payload llega de un cliente y termina escrito en app_metadata de
  // usuarios reales: se valida forma y contenido antes de tocar nada.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo invalido: se esperaba JSON.' }, 400);
  }

  const rawTherapists = (body as { therapists?: unknown })?.therapists;
  if (rawTherapists !== undefined && !Array.isArray(rawTherapists)) {
    return json({ error: 'therapists debe ser un arreglo.' }, 400);
  }
  if (Array.isArray(rawTherapists) && rawTherapists.length > 200) {
    return json({ error: 'Demasiados terapeutas en una sola peticion.' }, 400);
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const therapists: TherapistPayload[] = [];
  for (const entry of (rawTherapists ?? []) as Record<string, unknown>[]) {
    if (!entry || typeof entry !== 'object') {
      return json({ error: 'Cada terapeuta debe ser un objeto.' }, 400);
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const email = typeof entry.email === 'string' ? entry.email.trim().toLowerCase() : '';
    if (!id || id.length > 64) {
      return json({ error: 'id de terapeuta invalido.' }, 400);
    }
    if (name.length > 120) {
      return json({ error: `Nombre demasiado largo para ${id}.` }, 400);
    }
    if (email && !emailPattern.test(email)) {
      return json({ error: `Correo invalido para ${id}.` }, 400);
    }
    therapists.push({ id, name, email, active: entry.active !== false });
  }

  // redirectTo se pasa a la invitacion por correo: solo se aceptan destinos
  // propios, para que no pueda usarse como redireccion abierta.
  const rawRedirect = (body as { redirectTo?: unknown })?.redirectTo;
  let redirectTo: string | undefined;
  if (rawRedirect !== undefined) {
    if (typeof rawRedirect !== 'string') {
      return json({ error: 'redirectTo invalido.' }, 400);
    }
    const allowedOrigins = (Deno.env.get('ALLOWED_REDIRECT_ORIGINS') ?? '')
      .split(',').map((value) => value.trim()).filter(Boolean);
    let parsed: URL;
    try {
      parsed = new URL(rawRedirect);
    } catch {
      return json({ error: 'redirectTo no es una URL valida.' }, 400);
    }
    if (allowedOrigins.length && !allowedOrigins.includes(parsed.origin)) {
      return json({ error: 'redirectTo no esta permitido.' }, 400);
    }
    redirectTo = parsed.toString();
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const activeDoctorIds = new Set(
    therapists.filter((item) => item.active !== false && item.email).map((item) => item.id)
  );

  const users = await listAllUsers(adminClient);
  // Doctores DE ESTA clinica. El mismo usuario puede ser doctor aqui y
  // administrador en otra: lo que importa es su rol en este tenant.
  const doctorUsers = users.filter(
    (user) => (user.app_metadata?.memberships || {})[tenantId] === 'doctor'
  );

  for (const therapist of therapists) {
    if (therapist.active === false || !therapist.email) continue;

    const normalizedEmail = normalizeEmail(therapist.email);
    const { user: existing, matchedBy } = matchDoctorUser(doctorUsers, therapist, tenantId);

    if (existing) {
      // Las otras clinicas se resuelven UNA vez y deciden las dos cosas:
      // si se puede destruir la cuenta, y si se puede reescribir el correo.
      const otherTenants = await otherTenantsFromDb(adminClient, existing.id, tenantId);

      // A una invitacion que nadie acepto no se le puede corregir el
      // correo —el enlace ya salio a la direccion vieja—, asi que borrar y
      // reinvitar es lo unico que funciona. Pero deleteUser NO esta
      // acotado por tenant y profiles.user_id es on delete cascade: con un
      // doctor de dos consultorios, esto destruia su cuenta y su membresia
      // en el otro. Solo procede si no pertenece a ninguna otra clinica.
      if (canRecreateUnconfirmedUser({ user: existing, otherTenants })) {
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(existing.id);
        if (deleteError) throw deleteError;
        await inviteDoctor(adminClient, tenantId, therapist, normalizedEmail, redirectTo);
        continue;
      }

      // Si se nego, no se queda sin hacer nada: se concede la membresia
      // por la via normal, que ya sabe no tocar la identidad. La cuenta
      // sigue sin confirmar —un estado legitimo— y nadie pierde su acceso.
      await grantMembership(adminClient, existing, tenantId, therapist, matchedBy, otherTenants);
      await setTherapistUser(adminClient, tenantId, therapist.id, existing.id);
      continue;
    }

    await inviteDoctor(adminClient, tenantId, therapist, normalizedEmail, redirectTo);
  }

  for (const user of doctorUsers) {
    const therapistId = (user.app_metadata?.therapist_ids || {})[tenantId];
    if (!therapistId || activeDoctorIds.has(therapistId)) continue;

    // Antes esto borraba al usuario entero. Con varias clinicas seria
    // destructivo: dar de baja a un psiquiatra en un consultorio le
    // quitaria tambien el acceso a los otros, e incluso su cuenta. Se
    // revoca solo la membresia de ESTA clinica.
    await revokeMembership(adminClient, user, tenantId);
    await adminClient
      .from('therapists')
      .update({ user_id: null })
      .eq('tenant_id', tenantId)
      .eq('id', therapistId);
  }

  return json({ ok: true });
});

const json = (body: unknown, status = 200) => (
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
);

// Las clinicas del usuario que no son esta, preguntadas a tenant_members
// y NO a app_metadata.
//
// El nombre dice de donde sale el dato a proposito: identity.mjs exporta
// un otherTenantsOf que lee el CLAIM, y es justo el que no debe decidir
// nada. Dos funciones con el mismo nombre, una segura y otra no, es como
// se cuela el error de vuelta.
//
// El claim es la cache de esta tabla. Si una escritura de claim falla, el
// usuario sigue siendo miembro de la otra clinica aqui mientras su claim
// ya no lo dice — y los dos permisos que cuelgan de este dato (destruir la
// cuenta, reescribir el correo) se abririan solos. Lanza en vez de
// devolver vacio: no poder confirmar no es permiso.
const otherTenantsFromDb = async (
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  tenantId: string,
): Promise<string[]> => {
  // SIN filtrar por active.
  //
  // Una membresia inactiva sigue siendo una relacion con otra clinica. La
  // pregunta que decide si se puede destruir o renombrar una identidad
  // compartida es "¿existe algun vinculo con otra clinica?", no "¿esta
  // activo?". Filtrando por active, una baja logica devolvia [] y abria
  // sola las dos operaciones destructivas — sin tocar una linea del guard.
  //
  // Hoy nadie escribe active=false (las dos revocaciones hacen delete),
  // asi que no era explotable; pero la columna existe desde 0001 y el dia
  // que alguien implemente baja logica el permiso se abriria solo. Fallar
  // cerrado aqui no cuesta nada: el peor caso es que un admin no pueda
  // corregir un correo y tenga que usar el flujo verificado.
  const { data, error } = await adminClient
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .neq('tenant_id', tenantId);
  if (error) throw error;
  return (data ?? []).map((row) => row.tenant_id);
};

const listAllUsers = async (adminClient: ReturnType<typeof createClient>) => {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...(data.users || []));
    if ((data.users || []).length < perPage) break;
    page += 1;
  }

  return users;
};

const setTherapistUser = async (
  adminClient: ReturnType<typeof createClient>,
  tenantId: string,
  therapistId: string,
  userId: string,
) => {
  // El id de terapeuta solo es unico dentro de su clinica: sin filtrar
  // por tenant, esto tocaria la fila homonima de otra.
  const { error } = await adminClient
    .from('therapists')
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', therapistId);
  if (error) throw error;
};

// Las membresias se FUSIONAN, nunca se reemplazan: pisar app_metadata
// dejaria a un psiquiatra que trabaja en dos consultorios sin acceso al
// otro. tenant_members es la fuente de verdad y el claim su cache, asi
// que se escriben los dos y en ese orden.
const grantMembership = async (
  adminClient: ReturnType<typeof createClient>,
  user: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
  tenantId: string,
  therapist: TherapistPayload,
  matchedBy: string | null,
  otherTenants: string[],
) => {
  const { error } = await adminClient.from('tenant_members').upsert({
    tenant_id: tenantId,
    user_id: user.id,
    role: 'doctor',
    therapist_id: therapist.id,
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,user_id' });
  if (error) throw error;

  // buildIdentityUpdate decide si el correo de login entra en el payload.
  // No entra cuando el usuario tambien pertenece a otra clinica: ese
  // correo es su acceso alla tambien, y esta clinica no manda sobre el.
  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    user.id,
    buildIdentityUpdate({ user, tenantId, therapist, matchedBy, otherTenants }),
  );
  // El cliente admin DEVUELVE el error, no lo lanza. Ignorarlo dejaba al
  // usuario dado de alta en tenant_members con el claim sin actualizar:
  // un desfase que no es cosmetico, porque de ese claim colgaba el
  // permiso de reescribir correos.
  if (updateError) throw updateError;
};

const revokeMembership = async (
  adminClient: ReturnType<typeof createClient>,
  user: { id: string; app_metadata?: Record<string, unknown> },
  tenantId: string,
) => {
  const appMeta = (user.app_metadata || {}) as Record<string, unknown>;
  const memberships = { ...((appMeta.memberships || {}) as Record<string, string>) };
  const therapistIds = { ...((appMeta.therapist_ids || {}) as Record<string, string>) };
  delete memberships[tenantId];
  delete therapistIds[tenantId];

  const { error } = await adminClient
    .from('tenant_members')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id);
  if (error) throw error;

  // Mismo motivo que en grantMembership: el cliente admin devuelve el
  // error en vez de lanzarlo. Una revocacion que falla sin avisar deja el
  // claim diciendo que la persona sigue siendo doctora de esta clinica.
  const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: { ...appMeta, memberships, therapist_ids: therapistIds },
  });
  if (updateError) throw updateError;
};

const inviteDoctor = async (
  adminClient: ReturnType<typeof createClient>,
  tenantId: string,
  therapist: TherapistPayload,
  normalizedEmail: string,
  redirectTo?: string,
) => {
  const created = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
    data: { name: therapist.name, therapist_id: therapist.id },
    redirectTo,
  });

  if (created.error) throw created.error;

  // El usuario REAL que devolvio la invitacion. Antes se fabricaba aqui un
  // objeto con app_metadata: {} dando por hecho que invitar siempre crea a
  // alguien nuevo; si el correo ya pertenecia a un usuario sin confirmar,
  // GoTrue devuelve al existente y ese objeto vacio le borraba las
  // membresias de sus otras clinicas.
  const invited = invitedUserFrom(created);
  if (!invited) return;

  // Y por lo mismo, sus otras clinicas se PREGUNTAN. El comentario que
  // habia aqui afirmaba que un recien invitado no pertenece a ninguna
  // otra: era una suposicion escrita como hecho, y es justo la que
  // rompia.
  const otherTenants = await otherTenantsFromDb(adminClient, invited.id, tenantId);

  // matchedBy en null: se llego por correo, no por ficha, asi que no hay
  // renombrado de identidad que autorizar.
  await grantMembership(adminClient, invited, tenantId, therapist, null, otherTenants);
  await setTherapistUser(adminClient, tenantId, therapist.id, invited.id);
};
