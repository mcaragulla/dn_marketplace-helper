// Prueba de extremo a extremo con Chrome real y un formulario simulado de Marketplace.
// Uso: node test/e2e.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mock = fs.readFileSync(path.join(root, 'test/mock-marketplace.html'), 'utf8');
const shots = path.join(os.tmpdir(), 'dnmh-shots');
fs.mkdirSync(shots, { recursive: true });
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnmh-profile-'));
const errors = [];
const ok = (cond, msg) => { if (!cond) { console.error('✗', msg); process.exitCode = 1; } else console.log('✓', msg); };

const ctx = await chromium.launchPersistentContext(userDir, {
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: false,
  args: ['--headless=new', `--disable-extensions-except=${root}`, `--load-extension=${root}`, '--lang=es'],
  locale: 'es-EC',
  viewport: { width: 1280, height: 900 }
});
await ctx.route('https://www.facebook.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: mock }));

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
ok(!!extId, 'extensión cargada: ' + extId);

const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
};

// Imágenes de prueba
const imgs = [];
for (let i = 1; i <= 4; i++) {
  const f = path.join(os.tmpdir(), `foto${i}.png`);
  fs.writeFileSync(f, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));
  imgs.push(f);
}

// 1) Panel: crear plantilla
const opt = await ctx.newPage(); watch(opt, 'options');
await opt.goto(`chrome-extension://${extId}/src/options/options.html#templates`);
await opt.waitForTimeout(500);
await opt.click('#newTpl');
await opt.waitForSelector('#view-editor.active');
await opt.fill('#e_name', 'Taladro promo');
await opt.fill('#e_client', 'Ferretería López');
await opt.fill('#e_price', '$16.99');
await opt.fill('#e_category', 'Herramientas');
await opt.fill('#e_condition', 'Usado - Como nuevo');
await opt.fill('#e_location', 'Quito');
await opt.fill('#e_titles', 'Taladro {marca} en {ciudad}\nTaladro barato {beneficio}');
await opt.fill('#e_descriptions', 'Descripción A {beneficio}\n---\nDescripción B precio {precio}');
await opt.fill('#e_variables', 'marca = Bosch | Dewalt\nbeneficio = envío gratis | garantía');
await opt.fill('#e_availability', 'Publicar como disponible');
await opt.fill('#e_sku', 'TAL-001');
await opt.check('#e_dl_meetup'); await opt.check('#e_dl_dropoff'); await opt.uncheck('#e_dl_pickup');
await opt.check('#e_hide');
await opt.fill('#e_benefits', 'Motor potente\nGarantía de 1 año');
await opt.fill('#e_features', 'Batería de litio');
await opt.fill('#e_deliveryInfo', 'Entregas en todo Quito');
await opt.waitForTimeout(800);
ok((await opt.textContent('#priceWarn')).includes('17') && await opt.isVisible('#priceWarn'), 'aviso de centavos: ' + await opt.textContent('#priceWarn'));
await opt.click('#suggestTags'); await opt.waitForTimeout(500);
const tagsVal = await opt.inputValue('#e_tags');
ok(tagsVal.split(',').length >= 5, 'etiquetas sugeridas: ' + tagsVal);
await opt.click('#suggestDesc'); await opt.waitForTimeout(500);
const descVal = await opt.inputValue('#e_descriptions');
ok(descVal.includes('Motor potente') && descVal.split('---').length >= 4, 'descripciones sugeridas agregadas');
await opt.setInputFiles('#e_files', imgs);
await opt.waitForTimeout(1200);
await opt.click('#saveTpl');
await opt.waitForTimeout(400);
const sum = await opt.textContent('#sumBox');
ok(sum.includes('4 / 4') && sum.includes('Títulos libres'), 'resumen: 4 títulos y 4 fotos libres → ' + sum.replace(/\s+/g, ' '));
const nextTitles = await opt.$$eval('#nextTitles li', (l) => l.map((x) => x.textContent));
ok(nextTitles[0] === 'Taladro Bosch en Quito', 'variables expandidas: ' + nextTitles.join(' | '));
await opt.screenshot({ path: path.join(shots, 'editor.png'), fullPage: true });

// Duplicar
await opt.click('#dupTpl');
await opt.waitForTimeout(800);
await opt.goto(`chrome-extension://${extId}/src/options/options.html#templates`);
await opt.waitForTimeout(600);
ok((await opt.$$('.tpl-card')).length === 2, 'duplicar plantilla');
await opt.screenshot({ path: path.join(shots, 'templates.png'), fullPage: true });

