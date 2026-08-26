-- FLORY - Copia el nombre preferido de Auth a profiles.display_name.
-- Aplicar despues de security.sql. El metadata es solo presentacional: nunca se usa
-- para autorizacion, plan, RLS ni decisiones de seguridad.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display_name text;
begin
  v_display_name := nullif(
    trim(
      coalesce(
        new.raw_user_meta_data ->> 'display_name',
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
      )
    ),
    ''
  );

  insert into public.profiles (
    id,
    email,
    display_name,
    founding_user
  ) values (
    new.id,
    new.email,
    v_display_name,
    now() < '2026-12-01'::timestamptz
  );

  return new;
end;
$$;

-- Una funcion de trigger no debe aparecer como RPC publica.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Aprovecha nombres que ya existan en metadata (por ejemplo, proveedores sociales).
-- Las cuentas creadas antes de pedir nombre y sin metadata quedan en null y podran
-- completarlo desde Perfil.
update public.profiles p
set display_name = nullif(
  trim(
    coalesce(
      u.raw_user_meta_data ->> 'display_name',
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      ''
    )
  ),
  ''
)
from auth.users u
where u.id = p.id
  and p.display_name is null
  and nullif(
    trim(
      coalesce(
        u.raw_user_meta_data ->> 'display_name',
        u.raw_user_meta_data ->> 'full_name',
        u.raw_user_meta_data ->> 'name',
        ''
      )
    ),
    ''
  ) is not null;

commit;
