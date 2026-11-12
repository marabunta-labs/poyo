# Juego de bases — diseño

Un banco (o mesa de pícnic) se convierte en la **base** de un grupo de amigos. Se conquista siendo constante y se pierde si el grupo deja de ir: no gana quien llega antes, sino quien **frecuenta**.

## Reglas

- **Grupos**: 2 a 5 personas. Una persona está en un solo grupo a la vez. El grupo tiene nombre, color y un **código de 6 caracteres**: quien lo recibe se une (así nadie entra sin querer).
- **Check-in**: desde el móvil, a menos de 40 m del banco, con la ubicación del dispositivo. Da puntos de presencia al **grupo** en ese banco.
  - Visita: **1 punto**, una vez al día por persona y banco (y 4 h de espera entre check-ins en el mismo banco).
  - Encuentro: **+1 por cada otro miembro** que haya hecho check-in en el mismo banco en la misma hora (máx. +3). Premia quedar de verdad.
  - **Banco nuevo con foto**: **+5**, una vez por banco. Hay que estar a menos de 40 m, la foto es obligatoria y no puede haber otro banco a menos de 15 m. Si lo reportan como falso, se pierde el bonus.
- **Quién manda**: el grupo con más puntos en los últimos 14 días. Cada punto pierde peso con la edad (vida media de 5 días), así que dejar de ir se nota poco a poco.
- **Conquista**: el control se guarda (`place_control`) y se reevalúa en cada check-in: otro grupo toma la base solo si supera al actual en un 20 %.
- **Solo cuentan sitios con vida**: para reclamar un banco, debe tener al menos una reseña o foto (o ser nuevo con foto, ver arriba).
- **Rankings**: grupos y usuarios con más puntos (14 días), en toda España o en la zona visible del mapa.
- **Privacidad**: nunca se muestra dónde está nadie ahora; solo qué grupo manda en un banco y cuántos puntos tiene.

## Cómo se evita el engaño

La ubicación del móvil se puede falsear; en esta versión se asume ese límite y no hay premios con valor real.

- Distancia ≤ 40 m y precisión del GPS ≤ 30 m, comprobadas en el servidor.
- Velocidad imposible entre dos check-ins consecutivos (> 150 km/h): se rechaza.
- Máximo 10 bancos distintos por persona y día.
- El check-in lo hace cada persona con su sesión; no se puede hacer «por» otra.

## Datos (esquema `poyo`)

```sql
create table poyo.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 24),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  created_by uuid not null references poyo.profiles(id),
  created_at timestamptz not null default now()
);
create unique index poyo_groups_name on poyo.groups (lower(name));

create table poyo.group_members (
  group_id uuid not null references poyo.groups(id) on delete cascade,
  user_id uuid not null unique references poyo.profiles(id) on delete cascade,   -- un grupo por persona
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table poyo.checkins (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references poyo.places(id) on delete cascade,
  user_id uuid not null references poyo.profiles(id) on delete cascade,
  group_id uuid not null references poyo.groups(id) on delete cascade,
  at timestamptz not null default now(),
  lat double precision not null, lng double precision not null, accuracy real,
  points smallint not null check (points between 1 and 9),
  kind text not null default 'visit' check (kind in ('visit', 'new_place')),
  day date not null default (now() at time zone 'Europe/Madrid')::date,
  unique (place_id, user_id, day)
);
create index poyo_checkins_place on poyo.checkins (place_id, at desc);
create index poyo_checkins_group on poyo.checkins (group_id, at desc);
```

Quién manda en cada banco se guarda en `poyo.place_control` y se reevalúa en cada check-in con la puntuación de los últimos 14 días (con el peso por edad).

## API

| Método y ruta | Qué hace |
|---|---|
| `POST /api/groups` · `POST /api/groups/join {code}` · `POST /api/groups/leave` · `GET /api/groups/mine` | crear grupo, unirse con código, salir, ver el mío |
| `POST /api/places/:id/checkin` `{lat, lng, accuracy}` | check-in; devuelve puntos ganados y quién manda |
| `GET /api/places/:id` (ya existe) | añade `control: { group, score, nextRival }` |
| `GET /api/places` (ya existe) | añade `baseColor` y `baseGroup`: el marcador lleva el aro del grupo que manda |
| `GET /api/game/ranking` | grupos y personas con más puntos (14 días) |

## Pantallas

- **Mapa**: los bancos con dueño llevan un aro del color del grupo; leyenda con los grupos cercanos.
- **Ficha del banco**: quién manda, sus puntos, cuánto le falta al segundo, y el botón **«Hacer check-in»** (activo solo cerca).
- **Pestaña Juego**: mi grupo (miembros, bases que tenemos, bases en peligro), crear/invitar, y los rankings.

## Revisión de altas y bajas de sitios

- **Alta**: el sitio nuevo se ve enseguida para quien lo crea, marcado «sin verificar»; queda verificado cuando otra persona lo confirma con ubicación y foto a menos de 40 m, o un admin lo aprueba. Estado en `poyo.places.status` (`pending` | `active` | `hidden`).
- **Baja**: botón «Ya no existe» en la ficha (`poyo.place_flags`). Con 3 reportes de personas distintas, o 1 de un admin, el sitio pasa a `hidden` (reversible, aparece en la pestaña Mod). No se borra nada de OSM.
- Límites: altas y reportes por persona y día; un sitio con base activa necesita 5 reportes.

## Fases

1. **Núcleo** *(hecho)*: grupos con código, check-in con antitrampas, puntos, control, aros en el mapa y ranking global de grupos y personas. Requiere la migración de las tablas en producción.
2. **Rankings por zona** *(hecho)*, **insignias** («Madrugador», «Rey del atardecer», «Fiel 30 días», «Explorador», en el perfil) y aviso «tu base está en peligro» (⚠️ en el botón Juego y en la lista de bases).
3. **Revisión de sitios** *(hecho)*: `places.status`, «Sin verificar» + confirmar estando ahí (otra persona o un moderador), «Ya no existe» (3 personas, 5 si tiene base, 1 moderador), bancos nuevos a 15 m mínimo, banco nuevo reclamado con foto (+5) que pierde el bonus si se oculta, y la pestaña Mod con pendientes y ocultos. Requiere la migración `status`, `kind` y `place_flags`.

## Decisiones tomadas

Solo bancos y mesas de pícnic · check-in por ubicación del móvil · grupos de 2 a 5 · ventana de 14 días con vida media de 5 días · conquista con ventaja del 20 % · primera versión pequeña (fase 1).
