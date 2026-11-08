// Datos de la extensión en chrome.storage.local (solo local).
const KEY = 'dnmh';

export const DEFAULT_SETTINGS = {
  lang: 'auto',
  reminder: { enabled: true, days: [1, 3, 5], time: '08:00' }
};

export function defaultData() {
  return {
    schema: 1,
    templates: [],
    history: [],
    overrides: {},
    pending: null,
    settings: structuredClone(DEFAULT_SETTINGS)
  };
}

export async function load() {
  const res = await chrome.storage.local.get(KEY);
  const data = Object.assign(defaultData(), res[KEY] || {});
  data.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), data.settings || {});
  data.settings.reminder = Object.assign(structuredClone(DEFAULT_SETTINGS.reminder), data.settings.reminder || {});
  return data;
}

export async function save(data) {
  await chrome.storage.local.set({ [KEY]: data });
}

export async function update(fn) {
  const data = await load();
  const r = await fn(data);
  const out = r && typeof r === 'object' && Array.isArray(r.templates) ? r : data;
  await save(out);
  return out;
}

export const STORAGE_KEY = KEY;

export function newTemplate() {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name: '',
    client: '',
    price: '',
    category: '',
    condition: '',
    location: '',
    photosPerPost: 1,
    titles: [],
    descriptions: [],
    variables: '',
    imageIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/** Fecha local en formato AAAA-MM-DD. */
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
