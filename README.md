# 🪑 Poyo

Mapa de bancos y sitios para sentarse, con notas, reseñas, fotos y amigos.

**En producción: https://poyo-megc.onrender.com/**

```
npm start   # http://localhost:3000
```

Node ≥ 18 (única dependencia: `pg`). Bancos, fuentes y tiendas de OpenStreetMap como punto de partida (caché en `DATA_DIR`) + sitios, reseñas y fotos de la comunidad (Supabase). Buscador de lugares con Nominatim.

## Datos de OpenStreetMap (importante)
El Overpass público se satura (error «No se pudo cargar OpenStreetMap»). Por eso Poyo sirve los sitios desde un volcado **local**:
```
node scripts/import-osm.js                         # España entera (descarga ~1,5 GB, se borra al acabar; ~10 min)
node scripts/import-osm.js <url|fichero.pbf> --name francia   # otra región (https://download.geofabrik.de)
```
Genera `DATA_DIR/osm/<nombre>.json`; reinicia el servidor para cargarlo. Repítelo de vez en cuando (p. ej. cada mes) para refrescar.
En Docker: `docker exec <contenedor> node scripts/import-osm.js`. Las zonas sin volcado usan Overpass como respaldo (con caché en disco).

## Idiomas
Español e inglés (selector en la cabecera; por defecto, el del navegador). Las claves son los textos en español y el diccionario inglés está en `public/i18n.js`; para añadir un idioma, una entrada en `LANGS` y su diccionario en `DICT`. Lo que escribe la gente (reseñas, bios) no se traduce.

## Mapa
Capas (menú 🗺️): **Claro** y **Color** (vectoriales de [OpenFreeMap](https://openfreemap.org), gratis y sin clave, con los comercios/iconos del mapa quitados para que destaquen los sitios de Poyo), Estándar de OSM, Satélite (Esri) y Relieve (OpenTopoMap). Sin WebGL se usa el Estándar. Los sitios pueden verse como pines o como emojis. Se recuerda la elección en el navegador.
Evita CARTO: desde 2025 exige clave y pone una marca de agua.

## Datos y cuentas (Supabase)
Poyo no guarda nada en disco: los datos viven en el esquema `poyo` del proyecto de Supabase compartido por las apps de Marabunta Labs (repo privado `marabunta-db`).
El esquema completo está en [`supabase/schema.sql`](supabase/schema.sql): para montar Poyo con tu propio proyecto de Supabase, ejecútalo en el SQL Editor, pon la contraseña de `poyo_app` (`alter role poyo_app with password '…'`) y úsala en `DATABASE_URL`.- **Cuentas:** Supabase Auth (email + contraseña, o Google). Es la **cuenta común de Marabunta Labs**: quien ya la tenga en otra app entra con la misma. Poyo solo guarda un perfil (`@usuario`, bio, avatar).
- **Datos:** `poyo.profiles / places / reviews / friendships / reports`. El servidor entra con un rol (`poyo_app`) que solo ve ese esquema.
- **Fotos:** el navegador las reduce (≤1080 px, ~100 KB) y las sube a Supabase Storage (`poyo-photos`, carpeta `<uid>/`). Borrarlas de Storage lo hace `scripts/purge-photos.js` (el servidor no tiene permiso).
- Los volcados de OSM (`DATA_DIR/osm/`) y la caché de Overpass siguen en disco.

## Variables de entorno
| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a Postgres como `poyo_app` (pooler de Supabase, puerto 6543) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Clave pública (anon) del proyecto. Es pública por diseño; **no** pongas aquí la `service_role` |
| `PORT` | Puerto (def. 3000) |
| `DATA_DIR` | Dónde están `osm/` y las cachés (def. `./data`) |
| `ADMINS` | Usernames moderadores, separados por comas (ej. `pablo,ana`). Ven la pestaña **Mod**, pueden borrar cualquier reseña/sitio y expulsar usuarios de Poyo |
| `TRUST_PROXY=1` | Usa `X-Forwarded-For` para el límite de peticiones (detrás de un proxy) |

`npm install && npm start`. Pruebas: `DATABASE_URL=… ADMIN_DATABASE_URL=… node --test test/api.test.js` (necesita un Postgres con Supabase, p. ej. la imagen `supabase/postgres`, con `supabase/schema.sql` aplicado y un `poyo_app` con contraseña) y `node --test test/i18n.test.js`.

## Desplegar (Render)
Poyo está en Render (plan gratuito, Frankfurt): https://poyo-megc.onrender.com/. Se define en `render.yaml` (Blueprint: *New → Blueprint* y elige este repo); solo hay que pegar los secretos `DATABASE_URL`, `SUPABASE_ANON_KEY` y `ADMINS`. Render comprueba `/api/config` y redespliega con cada push.
En el plan gratuito el servicio se duerme tras ~15 min sin visitas: la primera carga después puede tardar ~1 min.

## Desplegar (Docker)
```
docker build -t poyo .
docker run -p 3000:3000 -v poyo-osm:/data -e DATABASE_URL=… -e SUPABASE_URL=… -e SUPABASE_ANON_KEY=… -e ADMINS=tuusuario poyo
```
Solo el volcado de OSM necesita volumen (`/data`); sin él se regenera con `scripts/import-osm.js`. Ya no hay límite de una sola instancia.

## Cuentas
Las gestiona Supabase Auth: confirmación por email, recuperación de contraseña por email y Google. En Poyo la primera vez se elige un `@usuario`. «Borrar mis datos de Poyo» elimina solo lo de Poyo; la cuenta de Marabunta Labs y las otras apps no se tocan.
