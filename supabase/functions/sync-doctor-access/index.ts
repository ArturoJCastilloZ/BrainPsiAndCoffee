import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type TherapistPayload = {
  id: string;
  name: string;
  email?: string;
  active?: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  if (callerError || callerData.user?.app_metadata?.role !== 'admin') {
    return json({ error: 'Only admins can sync doctor access.' }, 403);
  }

  const { therapists = [], redirectTo } = await req.json() as { therapists: TherapistPayload[]; redirectTo?: string };
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const activeDoctorIds = new Set(
    therapists.filter((item) => item.active !== false && item.email).map((item) => item.id)
  );

  const users = await listAllUsers(adminClient);
  const doctorUsers = users.filter((user) => user.app_metadata?.role === 'doctor');

  for (const therapist of therapists) {
    if (therapist.active === false || !therapist.email) continue;

    const normalizedEmail = therapist.email.trim().toLowerCase();
    const existing = doctorUsers.find((user) =>
      user.email?.toLowerCase() === normalizedEmail ||
      user.app_metadata?.therapist_id === therapist.id
    );

    if (existing) {
      if (!existing.confirmed_at) {
        await adminClient.auth.admin.deleteUser(existing.id);
        await inviteDoctor(adminClient, therapist, normalizedEmail, redirectTo);
        continue;
      }

      await adminClient.auth.admin.updateUserById(existing.id, {
        email: normalizedEmail,
        user_metadata: { ...(existing.user_metadata || {}), name: therapist.name, therapist_id: therapist.id },
        app_metadata: { ...(existing.app_metadata || {}), role: 'doctor', therapist_id: therapist.id },
      });
      await setTherapistUser(adminClient, therapist.id, existing.id);
      continue;
    }

    await inviteDoctor(adminClient, therapist, normalizedEmail, redirectTo);
  }

  for (const user of doctorUsers) {
    const therapistId = user.app_metadata?.therapist_id;
    if (therapistId && !activeDoctorIds.has(therapistId)) {
      await adminClient.auth.admin.deleteUser(user.id);
      await adminClient.from('therapists').update({ user_id: null }).eq('id', therapistId);
    }
  }

  return json({ ok: true });
});

const json = (body: unknown, status = 200) => (
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
);

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

const setTherapistUser = async (adminClient: ReturnType<typeof createClient>, therapistId: string, userId: string) => {
  const { error } = await adminClient
    .from('therapists')
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq('id', therapistId);
  if (error) throw error;
};

const inviteDoctor = async (
  adminClient: ReturnType<typeof createClient>,
  therapist: TherapistPayload,
  normalizedEmail: string,
  redirectTo?: string,
) => {
  const created = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
    data: { name: therapist.name, therapist_id: therapist.id },
    redirectTo,
  });

  if (created.error) throw created.error;

  const userId = created.data.user?.id;
  if (!userId) return;

  await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { role: 'doctor', therapist_id: therapist.id },
    user_metadata: { name: therapist.name, therapist_id: therapist.id },
  });
  await setTherapistUser(adminClient, therapist.id, userId);
};
