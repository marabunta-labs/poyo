// Idiomas de Poyo. La clave es el texto en español: si no hay traducción se ve el español (nunca una clave rara).
// Para añadir un idioma: una entrada más en LANGS y su diccionario en DICT.
const LANGS = { es: 'Español', en: 'English' };
const DICT = { en: {
  // tipos y filtros
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
