# 🪑 Poyo

Mapa de bancos y sitios para sentarse, con notas, reseñas, fotos y amigos.

```
npm start   # http://localhost:3000
```

Sin dependencias (Node ≥ 18). Bancos, fuentes y tiendas de OpenStreetMap como punto de partida (se guardan en `DATA_DIR/osm-cache-3.json`) + sitios, reseñas y fotos de la comunidad. Buscador de lugares con Nominatim.

## Datos de OpenStreetMap (importante)
El Overpass público se satura (error «No se pudo cargar OpenStreetMap»). Por eso Poyo sirve los sitios desde un volcado **local**:
```
node scripts/import-osm.js                         # España entera (descarga ~1,5 GB, se borra al acabar; ~10 min)
node scripts/import-osm.js <url|fichero.pbf> --name francia   # otra región (https://download.geofabrik.de)
```
Genera `DATA_DIR/osm/<nombre>.json`; reinicia el servidor para cargarlo. Repítelo de vez en cuando (p. ej. cada mes) para refrescar.
En Docker: `docker exec <contenedor> node scripts/import-osm.js`. Las zonas sin volcado usan Overpass como respaldo (con caché en disco).

## Mapa
Capas (menú 🗺️): **Claro** y **Color** (vectoriales de [OpenFreeMap](https://openfreemap.org), gratis y sin clave, con los comercios/iconos del mapa quitados para que destaquen los sitios de Poyo), Estándar de OSM, Satélite (Esri) y Relieve (OpenTopoMap). Sin WebGL se usa el Estándar. Los sitios pueden verse como pines o como emojis. Se recuerda la elección en el navegador.
Evita CARTO: desde 2025 exige clave y pone una marca de agua.

## Variables de entorno
| Variable | Para qué |
|---|---|
| `PORT` | Puerto (def. 3000) |
| `DATA_DIR` | Dónde guardar `db.json` y `uploads/` (def. `./data`) |
| `ADMINS` | Usuarios moderadores, separados por comas (ej. `pablo,ana`). Ven la pestaña **Mod**, pueden borrar cualquier reseña/sitio y expulsar usuarios |
| `NODE_ENV=production` | Cookie `Secure` (requiere HTTPS) |
| `TRUST_PROXY=1` | Usa `X-Forwarded-For` para el límite de peticiones (detrás de un proxy) |

## Desplegar (Docker)
```
docker build -t poyo .
docker run -p 3000:3000 -v poyo-data:/data -e ADMINS=tuusuario poyo
```
En Fly.io / Render / Railway: usa el Dockerfile y monta un **volumen persistente en `/data`**
(sin él se pierden cuentas y fotos en cada despliegue). Solo una instancia: los datos viven en un fichero.

## Cuentas
Sin email: al registrarte se muestra un **código de recuperación** (una vez) para restablecer la contraseña.
