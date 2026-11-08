// Generador de etiquetas y descripciones vendedoras (sin internet, sin IA).
import { normalize, parseVariables, roundPrice } from './engine.js';

const STOP = new Set(('de del la las el los un una unos unas y o en con sin para por al a que se su sus tu tus mi mis es son ' +
  'muy mas más este esta estos estas the a an and or of for with without in on to your my is are new nuevo nueva ' +
  'oferta promo barato barata precio venta vendo').split(' '));

const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function words(text) {
  return String(text || '')
    .replace(/\{[^}]*\}/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP.has(normalize(w)) && !/^\d+$/.test(w));
}

/** Nombre del producto: primeras palabras útiles del primer título. */
export function productName(tpl) {
  const first = (tpl.titles || [])[0] || tpl.name || '';
  let w = words(first).slice(0, 3).join(' ') || tpl.name || '';
  if (w === w.toUpperCase()) w = w.toLowerCase();
  return w;
}

/** Hasta 20 etiquetas a partir de títulos, categoría, ciudad, variables y beneficios. */
export function suggestTags(tpl, existing = []) {
  const out = [];
  const seen = new Set();
  const add = (t) => {
    const tag = String(t || '').trim().toLowerCase();
    const k = normalize(tag);
    if (tag && tag.length <= 40 && !seen.has(k) && out.length < 20) { seen.add(k); out.push(tag); }
  };
  existing.forEach(add);
  add(productName(tpl));
  (tpl.titles || []).forEach((t) => words(t).forEach(add));
  words(tpl.category).forEach(add);
  if (tpl.location) add(tpl.location);
  Object.values(parseVariables(tpl.variables)).flat().forEach((v) => { if (v.length <= 25) add(v); });
  lines(tpl.benefits).forEach((b) => words(b).slice(0, 2).forEach(add));
  lines(tpl.features).forEach((f) => words(f).slice(0, 2).forEach(add));
  return out;
}

const TEXT = {
  es: {
    hooks: [
      (p) => `🔥 ${p} disponible ahora`,
      (p) => `¿Buscas ${p.toLowerCase()}? ¡Aquí lo tienes!`,
      (p) => `⚡ ¡Últimas unidades! ${p}`,
      (p) => `⭐ ${p} de excelente calidad`
    ],
    benefits: 'Por qué te conviene:',
    features: 'Características:',
    price: (v) => `💲 Precio: $${v}`,
    location: (c) => `📍 ${c}`,
    ctas: [
      '📩 Escríbeme ahora y aparta el tuyo.',
      '💬 Envíame un mensaje, respondo rápido.',
      '🛒 Pregunta sin compromiso, ¡no te quedes sin el tuyo!',
      '✅ Escríbeme y coordinamos la entrega hoy mismo.'
    ]
  },
  en: {
    hooks: [
      (p) => `🔥 ${p} available now`,
      (p) => `Looking for ${p.toLowerCase()}? Here it is!`,
      (p) => `⚡ Last units! ${p}`,
      (p) => `⭐ Top quality ${p}`
    ],
    benefits: 'Why you will love it:',
    features: 'Features:',
    price: (v) => `💲 Price: $${v}`,
    location: (c) => `📍 ${c}`,
    ctas: [
      '📩 Message me now to reserve yours.',
      '💬 Send me a message, I reply fast.',
      '🛒 Ask with no obligation, don\'t miss out!',
      '✅ Message me and we arrange delivery today.'
    ]
  }
};

const stripEmoji = (s) => s.replace(/\u2705 /g, '• ').replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').replace(/^[ \t]+/gm, '').replace(/[ \t]+$/gm, '');

/** Varias descripciones distintas listas para rotar. */
export function suggestDescriptions(tpl, lang = 'es', count = 3) {
  const L = TEXT[lang] || TEXT.es;
  const product = cap(productName(tpl) || tpl.name || '');
  const benefits = lines(tpl.benefits);
  const features = lines(tpl.features);
  const delivery = String(tpl.deliveryInfo || '').trim();
  const price = roundPrice(tpl.price);
  const emojis = tpl.emojis !== false;
  const out = [];
  for (let i = 0; i < count; i++) {
    const parts = [L.hooks[i % L.hooks.length](product)];
    const b = benefits.length ? [...benefits.slice(i % benefits.length), ...benefits.slice(0, i % benefits.length)] : [];
    if (b.length) parts.push([L.benefits, ...b.map((x) => `✅ ${x}`)].join('\n'));
    if (features.length) parts.push([L.features, ...features.map((x) => `• ${x}`)].join('\n'));
    const info = [];
    if (price) info.push(L.price(price));
    if (tpl.location) info.push(L.location(tpl.location));
    if (delivery) info.push(`🚚 ${delivery}`);
    if (info.length) parts.push(info.join('\n'));
    parts.push(L.ctas[i % L.ctas.length]);
    let text = parts.join('\n\n');
    if (!emojis) text = stripEmoji(text);
    out.push(text);
  }
  return out;
}
