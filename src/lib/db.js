// Almacén de imágenes en IndexedDB (solo local, dentro del navegador).
const DB_NAME = 'dnmh';
const STORE = 'images';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
  }));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function putImage(file) {
  const rec = { id: uid(), name: file.name || 'imagen.jpg', type: file.type || 'image/jpeg', blob: file, createdAt: Date.now() };
  await tx('readwrite', (s) => s.put(rec));
  return rec.id;
}

export function putImageRecord(rec) {
  return tx('readwrite', (s) => s.put(rec));
}

export function getImage(id) {
  return tx('readonly', (s) => s.get(id));
}

export function getAllImages() {
  return tx('readonly', (s) => s.getAll());
}

export function deleteImage(id) {
  return tx('readwrite', (s) => s.delete(id));
}

export function clearImages() {
  return tx('readwrite', (s) => s.clear());
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
