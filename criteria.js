// Criterios de la reseña según el tipo de sitio (opcionales, 1-5). Las etiquetas están en el cliente (public/app.js).
const CRITERIA = {
  bench: ['views', 'comfort', 'access', 'shade', 'calm'], picnic: ['comfort', 'space', 'clean', 'shade'],
  wall: ['comfort', 'views'], other: ['comfort', 'views'], fountain: ['flow', 'clean', 'pets'], shop: ['hours', 'price', 'catalog', 'service'],
};
const validRatings = (type, raw) => Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {})
  .map(([k, v]) => [k, Math.round(Number(v))]).filter(([k, v]) => (CRITERIA[type] || []).includes(k) && v >= 1 && v <= 5));

module.exports = { CRITERIA, validRatings };