// 2) Facebook simulado
const fb = await ctx.newPage(); watch(fb, 'fb');
await fb.goto('https://www.facebook.com/marketplace/create/item');
await fb.waitForTimeout(800);

// 3) Popup (apuntando a la pestaña de Facebook)
async function openPopup() {
  const p = await ctx.newPage(); watch(p, 'popup');
  await p.addInitScript(() => {
    const orig = chrome.tabs.query.bind(chrome.tabs);
    // En la prueba el popup se abre como pestaña; se simula que la pestaña activa es la de Facebook.
    chrome.tabs.query = async (q) => {
      if (!(q && q.active)) return orig(q);
      for (const tb of await orig({})) {
        try { const r = await chrome.tabs.sendMessage(tb.id, { type: 'dnmh:ping' }); if (r && r.ok) return [tb]; } catch (_) {}
      }
      return [];
    };
  });
  await p.goto(`chrome-extension://${extId}/src/popup/popup.html`);
  await p.waitForTimeout(900);
  return p;
}
let pop = await openPopup();
ok(await pop.isHidden('#pageNotice'), 'popup detecta página Crear publicación');
const firstOpt = await pop.$eval('#tplSelect', (s) => s.options[0].textContent);
ok(!!firstOpt, 'popup lista plantillas: ' + firstOpt);
await pop.selectOption('#tplSelect', { index: 0 });
await pop.waitForTimeout(400);
await pop.screenshot({ path: path.join(shots, 'popup.png') });
ok(await pop.isVisible('#fillBtn'), 'popup muestra "Rellenar esta página" en el formulario');
await pop.close();
await fb.close();
// Botón Publicar del panel: abre Marketplace en otra pestaña y rellena
await opt.goto(`chrome-extension://${extId}/src/options/options.html#templates`);
await opt.waitForTimeout(600);
const tabPromise = ctx.waitForEvent('page');
await opt.locator('.tpl-card').first().locator('button.publish').click();
const fbNew = await tabPromise; watch(fbNew, 'fb2');
await fbNew.waitForLoadState();
// El simulador de red no alcanza a la pestaña que abre la extensión: se recarga para servir el formulario simulado.
// La extensión sigue esperando el formulario y lo rellena sola.
await fbNew.waitForTimeout(500);
await fbNew.goto('https://www.facebook.com/marketplace/create/item');
await fbNew.waitForFunction(() => { const e = document.getElementById('title'); return e && e.value.length > 0; }, null, { timeout: 30000 });
await fbNew.waitForFunction(() => document.getElementById('hide').checked, null, { timeout: 30000 }).catch(() => {});
await fbNew.waitForTimeout(1500);

const st = await fbNew.evaluate(() => ({
  title: document.getElementById('title').value, price: document.getElementById('price').value,
  desc: document.getElementById('desc').value, cat: document.getElementById('catValue').textContent,
  cond: document.getElementById('condValue').textContent, loc: document.getElementById('loc').value,
  photos: document.getElementById('photoCount').textContent, react: window.__state,
  avail: document.getElementById('availValue').textContent, sku: document.getElementById('sku').value,
  chips: [...document.querySelectorAll('.chip')].map(c => c.textContent),
  dl: ['dl1','dl2','dl3'].map(id => document.getElementById(id).getAttribute('aria-checked')),
  promo: document.getElementById('promo').getAttribute('aria-checked'), hide: document.getElementById('hide').checked
}));
console.log('   formulario:', JSON.stringify(st));
ok(st.title === 'Taladro Bosch en Quito', 'título rellenado');
ok(st.price === '17', 'precio redondeado (16.99 → 17)');
ok(st.cat === 'Herramientas', 'categoría elegida');
ok(st.cond === 'Usado: como nuevo', 'estado elegido aunque el texto difiera en signos');
ok(st.desc.startsWith('Descripción A'), 'descripción rellenada (abriendo Más detalles)');
ok(st.loc === 'Quito, Ecuador', 'ubicación elegida de la lista');
ok(st.photos.startsWith('1:'), 'foto cargada en el input de archivos');
ok(st.avail === 'Publicar como disponible', 'disponibilidad elegida');
ok(st.sku === 'TAL-001', 'SKU rellenado');
ok(st.chips.length >= 5, 'etiquetas creadas: ' + st.chips.length);
ok(JSON.stringify(st.dl) === '["true","false","true"]', 'preferencias de entrega: ' + st.dl);
ok(st.promo === 'false', 'promocionar apagado');
ok(st.hide === true, 'ocultar a amigos activado');
await fbNew.screenshot({ path: path.join(shots, 'fb-filled.png'), fullPage: true });

