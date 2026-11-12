// Idiomas de Poyo. La clave es el texto en español: si no hay traducción se ve el español (nunca una clave rara).
// Para añadir un idioma: una entrada más en LANGS y su diccionario en DICT.
const LANGS = { es: 'Español', en: 'English' };
const DICT = { en: {
  // tipos y filtros
  'Toca el mapa para elegir el origen': 'Tap the map to set the start',
  'Toca el mapa para elegir el destino': 'Tap the map to set the destination',
  'Todos los sitios': 'All places',
  'Solo bases (todos los grupos)': 'Only bases (all groups)',
  'Bases por grupo': 'Bases by group',
  'Modo juego activado': 'Game mode on',
  '🏴 Modo juego': '🏴 Game mode',
  'Con el modo juego apagado no se ven las bases de colores ni los grupos en el mapa.': 'With game mode off, colored bases and groups are not shown on the map.',
  '🏴 ¡Prueba el modo juego!': '🏴 Try game mode!',
  '🏴 Mi grupo': '🏴 My group',
  'Cómo se juega': 'How to play',
  'Crea un grupo (de 2 a 5 personas) y comparte el código para que tus amigos se unan.': 'Create a group (2 to 5 people) and share the code so your friends can join.',
  'Ve a un banco o mesa de pícnic y pulsa «Hacer check-in» en su ficha: tienes que estar a menos de 40 m.': 'Go to a bench or picnic table and tap "Check in" on its page: you must be within 40 m.',
  'Cada check-in da 1 punto a tu grupo, y +1 por cada compañero que estuviera allí en la última hora (hasta +3). Una vez al día por banco y 10 bancos al día como máximo.': 'Each check-in gives your group 1 point, plus 1 for each teammate who was there in the last hour (up to +3). Once a day per bench and 10 benches a day at most.',
  'Manda en un banco el grupo con más puntos de los últimos 14 días (cada punto vale la mitad a los 5 días). Para quitarle una base a otro grupo hay que superarle en un 20 %.': 'The group with the most points in the last 14 days rules a bench (each point is worth half after 5 days). To take a base from another group you must beat it by 20%.',
  '¿Un banco que no sale en el mapa? Créalo marcando «Reclamar con mi ubicación», con foto y nota: +5 puntos. Otra persona debe confirmar que existe.': 'A bench that is not on the map? Create it ticking "Claim with my location", with a photo and rating: +5 points. Someone else must confirm it exists.',
  'Los bancos con base llevan un aro del color del grupo. Si ves ⚠️, alguien está a punto de quitaros una base.': 'Benches with a base have a ring in the group color. If you see ⚠️, someone is about to take a base from you.',
  'Gana insignias en tu perfil: madrugador, rey del atardecer, fiel y explorador.': 'Earn badges on your profile: early bird, sunset king, loyal and explorer.',
  'tramo máximo {a} m (tu límite: {b} m)': 'longest stretch {a} m (your limit: {b} m)',
  'No hay más sitios conocidos para partir esos tramos.': 'There are no more known places to break up those stretches.',
  'Sin verificar': 'Unverified',
  'Oculto': 'Hidden',
  '✅ Confirmar que existe (estando ahí)': '✅ Confirm it exists (while there)',
  '🚫 Ya no existe': '🚫 No longer exists',
  'Ya lo has reportado': 'You already reported it',
  '¿Reportar que este sitio ya no existe?': 'Report that this place no longer exists?',
  'Gracias: se ocultará cuando varias personas lo confirmen': 'Thanks: it will be hidden once several people confirm it',
  'Aprobar': 'Approve',
  'Ocultar': 'Hide',
  'Restaurar': 'Restore',
  'Sitios sin verificar': 'Unverified places',
  'Sitios ocultos': 'Hidden places',
  'Ninguno': 'None',
  'Denuncias': 'Reports',
  'por @{by} · {n} reportes': 'by @{by} · {n} reports',
  'Para reclamar hace falta nota y al menos una foto': 'To claim you need a rating and at least one photo',
  '🏴 Reclamar con mi ubicación (+5 pts: estando ahí, con foto y nota)': '🏴 Claim with my location (+5 pts: while there, with photo and rating)',
  'Ya hay un banco a menos de 15 m': 'There is already a bench within 15 m',
  'Sube una foto para reclamar un banco nuevo': 'Upload a photo to claim a new bench',
  'Este sitio ya está verificado': 'This place is already verified',
  'No puedes confirmar tu propio sitio': 'You cannot confirm your own place',
  '🌅 Madrugador': '🌅 Early bird', '🌇 Rey del atardecer': '🌇 Sunset king', '📆 Fiel 30 días': '📆 Loyal 30 days', '🧭 Explorador': '🧭 Explorer',
  'en peligro: {a} vs {b} pts': 'in danger: {a} vs {b} pts', 'España': 'Spain', 'Esta zona del mapa': 'This map area',
  'Inicia sesión para jugar': 'Sign in to play',
  '🏴 Juego': '🏴 Game',
  '🏴 Juego de bases': '🏴 Base game',
  'Frecuenta los bancos con tu grupo y conviértelos en vuestra base.': 'Hang out at benches with your group and make them your base.',
  'Base de {name} · {n} pts': 'Base of {name} · {n} pts',
  'Rival: {n} pts': 'Rival: {n} pts',
  'Nadie manda aquí todavía': 'Nobody rules here yet',
  '📍 Hacer check-in': '📍 Check in',
  'Tu navegador no da la ubicación': 'Your browser does not provide location',
  '+{n} puntos para tu grupo': '+{n} points for your group',
  'Código para invitar: {code}': 'Invite code: {code}',
  'Miembros': 'Members',
  'Vuestras bases': 'Your bases',
  'Todavía sin bases: haced check-in en un banco cercano.': 'No bases yet: check in at a nearby bench.',
  'Salir del grupo': 'Leave group',
  '¿Salir del grupo?': 'Leave the group?',
  'Crear un grupo': 'Create a group',
  'Nombre del grupo': 'Group name',
  'Código': 'Code',
  'Crear': 'Create',
  'Unirme con un código': 'Join with a code',
  'Unirme': 'Join',
  'Ranking (14 días)': 'Ranking (14 days)',
  'Grupos': 'Groups',
  'Personas': 'People',
  '{n} pts · {b} bases · {m} miembros': '{n} pts · {b} bases · {m} members',
  '{n} pts': '{n} pts',
  'Aún no hay check-ins': 'No check-ins yet',
  'Únete a un grupo para hacer check-in': 'Join a group to check in',
  'Ubicación no válida': 'Invalid location',
  'Ubicación poco precisa: acércate a cielo abierto y reintenta': 'Location not accurate enough: move to open sky and try again',
  'Solo se pueden reclamar bancos y mesas de pícnic': 'Only benches and picnic tables can be claimed',
  'Estás demasiado lejos del banco (máx. 40 m)': 'You are too far from the bench (40 m max)',
  'Ese desplazamiento no es posible': 'That movement is not possible',
  'Máximo 10 bancos distintos al día': 'Maximum 10 different benches per day',
  'Ya hiciste check-in aquí hoy': 'You already checked in here today',
  'Ya estás en un grupo': 'You are already in a group',
  'Nombre de grupo: 2-24 caracteres': 'Group name: 2-24 characters',
  'Ese nombre de grupo ya existe': 'That group name already exists',
  'Código de grupo no válido': 'Invalid group code',
  'El grupo está lleno (máx. 5)': 'The group is full (5 max)',
  'No estás en ningún grupo': 'You are not in any group',
  '{km} km · {min} min a pie': '{km} km · {min} min on foot', 'Paradas en la ruta (ninguna = ruta normal)': 'Stops on the route (none = normal route)', '🔭 Ver en Street View': '🔭 View on Street View',
  'demo': 'demo', 'Cuenta de ejemplo: no es una persona real': 'Sample account: not a real person',
  '🚶 Ruta': '🚶 Route', 'Ruta con paradas': 'Route with rest stops', 'Una ruta a pie sin tramos largos sin un banco donde sentarte (o una fuente donde beber).': 'A walking route with no long stretches without a bench to sit on (or a fountain to drink from).',
  'Origen': 'From', 'Destino': 'To', 'Sin elegir': 'Not set', 'Elegir en el mapa': 'Pick on the map', 'Toca el mapa…': 'Tap the map…', 'No se pudo obtener tu ubicación': 'Could not get your location',
  '🪑 Bancos': '🪑 Benches', 'Máx. {m} m entre paradas': 'Max {m} m between stops', 'Calcular ruta': 'Get route', 'Calculando…': 'Working…', 'Elige origen y destino': 'Pick a start and an end',
  '{km} km · {min} min a pie · {n} paradas en la ruta': '{km} km · {min} min on foot · {n} stops on the route', '✅ Ningún tramo supera {m} m': '✅ No stretch is longer than {m} m',
  '⚠️ Tramos de más de {m} m sin dónde parar: {n} (con los sitios conocidos)': '⚠️ Stretches longer than {m} m with nowhere to stop: {n} (among the known places)',
  'Mayor tramo sin parada: {m} m': 'Longest stretch without a stop: {m} m', 'Quitar ruta': 'Clear route', '🚶 Ruta hasta aquí': '🚶 Route to here',
  'El servicio de rutas no responde': 'The routing service is not responding', 'No hay ruta a pie entre esos puntos': 'There is no walking route between those points',
  'Punto no válido': 'Invalid point', 'Ruta demasiado larga (máx. 15 km)': 'Route too long (15 km max)',
  'Vistas': 'Views', 'Comodidad': 'Comfort', 'Accesibilidad': 'Accessibility', 'Sombra': 'Shade', 'Tranquilidad': 'Peace and quiet',
  'Espacio': 'Space', 'Limpieza': 'Cleanliness', 'Caudal': 'Water flow', 'Apta para mascotas': 'Pet-friendly', 'Horario': 'Opening hours',
  'Precio': 'Price', 'Catálogo': 'Range of products', 'Atención': 'Service', 'Detalles (opcional)': 'Details (optional)',
  'Banco': 'Bench', 'Mesa de pícnic': 'Picnic table', 'Muro / escalón': 'Wall / step', 'Otro': 'Other', 'Fuente': 'Fountain',
  'Tienda de alimentación': 'Grocery shop', '🪑 Sentarse': '🪑 Seating', '💧 Fuentes': '💧 Fountains', '🛒 Tiendas': '🛒 Shops',
  // mapa y capas
  'Claro (sin comercios)': 'Light (no shops)', 'Color (sin comercios)': 'Colour (no shops)', 'Estándar (OpenStreetMap)': 'Standard (OpenStreetMap)',
  'Satélite': 'Satellite', 'Relieve': 'Terrain', 'Mapa': 'Map', 'Sitios': 'Places', '📍 Pines': '📍 Pins', '😀 Emojis sobre el mapa': '😀 Emojis on the map',
  'Acércate para ver bancos': 'Zoom in to see benches', 'Acércate para ver sitios': 'Zoom in to see places', 'Buscando sitios…': 'Looking for places…',
  '{n} sitios en esta zona': '{n} places in this area', 'OpenStreetMap no responde, reintentando…': 'OpenStreetMap is not responding, retrying…',
  'No se pudo cargar OpenStreetMap · mueve el mapa para reintentar': 'Could not load OpenStreetMap · move the map to retry',
  'Capas y estilo del mapa': 'Map layers and style', 'Mi ubicación': 'My location', 'Añadir un sitio': 'Add a place', '＋ Añadir sitio': '＋ Add place',
  'No pude obtener tu ubicación': 'Could not get your location',
  // buscador
  'Buscar un lugar o sitio…': 'Search for a place…', 'Buscando en España…': 'Searching in Spain…', 'Sin resultados en España': 'No results in Spain',
  '🔎 Buscar «{q}» en España': '🔎 Search «{q}» in Spain', 'El buscador no responde': 'Search is not responding', 'Espera un segundo': 'Wait a second',
  'OpenStreetMap no responde': 'OpenStreetMap is not responding',
  // panel, navegación
  'Atrás': 'Back', 'Adelante': 'Forward', 'Cerrar': 'Close', 'Quitar del mapa': 'Remove from map', 'Cargando…': 'Loading…',
  'Toca el mapa donde está el sitio ·': 'Tap the map where the place is ·', 'cancelar': 'cancel',
  'Todavía no hay reseñas que enseñar en el mapa.': 'There are no reviews to show on the map yet.',
  // reseñas
  '🗑 Borrar mi reseña': '🗑 Delete my review', 'Borrar (mod)': 'Delete (mod)', '¿Borrar esta reseña y sus fotos?': 'Delete this review and its photos?',
  'Denunciar': 'Report', '¿Por qué denuncias esta reseña? (spam, insultos, foto inapropiada…)': 'Why are you reporting this review? (spam, insults, inappropriate photo…)',
  'Gracias, un moderador la revisará.': 'Thanks, a moderator will look at it.', 'amigo': 'friend',
  '¿Sombra? ¿Vistas? ¿Ruido? ¿Es cómodo?': 'Shade? Views? Noise? Is it comfortable?', '📷 Añadir fotos (máx. 3)': '📷 Add photos (max. 3)',
  'Foto no válida': 'Invalid photo', 'Solo se admiten fotos JPEG': 'Only JPEG photos are accepted', 'Archivo demasiado grande': 'File too large',
  'Elige una nota': 'Pick a rating', 'Elige una nota para publicar tu opinión': 'Pick a rating to post your opinion', 'La nota va de 1 a 5': 'The rating goes from 1 to 5',
  'Publicar': 'Post', 'Editar tu reseña': 'Edit your review', 'Deja tu reseña': 'Leave your review',
  'Aún sin reseñas. ¡Sé el primero!': 'No reviews yet. Be the first!', ' · de OpenStreetMap': ' · from OpenStreetMap', ' · añadido por la comunidad': ' · added by the community',
  'Inicia sesión para reseñar': 'Sign in to review', 'Inicia sesión para reseñar este sitio': 'Sign in to review this place',
  'Borrar este sitio': 'Delete this place', '¿Borrar el sitio y todas sus reseñas?': 'Delete the place and all its reviews?', 'Sitio': 'Place',
  // cuenta
  '🔑 Guarda tu código': '🔑 Save your code', 'Es la única forma de recuperar tu contraseña si la olvidas. Se muestra una sola vez.': 'It is the only way to recover your password if you forget it. It is shown only once.',
  'Ya lo he guardado': 'I have saved it', 'Usuario': 'Username', 'Código de recuperación (xxxx-xxxx-xxxx)': 'Recovery code (xxxx-xxxx-xxxx)',
  'Contraseña (mín. 6)': 'Password (min. 6)', 'Nueva contraseña (mín. 6)': 'New password (min. 6)', 'He olvidado mi contraseña': 'I forgot my password',
  'Entrar': 'Sign in', '¿No tienes cuenta? Regístrate': 'No account? Sign up', 'Crear cuenta': 'Create account', 'Ya tengo cuenta': 'I already have an account',
  'Nueva contraseña': 'New password', 'Volver a entrar': 'Back to sign in', '🪑 Únete a Poyo': '🪑 Join Poyo',
  'Reseña sitios, sube fotos y sigue a tus amigos.': 'Review places, upload photos and follow your friends.',
  'Mi perfil y mis reseñas': 'My profile and reviews', 'Entrar o crear cuenta': 'Sign in or create an account', '👤 Entrar': '👤 Sign in',
  'Amigos y novedades': 'Friends and updates', '👥 Amigos': '👥 Friends', 'Inicia sesión para ver a tus amigos': 'Sign in to see your friends',
  'Inicia sesión para hacer esto': 'Sign in to do this', 'Inicia sesión para añadir amigos': 'Sign in to add friends', 'Inicia sesión para añadir sitios': 'Sign in to add places',
  'Usuario: 3-20 letras, números, _ . -': 'Username: 3-20 letters, numbers, _ . -', 'La contraseña debe tener al menos 6 caracteres': 'The password must be at least 6 characters',
  'Ese usuario ya existe': 'That username already exists', 'Usuario o contraseña incorrectos': 'Wrong username or password',
  'Usuario o código de recuperación incorrectos': 'Wrong username or recovery code', 'Contraseña actual incorrecta': 'Current password is wrong', 'Contraseña incorrecta': 'Wrong password',
  'Demasiadas peticiones, espera un minuto': 'Too many requests, wait a minute',
  // perfil
  'En Poyo desde {d}': 'On Poyo since {d}', '📷 Cambiar foto': '📷 Change photo', '📷 Añadir foto de perfil': '📷 Add profile photo', 'Quitar': 'Remove',
  'Escribe algo sobre ti…': 'Write something about yourself…', 'reseñas': 'reviews', 'fotos': 'photos', 'nota media': 'avg. rating', 'amigos': 'friends',
  'Ajustes': 'Settings', 'Cerrar sesión': 'Sign out', '🗺 Mis reseñas en el mapa': '🗺 My reviews on the map', '🗺 Sus reseñas en el mapa': '🗺 Their reviews on the map',
  'Mis reseñas': 'My reviews', 'Reseñas': 'Reviews', 'Mis amigos': 'My friends', 'Amigos': 'Friends',
  'Todavía no has reseñado nada. Toca un sitio del mapa para empezar.': "You haven't reviewed anything yet. Tap a place on the map to start.", 'Todavía no ha reseñado nada.': "They haven't reviewed anything yet.",
  'Usuario no encontrado': 'User not found', 'Anónimo': 'Anonymous',
  // ajustes
  'Contraseña actual': 'Current password', 'Cambiar contraseña': 'Change password', 'Guardar': 'Save', 'Contraseña actualizada': 'Password updated',
  'Contraseña para confirmar': 'Password to confirm', 'Borrar mi cuenta': 'Delete my account',
  'Se eliminan tu perfil, reseñas, fotos y amistades. No se puede deshacer.': 'Your profile, reviews, photos and friendships are deleted. This cannot be undone.',
  'Borrar cuenta para siempre': 'Delete account forever', '¿Seguro? Esto no se puede deshacer.': 'Sure? This cannot be undone.', '← Volver': '← Back',
  // social
  '➕ Añadir amigo': '➕ Add friend', 'Solicitud enviada · cancelar': 'Request sent · cancel', '✔ Aceptar solicitud': '✔ Accept request', 'Amigos ✓ · eliminar': 'Friends ✓ · remove',
  'Novedades': 'Updates', 'Buscar gente': 'Find people', 'Social': 'Social', '🗺 Ver estas reseñas en el mapa': '🗺 See these reviews on the map',
  'Aquí verás las reseñas de tus amigos. ¡Busca gente y añádela!': "You'll see your friends' reviews here. Find people and add them!",
  'Solicitudes recibidas': 'Requests received', 'Aceptar': 'Accept', 'Rechazar': 'Decline', 'Enviadas': 'Sent', 'Cancelar': 'Cancel', 'Ver perfil': 'View profile',
  'Aún no tienes amigos.': "You don't have friends yet.", '🔎 Buscar gente': '🔎 Find people', 'Buscar usuario…': 'Search users…',
  'Gente con más reseñas': 'People with the most reviews', 'Resultados': 'Results', 'Nadie con ese nombre': 'Nobody with that name',
  'Sin denuncias pendientes 🎉': 'No pending reports 🎉', 'Denunciada por @{by}: {reason}': 'Reported by @{by}: {reason}', 'sin motivo': 'no reason',
  'Borrar reseña': 'Delete review', 'Descartar': 'Dismiss', 'Expulsar usuario': 'Ban user', '¿Borrar la cuenta de @{user} y todo su contenido?': "Delete @{user}'s account and all their content?",
  'Eres tú': "That's you", 'Es tu propia reseña': 'This is your own review', 'No es tu reseña': 'Not your review', 'No puedes borrar este sitio': "You can't delete this place",
  'No puedes borrar a un moderador': "You can't delete a moderator", 'Solo para moderadores': 'Moderators only', 'No existe': 'Does not exist', 'No encontrado': 'Not found',
  'Datos inválidos': 'Invalid data', 'JSON inválido': 'Invalid JSON', 'Zona no válida': 'Invalid area', 'Error': 'Error', 'Error interno': 'Internal error',
  // añadir sitio
  'Ej. Banco bajo el olmo': 'E.g. Bench under the elm', 'Nuevo sitio': 'New place', 'Arrastra el marcador para ajustar la posición.': 'Drag the marker to adjust its position.',
  'Nombre (opcional)': 'Name (optional)', 'Tipo': 'Type', '⭐ Tu opinión (opcional, pero ayuda mucho)': '⭐ Your opinion (optional, but it helps a lot)', 'Crear sitio': 'Create place',
  // cuentas de Marabunta Labs (Supabase Auth)
  'Email': 'Email', 'Enviar enlace': 'Send link', 'Continuar con Google': 'Continue with Google', 'Continuar': 'Continue',
  'Si ese email tiene cuenta, te hemos enviado un enlace para elegir una contraseña nueva.': 'If that email has an account, we have sent you a link to choose a new password.',
  'Te hemos enviado un email para confirmar tu cuenta. Si ya tenías cuenta de Marabunta Labs, entra con ella directamente.': 'We have sent you an email to confirm your account. If you already had a Marabunta Labs account, just sign in with it.',
  'Email o contraseña incorrectos': 'Wrong email or password', 'Confirma tu email antes de entrar': 'Confirm your email before signing in',
  'Tu cuenta es de Marabunta Labs: si ya la tienes en otra de nuestras apps (Teaserflix, Platoplan…), usa el mismo email y la misma contraseña.': 'Your account is a Marabunta Labs account: if you already have one in another of our apps (Teaserflix, Platoplan…), use the same email and password.',
  'Elige tu @usuario': 'Choose your @username', 'Es el nombre que verán los demás. 3-20 letras, números, _ . -': 'This is the name others will see. 3-20 letters, numbers, _ . -',
  '¡Bienvenido a Poyo!': 'Welcome to Poyo!', 'No se pudo subir la foto': 'Could not upload the photo', 'No se pudo conectar con el servicio de cuentas': 'Could not connect to the accounts service',
  'Es la contraseña de tu cuenta de Marabunta Labs: cambia también en sus otras apps.': 'This is your Marabunta Labs account password: it also changes in its other apps.',
  'Borrar mis datos de Poyo': 'Delete my Poyo data',
  'Se eliminan tu perfil, reseñas, fotos y amistades de Poyo. Tu cuenta de Marabunta Labs y tus otras apps no se tocan. No se puede deshacer.': 'Your Poyo profile, reviews, photos and friendships are deleted. Your Marabunta Labs account and your other apps are not touched. This cannot be undone.',
  'Ya tienes perfil': 'You already have a profile', 'Elige tu nombre de usuario': 'Choose your username', 'El servicio de cuentas no responde': 'The accounts service is not responding',
  // página
  'Poyo · mapa de sitios para sentarse': 'Poyo · map of places to sit down',
} };

