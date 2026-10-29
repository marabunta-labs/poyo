# 🪑 Poyo

Mapa de bancos y sitios para sentarse, con notas, reseñas, fotos y amigos.

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
Poyo no guarda nada en disco: los datos viven en el esquema `poyo` del proyecto de Supabase compartido por las apps de Marabunta Labs (ver `../marabunta-db/README.md`).
- **Cuentas:** Supabase Auth (email + contraseña, o Google). Es la **cuenta común de Marabunta Labs**: quien ya la tenga en otra app entra con la misma. Poyo solo guarda un perfil (`@usuario`, bio, avatar).
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

`npm install && npm start`. Pruebas: `DATABASE_URL=… ADMIN_DATABASE_URL=… node --test test/api.test.js` (necesita el Postgres local de `../marabunta-db/test/run_local.sh`) y `node --test test/i18n.test.js`.

## Desplegar (Docker)
```
docker build -t poyo .
docker run -p 3000:3000 -v poyo-osm:/data -e DATABASE_URL=… -e SUPABASE_URL=… -e SUPABASE_ANON_KEY=… -e ADMINS=tuusuario poyo
```
Solo el volcado de OSM necesita volumen (`/data`); sin él se regenera con `scripts/import-osm.js`. Ya no hay límite de una sola instancia.

## Alternativa: Vercel (rama `vercel`)
`main` se despliega en Render (Docker, `render.yaml`). La rama **`vercel`** contiene lo necesario para alojarlo en Vercel sin servidor permanente:
`api/[...path].js` (toda petición `/api/*` va a esta función, que importa el handler de `server.js`), `vercel.json` (la web de `public/` se sirve como estático; la función incluye el volcado de OSM, 1 GB de memoria, 10 s máx.) y `server.js` exportando el handler (`node server.js` sigue arrancando el servidor como siempre).
Para usarla: `vercel link` en el repo → variables `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMINS` y `TRUST_PROXY=1` (producción) → `vercel --prod` (o conectar el repo a Vercel con esa rama como producción) → añadir la URL a las redirecciones permitidas de Supabase Auth.
Ten en cuenta: cada instancia de la función es efímera (el límite de peticiones y la caché de tokens son por instancia, así que el límite es aproximado), la caché de Overpass no se guarda (disco de solo lectura) y el plan Hobby de Vercel es para uso no comercial.

## Cuentas
Las gestiona Supabase Auth: confirmación por email, recuperación de contraseña por email y Google. En Poyo la primera vez se elige un `@usuario`. «Borrar mis datos de Poyo» elimina solo lo de Poyo; la cuenta de Marabunta Labs y las otras apps no se tocan.
