// Traducciones ES/EN. Usa los archivos de _locales y permite elegir idioma en Ajustes.
let messages = {};
let current = 'es';

export function resolveLang(pref) {
  if (pref === 'es' || pref === 'en') return pref;
  const ui = (chrome.i18n.getUILanguage() || 'es').toLowerCase();
  return ui.startsWith('es') ? 'es' : 'en';
}

export async function initI18n(pref) {
  current = resolveLang(pref);
  const res = await fetch(chrome.runtime.getURL(`_locales/${current}/messages.json`));
  messages = await res.json();
  document.documentElement.lang = current;
  return current;
}

export function lang() { return current; }

export function t(key, ...subs) {
  const m = messages[key];
  let s = m ? m.message : key;
  subs.forEach((v, i) => { s = s.split(`{${i}}`).join(String(v)); });
  return s;
}

/** Traduce elementos con data-i18n, data-i18n-placeholder y data-i18n-title. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}