const LANG = (() => {
  let saved = null;
  try { saved = localStorage.getItem('poyo-lang'); } catch {}
  return LANGS[saved] ? saved : (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
})();
const LOCALE = LANG === 'es' ? 'es' : 'en-GB';
const t = (key, vars) => {
  let s = DICT[LANG]?.[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', v);
  return s;
};
function setLang(l) { try { localStorage.setItem('poyo-lang', l); } catch {} location.reload(); }

// Textos fijos del HTML: data-t (contenido), data-t-title, data-t-ph (placeholder), data-t-aria.
document.documentElement.lang = LANG;
document.title = t(document.title);
document.querySelectorAll('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
document.querySelectorAll('[data-t-title]').forEach((n) => (n.title = t(n.dataset.tTitle)));
document.querySelectorAll('[data-t-ph]').forEach((n) => (n.placeholder = t(n.dataset.tPh)));
document.querySelectorAll('[data-t-aria]').forEach((n) => n.setAttribute('aria-label', t(n.dataset.tAria)));
const langSel = document.getElementById('lang');
if (langSel) {
  langSel.replaceChildren(...Object.entries(LANGS).map(([k, v]) => Object.assign(document.createElement('option'), { value: k, textContent: v, selected: k === LANG })));
  langSel.onchange = () => setLang(langSel.value);
}
