-- ============================================================
-- 0033 · Contraseña temporal: quien no la ha cambiado no puede hacer nada
--
-- El dueño da de alta al personal desde Accesos con una contraseña
-- temporal, y la persona la cambia al entrar por primera vez. El correo
-- de invitacion de Supabase no es una opcion: su SMTP por defecto esta
-- limitado a unos pocos envios por hora y en esta instalacion no llego
-- ninguno.
--
-- ------------------------------------------------------------
-- EL PROBLEMA QUE ESTO CREA, Y POR QUE HAY QUE CERRARLO EN LA BASE
--
-- Con contraseña temporal el dueño CONOCE la contraseña de esa persona.
-- Entre que la crea y ella la cambia, puede entrar como ella — y lo que
-- haga quedaria en audit_log a nombre de ella. En un expediente que
-- NOM-024 obliga a poder auditar, eso rompe la atribucion: una nota
-- firmada por la doctora pudo escribirla quien le dio de alta.
--
-- La ventana no se puede eliminar, pero si reducir a nada util: mientras
-- la contraseña temporal siga vigente, esa sesion no puede hacer NADA
-- salvo cambiarla. Y eso tiene que imponerlo la base, no la pantalla.
--
-- ------------------------------------------------------------
-- 1 · EL BLOQUEO, EN UN SOLO SITIO
--
-- Medido contra el desechable antes de escribirlo: 40 policies y 10
-- funciones cuelgan de current_tenant_id(). Devolver null ahi las apaga
-- todas de una vez, sin tocar ninguna.
--
-- Con el flag puesto, el mismo dueño sobre los mismos datos:
--
--     sin flag -> tenant t_tmp · rol owner · pacientes 1 · citas 1
--     con flag -> tenant NULL  · rol ""    · pacientes 0 · citas 0
--     al quitarlo -> pacientes 1  (no queda roto)
--
-- Cambiar la contraseña NO pasa por RLS, asi que eso si lo puede hacer:
-- queda encerrado exactamente en la unica accion que necesita.
-- ============================================================

create or replace function public.current_tenant_id()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    -- Mientras deba cambiar la contraseña temporal no hay clinica activa,
    -- y sin clinica activa no hay rol, y sin rol las policies niegan todo.
    when coalesce((auth.jwt() -> 'app_metadata' ->> 'must_change_password')::boolean, false)
      then null
    when auth.jwt() -> 'app_metadata' -> 'memberships' ? public.requested_tenant()
      then public.requested_tenant()
    else null
  end;
$$;

comment on function public.current_tenant_id() is
  'La clinica activa de la peticion, o null. Devuelve null mientras el usuario deba cambiar su contraseña temporal: es el unico punto por el que pasan las 40 policies y las 10 funciones que dependen del tenant, asi que bloquear aqui bloquea todo.';

-- ------------------------------------------------------------
-- 2 · QUITAR EL FLAG SIN PODER MENTIR
--
-- Si el flag lo quitara una RPC que el cliente llama, cualquiera podria
-- llamarla SIN haber cambiado nada. Aqui se quita cuando cambia
-- encrypted_password, que es el efecto y no el relato.
--
-- Funciona venga el cambio por donde venga: la app, un correo de
-- recuperacion, o el panel de Supabase.
--
-- 'before' y modificando NEW: sin recursion y en la misma escritura.
-- ------------------------------------------------------------
create or replace function public.clear_password_change_flag()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expira timestamptz;
  v_nueva  timestamptz;
begin
  -- Solo cuando la contraseña cambia DE VERDAD. Sin esto, cualquier
  -- escritura sobre auth.users -conceder una membresia, por ejemplo-
  -- limpiaria el flag y la persona entraria sin haber cambiado nada.
  if old.encrypted_password is not distinct from new.encrypted_password then
    return new;
  end if;

  if not coalesce((old.raw_app_meta_data ->> 'must_change_password')::boolean, false) then
    return new;
  end if;

  v_expira := nullif(old.raw_app_meta_data ->> 'temp_expires_at', '')::timestamptz;
  v_nueva  := nullif(new.raw_app_meta_data ->> 'temp_expires_at', '')::timestamptz;

  -- Una temporal caducada no sirve para estrenar cuenta. Sin esto, la
  -- que quedo apuntada en un papel hace tres meses sigue valiendo.
  if v_expira is not null and v_expira < now()
     and (v_nueva is null or v_nueva <= now()) then
    raise exception 'La contraseña temporal caduco. Pide al dueño de la clinica que genere una nueva.';
  end if;

  -- Si esta misma escritura MUEVE la caducidad, es el dueño regenerando:
  -- el flag se conserva porque la persona sigue debiendo cambiarla. Sin
  -- esta rama, regenerar desbloquearia la cuenta.
  --
  -- La condicion es que la caducidad CAMBIE, no que sea futura. Un cambio
  -- normal de contraseña deja temp_expires_at intacto y por tanto
  -- tambien futuro, asi que 'v_nueva > now()' a secas tomaba por
  -- regeneracion el caso que esta funcion existe para atender, y la
  -- persona se quedaba encerrada despues de cambiarla. Lo encontro
  -- tests/tenancy/0024, no la lectura.
  if v_nueva is distinct from v_expira and v_nueva is not null and v_nueva > now() then
    return new;
  end if;

  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
                           - 'must_change_password' - 'temp_expires_at';
  return new;
end $$;

drop trigger if exists clear_password_change_flag on auth.users;
create trigger clear_password_change_flag
  before update on auth.users
  for each row execute function public.clear_password_change_flag();

comment on function public.clear_password_change_flag() is
  'Quita must_change_password cuando encrypted_password cambia de verdad. Anclado al EFECTO y no a que alguien diga que lo hizo: una RPC que el cliente llamara se podria invocar sin cambiar nada. Rechaza el cambio si la temporal caduco, y conserva el flag cuando el dueño regenera.';