// 4) Presionar Publicar → historial "publicado"
await fbNew.click('#publish');
await fbNew.waitForTimeout(800);
const stored = await opt.evaluate(async () => (await chrome.storage.local.get('dnmh')).dnmh);
ok(stored.history.length === 1 && stored.history[0].status === 'published', 'clic en Publicar registrado en historial');
ok(stored.pending === null, 'pendiente limpiado');

// 5) Segunda publicación desde el popup ("Rellenar esta página"): título y foto distintos
const fb3 = await ctx.newPage(); watch(fb3, 'fb3');
await fb3.goto('https://www.facebook.com/marketplace/create/item'); await fb3.waitForTimeout(800);
await fbNew.close();
pop = await openPopup();
await pop.click('#fillBtn');
await pop.waitForTimeout(6000);
const t2 = await fb3.$eval('#title', (e) => e.value);
ok(t2 !== 'Taladro Bosch en Quito' && t2.length > 0, 'segundo título distinto: ' + t2);
await fb3.click('#publish'); await fb3.waitForTimeout(800);
const s2 = await opt.evaluate(async () => (await chrome.storage.local.get('dnmh')).dnmh);
const imgsUsed = s2.history.flatMap((h) => h.imageIds);
ok(new Set(imgsUsed).size === imgsUsed.length && imgsUsed.length === 2, 'fotos no repetidas entre publicaciones');

// 6) La plantilla duplicada no repite títulos ya usados
await pop.close();
pop = await openPopup();
await pop.selectOption('#tplSelect', { index: 1 });
await pop.waitForTimeout(500);
const pvTitle = await pop.textContent('#pvTitle');
const usedTitles = s2.history.map((h) => h.title);
ok(!usedTitles.includes(pvTitle), 'copia no repite títulos ya publicados: ' + pvTitle);

// 7) Calendario y ajustes
await opt.goto(`chrome-extension://${extId}/src/options/options.html#calendar`);
await opt.waitForTimeout(600);
const checked = await opt.$$eval('#daysBox input:checked', (l) => l.map((x) => x.value));
ok(JSON.stringify(checked) === '["1","3","5"]', 'días por defecto L-M-V');
ok((await opt.inputValue('#remTime')) === '08:00', 'hora por defecto 08:00');
await opt.fill('#remTime', '09:30'); await opt.dispatchEvent('#remTime', 'change'); await opt.waitForTimeout(500);
const alarm = await opt.evaluate(async () => { const a = await chrome.alarms.get('dnmh-reminder'); return a && new Date(a.scheduledTime).toString(); });
ok(alarm && alarm.includes('09:30'), 'alarma reprogramada: ' + alarm);
await opt.screenshot({ path: path.join(shots, 'calendar.png'), fullPage: true });

await opt.goto(`chrome-extension://${extId}/src/options/options.html#history`);
await opt.waitForTimeout(500);
await opt.screenshot({ path: path.join(shots, 'history.png'), fullPage: true });

// 8) Respaldo
await opt.goto(`chrome-extension://${extId}/src/options/options.html#settings`);
await opt.waitForTimeout(400);
const [dl] = await Promise.all([opt.waitForEvent('download'), opt.click('#exportBtn')]);
const backupPath = path.join(os.tmpdir(), 'backup.json');
await dl.saveAs(backupPath);
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
ok(backup.app === 'dn_marketplace-helper' && backup.images.length === 4 && backup.data.templates.length === 2, 'respaldo exportado con fotos');
opt.on('dialog', (d) => d.accept());
await opt.evaluate(async () => { await chrome.storage.local.clear(); });
await opt.setInputFiles('#importFile', backupPath);
await opt.waitForTimeout(2000);
const s3 = await opt.evaluate(async () => (await chrome.storage.local.get('dnmh')).dnmh);
ok(s3 && s3.templates.length === 2 && s3.history.length === 2, 'respaldo importado');

// 9) Idioma inglés
await opt.selectOption('#langSel', 'en');
await opt.waitForTimeout(1200);
ok((await opt.textContent('nav button[data-view="templates"]')) === 'Templates', 'cambio de idioma a inglés');
await opt.screenshot({ path: path.join(shots, 'settings-en.png'), fullPage: true });

ok(errors.length === 0, 'sin errores de consola' + (errors.length ? ': ' + errors.join(' || ') : ''));
await ctx.close();
console.log('Capturas en', shots);
