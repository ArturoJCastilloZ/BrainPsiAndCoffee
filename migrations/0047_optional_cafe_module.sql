-- Per-clinic module flag in the existing settings document. Missing means
-- enabled for compatibility. Old clients cannot remove an explicit flag.
create function public.validate_cafe_module_setting()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(new.content) is distinct from 'object' then
    raise exception using errcode='23514', message='La configuración del negocio debe ser un objeto.';
  end if;
  if new.content ? 'cafeEnabled' then
    if jsonb_typeof(new.content->'cafeEnabled') is distinct from 'boolean' then
      raise exception using errcode='23514', message='La opción de cafetería debe ser verdadera o falsa.';
    end if;
  elsif tg_op = 'UPDATE' and old.content ? 'cafeEnabled' then
    new.content := new.content || jsonb_build_object('cafeEnabled', old.content->'cafeEnabled');
  end if;
  return new;
end $$;
create trigger validate_cafe_module_setting before insert or update of content
on public.business_settings for each row execute function public.validate_cafe_module_setting();

-- Narrow trigger-only definer: read the flag for NEW.tenant_id and enforce
-- new writes. Table RLS still authorizes the original operation separately.
create function public.enforce_cafe_module()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_enabled boolean := true;
begin
  select not (coalesce(content,'{}'::jsonb) @> '{"cafeEnabled":false}'::jsonb)
    into v_enabled from public.business_settings
    where tenant_id=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end
    for share;
  if coalesce(v_enabled,true) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name = 'appointments' then
    if tg_op = 'INSERT' then
      new.wants_coffee := false;
    elsif new.wants_coffee is distinct from old.wants_coffee then
      new.wants_coffee := false;
    end if;
    return new;
  end if;
  raise exception using errcode='23514', message='La cafetería está desactivada en esta clínica. No se pueden crear, borrar ni modificar productos de pedidos.';
end $$;
revoke all on function public.enforce_cafe_module() from public, anon, authenticated;
create trigger a0_cafe_module before insert or delete on public.orders
for each row execute function public.enforce_cafe_module();
create trigger a0_cafe_module before insert or update or delete on public.order_items
for each row execute function public.enforce_cafe_module();
create trigger a0_cafe_module before insert or update of wants_coffee on public.appointments
for each row execute function public.enforce_cafe_module();
