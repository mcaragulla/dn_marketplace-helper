// Lógica pura: variables, rotación sin repetir y calendario.
import { ymd } from './store.js';

const MAX_COMBOS = 1000;

export function normalize(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "clave = valor1 | valor2" por línea → { clave: [valor1, valor2] } */
export function parseVariables(text) {
  const vars = {};
  String(text || '').split('\n').forEach((line) => {
    const i = line.indexOf('=');
    if (i < 1) return;
    const key = normalize(line.slice(0, i)).replace(/\s/g, '_');
    const values = line.slice(i + 1).split('|').map((v) => v.trim()).filter(Boolean);
    if (key && values.length) vars[key] = values;
  });
  return vars;
}

export function builtinVars(tpl, date = new Date()) {
  return {
    precio: [String(tpl.price || '')],
    ciudad: [String(tpl.location || '')],
    cliente: [String(tpl.client || '')],
    fecha: [date.toLocaleDateString()]
  };
}

function allVars(tpl) {
  return Object.assign(builtinVars(tpl), parseVariables(tpl.variables));
}

const TOKEN = /\{([^{}]+)\}/g;

function keysIn(pattern, vars) {
  const keys = [];
  for (const m of pattern.matchAll(TOKEN)) {
    const k = normalize(m[1]).replace(/\s/g, '_');
    if (vars[k] && !keys.includes(k)) keys.push(k);
  }
  return keys;
}

function fill(pattern, choice) {
  return pattern.replace(TOKEN, (all, raw) => {
    const k = normalize(raw).replace(/\s/g, '_');
    return k in choice ? choice[k] : all;
  }).replace(/\s+/g, ' ').trim();
}

/** Todos los títulos posibles (patrones × combinaciones de variables), sin duplicados. */
export function expandTitles(tpl) {
  const vars = allVars(tpl);
  const out = [];
  const seen = new Set();
  for (const pattern of tpl.titles || []) {
    if (!pattern.trim()) continue;
    const keys = keysIn(pattern, vars);
    let combos = [{}];
    for (const k of keys) {
      const next = [];
      for (const c of combos) for (const v of vars[k]) next.push({ ...c, [k]: v });
      combos = next.slice(0, MAX_COMBOS);
    }
    for (const c of combos) {
      const t = fill(pattern, c);
      const n = normalize(t);
      if (t && !seen.has(n)) { seen.add(n); out.push(t); }
    }
  }
  return out;
}

/** Descripción: rota variantes; cada variable toma un valor al azar. */
export function buildDescription(tpl, index) {
  const list = (tpl.descriptions || []).filter((d) => d.trim());
  if (!list.length) return '';
  const pattern = list[index % list.length];
  const vars = allVars(tpl);
  const choice = {};
  for (const k of Object.keys(vars)) choice[k] = vars[k][Math.floor(Math.random() * vars[k].length)];
  return pattern.replace(TOKEN, (all, raw) => {
    const k = normalize(raw).replace(/\s/g, '_');
    return k in choice ? choice[k] : all;
  }).trim();
}

export function usedSets(history) {
  const titles = new Set();
  const images = new Set();
  for (const h of history || []) {
    if (h.status !== 'published') continue;
    if (h.title) titles.add(normalize(h.title));
    (h.imageIds || []).forEach((id) => images.add(id));
  }
  return { titles, images };
}

export function stats(tpl, history) {
  const used = usedSets(history);
  const titles = expandTitles(tpl);
  const freeTitles = titles.filter((t) => !used.titles.has(normalize(t)));
  const freeImages = (tpl.imageIds || []).filter((id) => !used.images.has(id));
  const per = Math.max(1, Number(tpl.photosPerPost) || 1);
  const postsLeft = Math.min(freeTitles.length, Math.floor(freeImages.length / per));
  return { totalTitles: titles.length, freeTitles, totalImages: (tpl.imageIds || []).length, freeImages, postsLeft, per };
}

/** Próxima publicación para una plantilla, o un error con el motivo. */
export function nextPost(tpl, history) {
  const s = stats(tpl, history);
  if (!s.freeTitles.length) return { error: 'noTitles' };
  if (s.totalImages && s.freeImages.length < s.per) return { error: 'noImages' };
  const publishedCount = (history || []).filter((h) => h.status === 'published' && h.templateId === tpl.id).length;
  return {
    title: s.freeTitles[0],
    description: buildDescription(tpl, publishedCount),
    imageIds: s.freeImages.slice(0, s.per),
    price: roundPrice(tpl.price),
    category: tpl.category || '',
    condition: tpl.condition || '',
    location: tpl.location || '',
    availability: tpl.availability || '',
    tags: parseTags(tpl.tags),
    sku: tpl.sku || '',
    delivery: Object.assign({ publicMeetup: true, doorPickup: false, doorDropoff: false }, tpl.delivery || {}),
    hideFromFriends: !!tpl.hideFromFriends,
    lowStock: s.postsLeft <= 3
  };
}

/** Facebook no acepta centavos: "16.99" → "17". Vacío si no hay número. */
export function roundPrice(value) {
  const clean = String(value || '').replace(/[^\d.,]/g, '');
  if (!clean) return '';
  // El último separador (punto o coma) se toma como decimal: "16.99", "16,99", "1.200,50".
  const lastSep = Math.max(clean.lastIndexOf('.'), clean.lastIndexOf(','));
  const num = lastSep === -1
    ? Number(clean)
    : Number(`${clean.slice(0, lastSep).replace(/[.,]/g, '') || '0'}.${clean.slice(lastSep + 1)}`);
  return Number.isFinite(num) ? String(Math.round(num)) : '';
}

export function hasCents(value) {
  return /[.,]\d+\s*$/.test(String(value || '').trim()) && !/[.,]0+\s*$/.test(String(value || '').trim());
}

/** Etiquetas separadas por coma o salto de línea, sin duplicados, máximo 20. */
export function parseTags(text) {
  const seen = new Set();
  const out = [];
  String(text || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean).forEach((tag) => {
    const k = normalize(tag);
    if (!seen.has(k) && out.length < 20) { seen.add(k); out.push(tag); }
  });
  return out;
}

/* ---------- Calendario ---------- */

/** 'publish' | 'renew' | 'skip' | 'off' */
export function dayStatus(date, settings, overrides) {
  const key = ymd(date);
  if (overrides && overrides[key]) return overrides[key];
  return settings.reminder.days.includes(date.getDay()) ? 'publish' : 'off';
}

export function nextDayWith(status, from, settings, overrides, maxDays = 60) {
  const d = new Date(from);
  for (let i = 1; i <= maxDays; i++) {
    d.setDate(d.getDate() + 1);
    if (dayStatus(d, settings, overrides) === status) return new Date(d);
  }
  return null;
}

/** Próximo momento (ms) en que debe sonar un recordatorio. */
export function nextReminderTime(now, settings, overrides) {
  if (!settings.reminder.enabled) return null;
  const [h, m] = settings.reminder.time.split(':').map(Number);
  for (let i = 0; i <= 60; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now.getTime()) continue;
    const st = dayStatus(d, settings, overrides);
    if (st === 'publish' || st === 'renew') return d.getTime();
  }
  return null;
}
