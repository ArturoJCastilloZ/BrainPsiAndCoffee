-- ============================================================
-- 0020 · El resolutor de la pantalla de acceso deja de ser un
--        directorio de toda la plataforma
--
-- resolve_login_identifier traduce "nombre o correo" a un correo para que
-- el doctor pueda entrar escribiendo su nombre. Venia del esquema base y
-- su cuerpo no mencionaba el tenant ni una vez:
--
--   select email from public.therapists
--   where active = true and email is not null
--     and (lower(email) = lower(identifier) or lower(name) = lower(identifier))
--   limit 1;
--
-- Es security definer —bypasea RLS por definicion— y tiene execute para
-- authenticated. Es decir: una LECTURA autorizada por pertenecer a UNA
-- clinica cayendo sobre el directorio de terapeutas de TODAS, y
-- devolviendo therapists.email, exactamente la columna que la Fase 1 saco
-- de la exposicion publica ("NUNCA agregar email, cedula ni user_id").
-- Cualquier usuario con sesion —un barista sirve— podia ir tirando
-- nombres y cosechar el correo de login de los terapeutas de los demas
-- consultorios: la materia prima de un phishing dirigido.
--
-- La migracion 0004 ya la habia marcado para revisar "cuando exista el
-- selector de clinica". El selector existe desde la Fase 2.
--
-- Se acota con current_tenant_id() y NO con current_request_tenant().
-- La diferencia es la que importa: current_request_tenant() devuelve el
-- header tal cual, sin verificar nada, asi que acotar con el no cerraria
-- nada — bastaria apuntar x-tenant-id a la clinica ajena.
-- current_tenant_id() exige que esa clinica este entre las membresias del
-- JWT, que solo service_role escribe.
--
-- Efecto colateral conocido y ACEPTADO: para anon, current_tenant_id() es
-- null y la funcion devuelve null. La pantalla de acceso llama con anon,
-- asi que "entrar con el nombre" sigue sin funcionar — pero ya no
-- funcionaba: el execute nunca se otorgo a anon y authService se traga el
-- error. Conceder anon para revivir la funcion REABRIRIA esta fuga, y sin
-- sesion, o sea peor. Si se quiere la funcion, es una decision aparte y
-- necesita otro diseno.
-- ============================================================

create or replace function public.resolve_login_identifier(identifier text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant text;
  v_email  text;
  v_n      integer;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then
    return null;
  end if;

  -- Se cuenta ANTES de elegir. El 'limit 1' sin order by que habia antes
  -- devolvia una fila arbitraria: con dos terapeutas homonimos —un
  -- apellido comun basta— mandaba al usuario al correo de otra persona.
  -- Es la misma trampa que set_tenant_member_role cerro con into strict.
  -- Ambiguo se trata como no encontrado: la pantalla pide el correo
  -- completo, que no es ambiguo.
  select count(*), min(t.email)
    into v_n, v_email
  from public.therapists t
  where t.tenant_id = v_tenant
    and t.active = true
    and t.email is not null
    and (lower(t.email) = lower(identifier) or lower(t.name) = lower(identifier));

  if v_n <> 1 then
    return null;
  end if;

  return v_email;
end $$;

-- El execute se deja como estaba: authenticated si, anon no. Ver la nota
-- de arriba sobre por que conceder anon empeoraria las cosas.
revoke all on function public.resolve_login_identifier(text) from public;
revoke all on function public.resolve_login_identifier(text) from anon;
grant execute on function public.resolve_login_identifier(text) to authenticated;

comment on function public.resolve_login_identifier(text) is
  'Resuelve nombre o correo al correo de un terapeuta DE LA CLINICA ACTIVA. Devuelve null si no hay clinica resuelta, si no hay coincidencia, o si hay mas de una.';
