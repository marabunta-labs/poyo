-- Esquema `poyo` completo (estado actual). Copia de marabunta-db/sql/50_poyo.sql (repo privado, fuente de verdad de la base compartida):
-- si cambias uno, cambia el otro. Para un proyecto de Supabase propio: ejecútalo en el SQL Editor y pon la contraseña de poyo_app aparte
-- (alter role poyo_app with password '…'); ver el README. Necesita auth.users y storage (los trae Supabase).
create schema if not exists poyo;

-- Poyo: perfiles, sitios, reseñas, amistades y denuncias. Se ejecuta como propietario (postgres).
-- Las cuentas son las de Supabase Auth (cuenta Marabunta Labs); aquí solo hay el perfil público de Poyo.
-- El servidor de Poyo entra con el rol poyo_app, que SOLO ve este esquema (no ve auth ni las otras apps).
begin;

create table if not exists poyo.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.-]{3,20}$'),
  bio text not null default '' check (char_length(bio) <= 200),
  avatar text not null default '',            -- ruta en el bucket poyo-photos ('' = sin foto)
  is_seed boolean not null default false,     -- cuenta de ejemplo (datos demo, scripts/seed-demo.js): la app la marca como «demo»
  created_at timestamptz not null default now()
);
create unique index if not exists poyo_profiles_username_key on poyo.profiles (lower(username));

create table if not exists poyo.places (
  id text primary key check (id ~ '^(osm-[wr]?[0-9]+|u-[a-z0-9]+)$'),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  name text not null default '',
  type text not null default 'bench' check (type in ('bench', 'picnic', 'wall', 'other', 'fountain', 'shop')),
  created_by uuid references poyo.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists poyo_places_lat_lng on poyo.places (lat, lng);

create table if not exists poyo.reviews (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references poyo.places(id) on delete cascade,
  user_id uuid not null references poyo.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  ratings jsonb not null default '{}' check (jsonb_typeof(ratings) = 'object'),   -- nota por criterio ({"views":4}); claves y tipo los valida el servidor
  text text not null default '' check (char_length(text) <= 600),
  photos text[] not null default '{}' check (cardinality(photos) <= 3),   -- rutas en poyo-photos
  created_at timestamptz not null default now(),
  unique (place_id, user_id)
);
create index if not exists poyo_reviews_user on poyo.reviews (user_id, created_at desc);
create index if not exists poyo_reviews_place on poyo.reviews (place_id);
create index if not exists poyo_reviews_recent on poyo.reviews (created_at desc);

create table if not exists poyo.friendships (
  from_id uuid not null references poyo.profiles(id) on delete cascade,
  to_id uuid not null references poyo.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
-- una sola relación por pareja, en cualquier sentido
create unique index if not exists poyo_friendships_pair on poyo.friendships (least(from_id, to_id), greatest(from_id, to_id));
create index if not exists poyo_friendships_to on poyo.friendships (to_id);

create table if not exists poyo.reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references poyo.reviews(id) on delete cascade,
  by_id uuid not null references poyo.profiles(id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (review_id, by_id)
);

-- Fotos de las que nadie se ocupó al borrar (moderación, cuentas borradas): se purgan con scripts/purge-photos.js
create table if not exists poyo.photo_trash (
  path text primary key,
  created_at timestamptz not null default now()
);

-- Fotos: bucket público de lectura; cada persona solo puede escribir/borrar bajo su propia carpeta (<uid>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('poyo-photos', 'poyo-photos', true, 524288, array['image/jpeg'])
  on conflict (id) do update set public = true, file_size_limit = 524288, allowed_mime_types = array['image/jpeg'];
drop policy if exists "poyo photos: subir en tu carpeta" on storage.objects;
create policy "poyo photos: subir en tu carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'poyo-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "poyo photos: borrar de tu carpeta" on storage.objects;
create policy "poyo photos: borrar de tu carpeta" on storage.objects for delete to authenticated
  using (bucket_id = 'poyo-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Rol del servidor: solo el esquema poyo. La contraseña se pone aparte (ver README), nunca en este fichero.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'poyo_app') then create role poyo_app login; end if;
end $$;
revoke all on schema public from poyo_app;
grant usage on schema poyo to poyo_app;
grant select, insert, update, delete on all tables in schema poyo to poyo_app;
alter default privileges in schema poyo grant select, insert, update, delete on tables to poyo_app;
alter table poyo.profiles enable row level security;   -- sin políticas: la API REST de Supabase no ve nada de Poyo
alter table poyo.places enable row level security;
alter table poyo.reviews enable row level security;
alter table poyo.friendships enable row level security;
alter table poyo.reports enable row level security;
alter table poyo.photo_trash enable row level security;
create policy poyo_app_all on poyo.profiles for all to poyo_app using (true) with check (true);
create policy poyo_app_all on poyo.places for all to poyo_app using (true) with check (true);
create policy poyo_app_all on poyo.reviews for all to poyo_app using (true) with check (true);
create policy poyo_app_all on poyo.friendships for all to poyo_app using (true) with check (true);
create policy poyo_app_all on poyo.reports for all to poyo_app using (true) with check (true);
create policy poyo_app_all on poyo.photo_trash for all to poyo_app using (true) with check (true);

commit;
