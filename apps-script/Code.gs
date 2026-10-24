/**
 * Dokay Journeys — зураг хүлээн авагч (Google Apps Script web app)
 *
 * Хаан өөрийн Google данснаас НЭГ УДАА deploy хийнэ:
 *  1. https://script.google.com → New project → энэ кодыг Code.gs-д бүтнээр буулгана.
 *  2. Project Settings (⚙) → Script Properties → Add script property:
 *       Property: KEYS
 *       Value:    {"TEST01":"урт-санамсаргүй-түлхүүр"}
 *     Захиалгын код : түлхүүр (JSON). Шинэ захиалга бүрд энд нэг хос нэмнэ — дахин deploy хийх хэрэггүй.
 *  3. Deploy → New deployment → Select type: Web app
 *       Execute as: Me
 *       Who has access: Anyone
 *     → Deploy → Drive-д хандах зөвшөөрөл асууна → Allow.
 *  4. Гарсан «Web app URL»-ийг upload.html-ийн CONFIG.scriptUrl-д тавина.
 *  5. Шалгах: тэр URL-ийг хөтчөөр нээхэд {"ok":true,"service":"dokay-journeys-intake"} гарна.
 *
 * Кодыг өөрчилбөл: Deploy → Manage deployments → ✎ → Version: New version (URL хэвээр).
 * Зургууд Drive-ийн «Dokay Journeys — Захиалга/<код>/» хавтаст: 001.jpg, 002.jpg …,
 * manifest.json, тайлбар.txt.
 */

var ROOT_NAME = 'Dokay Journeys — Захиалга';
var MAX_B64 = 15 * 1024 * 1024;
var MIMES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function doGet() {
  return out_({ ok: true, service: 'dokay-journeys-intake' });
}

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var o = String(d.o || ''), k = String(d.k || '');
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(o) || !checkKey_(o, k)) return out_({ ok: false, error: 'key' });
    if (d.kind === 'photo') return out_(savePhoto_(o, d));
    if (d.kind === 'manifest') return out_(saveManifest_(o, d));
    return out_({ ok: false, error: 'kind' });
  } catch (err) {
    return out_({ ok: false, error: 'server' });
  }
}

// Script Properties-ийн KEYS-тэй тулгана
function checkKey_(o, k) {
  var keys;
  try { keys = JSON.parse(PropertiesService.getScriptProperties().getProperty('KEYS') || '{}'); }
  catch (e) { return false; }
  return !!k && Object.prototype.hasOwnProperty.call(keys, o) && String(keys[o]) === k;
}

// Захиалгын хавтас — зэрэг ирсэн хүсэлт давхар хавтас үүсгэхгүйн тулд lock
function folder_(o) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return child_(child_(DriveApp.getRootFolder(), ROOT_NAME), o);
  } finally {
    lock.releaseLock();
  }
}

function child_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// Ижил нэртэй хуучин файлыг хогийн сав руу хийгээд шинээр бичнэ (дахин илгээхэд давхардахгүй)
function put_(folder, blob) {
  var old = folder.getFilesByName(blob.getName());
  while (old.hasNext()) old.next().setTrashed(true);
  return folder.createFile(blob);
}

function savePhoto_(o, d) {
  var idx = Number(d.idx), b64 = String(d.b64 || ''), ext = MIMES[d.mime];
  if (!ext) return { ok: false, error: 'mime' };
  if (!(idx % 1 === 0 && idx >= 1 && idx <= 200)) return { ok: false, error: 'idx' };
  if (!b64 || b64.length > MAX_B64) return { ok: false, error: 'size' };
  var name = pad_(idx, 3) + '.' + ext;
  put_(folder_(o), Utilities.newBlob(Utilities.base64Decode(b64), d.mime, name));
  return { ok: true, file: name };
}

function saveManifest_(o, d) {
  var items = Array.isArray(d.items) ? d.items.slice(0, 200) : [];
  if (!items.length) return { ok: false, error: 'items' };
  var c = d.client || {};
  var client = { name: str_(c.name, 80), phone: str_(c.phone, 40), trip: str_(c.trip, 120), song: str_(c.song, 500) };
  var clean = items.map(function (it) {
    return {
      idx: Number(it.idx) || 0,
      file: str_(it.file, 40),
      caption: str_(it.caption, 200),
      month: /^\d{4}-\d{2}$/.test(String(it.month)) ? String(it.month) : ''
    };
  });
  var f = folder_(o);
  var data = { order: o, received: new Date().toISOString(), client: client, items: clean };
  put_(f, Utilities.newBlob(JSON.stringify(data, null, 2), 'application/json', 'manifest.json'));

  var lines = [
    'Захиалга: ' + o,
    'Захиалагч: ' + client.name + (client.phone ? ' · ' + client.phone : ''),
    'Аялал: ' + (client.trip || '—'),
    'Дуу: ' + (client.song || '—'),
    'Зураг: ' + clean.length,
    ''
  ];
  clean.forEach(function (it) {
    lines.push(pad_(it.idx, 3) + ' · ' + (it.month || '—') + ' · ' + it.caption);
  });
  put_(f, Utilities.newBlob(lines.join('\n'), 'text/plain', 'тайлбар.txt'));
  return { ok: true, file: 'manifest.json' };
}

function str_(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
function pad_(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
function out_(r) {
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
}
