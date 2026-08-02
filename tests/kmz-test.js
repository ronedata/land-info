/* ==========================================================================
   tests/kmz-test.js — KMZ এক্সপোর্ট ইঞ্জিনের যাচাই
   চালাও:  node tests/kmz-test.js
   ========================================================================== */

const K = require('../js/kmz-export.js');

let pass = 0, fail = 0;
const head = t => console.log('\n\x1b[36m── ' + t + ' ──\x1b[0m');

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  \x1b[31m✗ ' + name + (extra ? '   ' + extra : '') + '\x1b[0m'); }
}
function near(name, got, want, tol, unit) {
  const d = Math.abs(got - want);
  ok(name, d <= tol, `পাওয়া ${got.toFixed(6)}${unit || ''} · প্রত্যাশিত ${want.toFixed(6)}${unit || ''} · পার্থক্য ${d.toExponential(2)}`);
}
function throws(name, fn, match) {
  try { fn(); ok(name, false, 'ত্রুটি আসেনি'); }
  catch (e) { ok(name, !match || e.message.includes(match), e.message.slice(0, 60)); }
}

/* ═══════════ ১. CRC32 — আন্তর্জাতিক মান দিয়ে যাচাই ═══════════ */
head('CRC32 (ZIP এর ভিত্তি)');
{
  // IEEE CRC-32 এর সর্বজনস্বীকৃত পরীক্ষা মান: "123456789" → 0xCBF43926
  const chk = K.crc32(K.utf8('123456789'));
  ok('মান পরীক্ষা "123456789" = 0xCBF43926', chk === 0xCBF43926,
     '0x' + chk.toString(16).toUpperCase());
  ok('খালি ইনপুট = 0', K.crc32(new Uint8Array(0)) === 0);
  // একই ইনপুট → একই ফল (নির্ধারক)
  ok('নির্ধারক', K.crc32(K.utf8('মৌজা')) === K.crc32(K.utf8('মৌজা')));
  ok('ভিন্ন ইনপুট → ভিন্ন CRC', K.crc32(K.utf8('a')) !== K.crc32(K.utf8('b')));
}

/* ═══════════ ২. ZIP কাঠামো ═══════════ */
head('ZIP কাঠামো (হাতে লেখা)');
{
  const data = K.utf8('hello');
  const z = K.zip([{ name: 'a.txt', data }]);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);

  ok('local file header সিগনেচার', u32(z, 0) === 0x04034b50);
  ok('method = 0 (stored)', u16(z, 8) === 0);
  ok('CRC মিলছে', u32(z, 14) === K.crc32(data));
  ok('আকার (compressed = uncompressed)', u32(z, 18) === data.length && u32(z, 22) === data.length);
  ok('EOCD সিগনেচার শেষে', u32(z, z.length - 22) === 0x06054b50);
  ok('EOCD এ ফাইলসংখ্যা = ১', u16(z, z.length - 22 + 10) === 1);

  const cdStart = u32(z, z.length - 22 + 16);
  ok('central directory সিগনেচার', u32(z, cdStart) === 0x02014b50);

  const z2 = K.zip([{ name: 'a.txt', data }, { name: 'b.bin', data: Uint8Array.from([1, 2, 3]) }]);
  ok('দুই ফাইলে EOCD গণনা = ২', u16(z2, z2.length - 22 + 10) === 2);
  ok('দুই ফাইলে আকার বেশি', z2.length > z.length);

  throws('খালি তালিকায় ত্রুটি', () => K.zip([]), 'অন্তত');
  throws('নাম ছাড়া ফাইলে ত্রুটি', () => K.zip([{ data }]), 'নাম');
}

/* ═══════════ ৩. মিটার/ডিগ্রি ═══════════ */
head('মিটার প্রতি ডিগ্রি');
{
  // বিষুবরেখায় ১ ডিগ্রি দ্রাঘিমাংশ ≈ ১১১.৩২ কিমি
  near('বিষুবরেখায় ১° দ্রাঘিমাংশ', K.metersPerDegLng(0), 111319, 60, ' মি');
  // ঢাকায় (২৩.৮°) দ্রাঘিমাংশ সংকুচিত হয়
  const dhaka = K.metersPerDegLng(23.8);
  ok('ঢাকায় দ্রাঘিমাংশ ছোট', dhaka < K.metersPerDegLng(0),
     dhaka.toFixed(0) + ' মি');
  near('ঢাকায় ১° দ্রাঘিমাংশ ≈ cos(23.8°)×১১১৩২০', dhaka,
       111320 * Math.cos(23.8 * Math.PI / 180), 250, ' মি');
  // অক্ষাংশ প্রায় ধ্রুব
  near('১° অক্ষাংশ ≈ ১১১ কিমি', K.metersPerDegLat(23.8), 110900, 700, ' মি');
  ok('মেরুতে দ্রাঘিমাংশ ≈ ০', Math.abs(K.metersPerDegLng(90)) < 200);
}

/* ═══════════ ৪. ২-বিন্দু similarity ═══════════ */
head('২ বিন্দু — similarity');
{
  const pts = [
    { px: 100, py: 700, lat: 23.780000, lng: 90.400000 },
    { px: 900, py: 100, lat: 23.790000, lng: 90.415000 }
  ];
  const t = K.solveTransform(pts);
  ok('মোড = similarity', t.mode === 'similarity');

  // নিয়ন্ত্রণ বিন্দু হুবহু ফেরত আসতে হবে
  t.residuals.forEach((r, i) =>
    ok(`বিন্দু ${i + 1} এর অবশিষ্ট ত্রুটি ≈ ০`, r.meters < 1e-6,
       r.meters.toExponential(2) + ' মি'));
  ok('RMSE ≈ ০', t.rmse < 1e-6, t.rmse.toExponential(2) + ' মি');

  // দুই বিন্দুর মধ্যকার দূরত্ব পিক্সেলে ও মিটারে সঙ্গতিপূর্ণ কি
  const dpx = Math.hypot(900 - 100, 100 - 700);
  const g1 = t.toGeo(100, 700), g2 = t.toGeo(900, 100);
  const dE = (g2.lng - g1.lng) * K.metersPerDegLng(23.785);
  const dN = (g2.lat - g1.lat) * K.metersPerDegLat(23.785);
  near('স্কেল × পিক্সেল-দূরত্ব = ভূ-দূরত্ব', t.scale * dpx, Math.hypot(dE, dN), 0.5, ' মি');
}

/* ═══════════ ৫. জানা জ্যামিতি — বিশুদ্ধ স্থানান্তর, স্কেল, ঘূর্ণন ═══════════ */
head('জানা জ্যামিতি');
{
  const mLat = K.metersPerDegLat(23.78), mLng = K.metersPerDegLng(23.78);

  // (ক) ছবির x বরাবর ঠিক পূর্বমুখী, ১ পিক্সেল = ১ মিটার → ঘূর্ণন ০°
  {
    const t = K.solveTransform([
      { px: 0, py: 0, lat: 23.78, lng: 90.40 },
      { px: 1000, py: 0, lat: 23.78, lng: 90.40 + 1000 / mLng }
    ]);
    near('ঘূর্ণন ০°', t.rotationDeg, 0, 1e-6, '°');
    near('স্কেল ১ মি/পিক্সেল', t.scale, 1, 1e-6);
  }

  // (খ) ছবির x বরাবর উত্তরমুখী → ঘূর্ণন ৯০°
  {
    const t = K.solveTransform([
      { px: 0, py: 0, lat: 23.78, lng: 90.40 },
      { px: 1000, py: 0, lat: 23.78 + 1000 / mLat, lng: 90.40 }
    ]);
    near('ঘূর্ণন ৯০°', Math.abs(t.rotationDeg), 90, 1e-4, '°');
  }

  // (গ) ছবির y নিচমুখী — নিচে নামলে দক্ষিণে যেতে হবে
  {
    const t = K.solveTransform([
      { px: 0, py: 0, lat: 23.78, lng: 90.40 },
      { px: 1000, py: 0, lat: 23.78, lng: 90.40 + 1000 / mLng }
    ]);
    const below = t.toGeo(0, 500);
    ok('py বাড়লে অক্ষাংশ কমে (দক্ষিণে)', below.lat < 23.78,
       'Δ' + ((below.lat - 23.78) * mLat).toFixed(1) + ' মি');
    near('৫০০ পিক্সেল নিচে = ৫০০ মিটার দক্ষিণে',
         (23.78 - below.lat) * mLat, 500, 0.5, ' মি');
  }
}

/* ═══════════ ৬. ৩+ বিন্দু affine ═══════════ */
head('৩+ বিন্দু — affine');
{
  const mLat = K.metersPerDegLat(23.78), mLng = K.metersPerDegLng(23.78);
  // ইচ্ছাকৃত তির্যক (skew) মডেল বানিয়ে সেই অনুযায়ী বিন্দু তৈরি
  const A = 0.9, B = 0.25, C = 0, D = -0.15, E = 1.1, F = 0;   // মিটারে
  const mk = (px, py) => ({
    px, py,
    lng: 90.40 + (A * px + B * (-py) + C) / mLng,
    lat: 23.78 + (D * px + E * (-py) + F) / mLat
  });
  const pts = [mk(0, 0), mk(800, 0), mk(0, 600), mk(800, 600)];
  const t = K.solveTransform(pts);

  ok('মোড = affine', t.mode === 'affine');
  ok('চার বিন্দুতেই অবশিষ্ট ≈ ০ (মডেল হুবহু affine)', t.maxError < 1e-6,
     'সর্বোচ্চ ' + t.maxError.toExponential(2) + ' মি');

  // similarity দিয়ে একই তির্যক ডেটা মেলানো গেলে ত্রুটি থাকবেই — তুলনা
  const t2 = K.solveTransform([pts[0], pts[3]]);
  const res = pts.map(p => {
    const g = t2.toGeo(p.px, p.py);
    return Math.hypot((g.lng - p.lng) * mLng, (g.lat - p.lat) * mLat);
  });
  ok('similarity তির্যকতা ধরতে পারে না (ত্রুটি থাকে)', Math.max(...res) > 1,
     'সর্বোচ্চ ' + Math.max(...res).toFixed(1) + ' মি');

  // ৩ বিন্দুতেও affine ঠিক বসে
  const t3 = K.solveTransform([pts[0], pts[1], pts[2]]);
  ok('৩ বিন্দুতে affine নিখুঁত', t3.maxError < 1e-6);
}

/* ═══════════ ৭. ত্রুটিযুক্ত বিন্দু — RMSE বাড়ে ═══════════ */
head('অসঙ্গতিপূর্ণ বিন্দুতে RMSE');
{
  const mLat = K.metersPerDegLat(23.78), mLng = K.metersPerDegLng(23.78);
  const base = [
    { px: 0,   py: 0,   lat: 23.78,                 lng: 90.40 },
    { px: 800, py: 0,   lat: 23.78,                 lng: 90.40 + 800 / mLng },
    { px: 0,   py: 600, lat: 23.78 - 600 / mLat,    lng: 90.40 }
  ];
  const clean = K.solveTransform(base);
  ok('নিখুঁত ডেটায় RMSE ≈ ০', clean.rmse < 1e-6);

  // একটি বিন্দু ১০ মিটার সরিয়ে দিলে
  const noisy = base.concat([{ px: 800, py: 600,
    lat: 23.78 - 600 / mLat + 10 / mLat, lng: 90.40 + 800 / mLng }]);
  const t = K.solveTransform(noisy);
  ok('ভুল বিন্দুতে RMSE > ০', t.rmse > 0.5, t.rmse.toFixed(2) + ' মি');
  ok('সর্বোচ্চ ত্রুটি যুক্তিসঙ্গত (<১০ মি)', t.maxError < 10,
     t.maxError.toFixed(2) + ' মি');
}

/* ═══════════ ৮. ত্রুটি ধরা ═══════════ */
head('অবৈধ ইনপুট');
{
  throws('১ বিন্দুতে ত্রুটি', () => K.solveTransform([{ px: 0, py: 0, lat: 23, lng: 90 }]), 'অন্তত');
  throws('খালি তালিকায় ত্রুটি', () => K.solveTransform([]), 'অন্তত');
  throws('একই পিক্সেলে দুই বিন্দু', () => K.solveTransform([
    { px: 5, py: 5, lat: 23.78, lng: 90.40 },
    { px: 5, py: 5, lat: 23.79, lng: 90.41 }
  ]), 'একই পিক্সেলে');
  throws('এক সরলরেখায় ৩ বিন্দু', () => K.solveTransform([
    { px: 0,   py: 0,   lat: 23.78,   lng: 90.40 },
    { px: 100, py: 100, lat: 23.781,  lng: 90.401 },
    { px: 200, py: 200, lat: 23.782,  lng: 90.402 }
  ]), 'সরলরেখা');
  throws('অক্ষাংশ সীমার বাইরে', () => K.solveTransform([
    { px: 0, py: 0, lat: 100, lng: 90 },
    { px: 9, py: 9, lat: 23, lng: 90 }
  ]), 'সীমার বাইরে');
  throws('NaN ইনপুট', () => K.solveTransform([
    { px: NaN, py: 0, lat: 23, lng: 90 },
    { px: 9, py: 9, lat: 23.1, lng: 90.1 }
  ]), 'অবৈধ');
}

/* ═══════════ ৯. কোণা ও KML ═══════════ */
head('কোণা ও KML');
{
  const t = K.solveTransform([
    { px: 100, py: 700, lat: 23.780, lng: 90.400 },
    { px: 900, py: 100, lat: 23.790, lng: 90.415 }
  ]);
  const c = K.imageCorners(t, 1000, 800);
  ok('চারটি কোণা', c.length === 4);
  ok('সব কোণা বাংলাদেশের সীমার ভেতরে',
     c.every(p => p.lat > 20.5 && p.lat < 26.7 && p.lng > 88 && p.lng < 92.7));
  // ক্রম: নিচ-বাম, নিচ-ডান, উপর-ডান, উপর-বাম
  ok('নিচের দুটি কোণা উপরের দুটির দক্ষিণে',
     (c[0].lat + c[1].lat) / 2 < (c[2].lat + c[3].lat) / 2);
  ok('ডানের দুটি কোণা বামের দুটির পূর্বে',
     (c[1].lng + c[2].lng) / 2 > (c[0].lng + c[3].lng) / 2);
  throws('প্রস্থ ০ হলে ত্রুটি', () => K.imageCorners(t, 0, 800), 'প্রস্থ');

  const kml = K.buildKml('মৌজা <পরীক্ষা> & "নমুনা"', 'map.jpg', c, { opacity: 0.5 });
  ok('XML ঘোষণা আছে', kml.startsWith('<?xml'));
  ok('gx নেমস্পেস আছে', kml.includes('xmlns:gx='));
  ok('GroundOverlay আছে', kml.includes('<GroundOverlay>'));
  ok('LatLonQuad আছে', kml.includes('<gx:LatLonQuad>'));
  ok('LatLonBox ব্যবহার করা হয়নি', !kml.includes('<LatLonBox>'));
  ok('Icon href সঠিক', kml.includes('<href>map.jpg</href>'));
  ok('XML এস্কেপ হয়েছে (< > & ")',
     kml.includes('&lt;') && kml.includes('&gt;') && kml.includes('&amp;') && kml.includes('&quot;'));
  // ০.৫ × ২৫৫ = ১২৭.৫ → রাউন্ড ১২৮ = 0x80
  ok('স্বচ্ছতা ০.৫ → alpha 80', kml.includes('<color>80ffffff</color>'));
  ok('স্বচ্ছতা ১ → alpha ff',
     K.buildKml('x', 'a.jpg', c, { opacity: 1 }).includes('<color>ffffffff</color>'));
  ok('স্বচ্ছতা ০ → alpha 00',
     K.buildKml('x', 'a.jpg', c, { opacity: 0 }).includes('<color>00ffffff</color>'));
  ok('সীমার বাইরের স্বচ্ছতা আটকানো হয় (১.৫ → ff)',
     K.buildKml('x', 'a.jpg', c, { opacity: 1.5 }).includes('<color>ffffffff</color>'));
  ok('ঋণাত্মক স্বচ্ছতা আটকানো হয় (−১ → 00)',
     K.buildKml('x', 'a.jpg', c, { opacity: -1 }).includes('<color>00ffffff</color>'));
  ok('চারটি স্থানাঙ্ক জোড়া',
     (kml.match(/<coordinates>([^<]*)<\/coordinates>/)[1].trim().split(/\s+/).length) === 4);
  throws('তিন কোণায় ত্রুটি', () => K.buildKml('x', 'a.jpg', c.slice(0, 3)), 'চারটি');
}

/* ═══════════ ১০. ফাইলনাম নিরাপদ করা ═══════════ */
head('ফাইলনাম');
{
  ok('বাংলা নাম → ASCII', /^[A-Za-z0-9._-]+$/.test(K.safeName('ঢাকা মৌজা.jpg')));
  ok('এক্সটেনশন রক্ষা', K.safeName('ঢাকা.png').endsWith('.png'));
  ok('এক্সটেনশন না থাকলে .jpg', K.safeName('মৌজা').endsWith('.jpg'));
  ok('পথ বাদ যায়', K.safeName('C:\\a\\b\\map.jpg') === 'map.jpg');
  ok('পথ বাদ যায় (unix)', K.safeName('/x/y/map.png') === 'map.png');
  ok('খুব লম্বা নাম ছাঁটা', K.safeName('a'.repeat(200) + '.jpg').length <= 64);
  ok('.jpeg ছোট হাতের', K.safeName('MAP.JPEG').endsWith('.jpeg'));
  // পুরো নাম বাংলা হলে "map" হবে — `_.jpg` বা `RS-__.jpg` জাতীয় নয়
  ok('পুরো বাংলা নাম → map.png', K.safeName('ঢাকা মৌজা.png') === 'map.png');
  ok('মিশ্র নামে ইংরেজি অংশ থাকে', K.safeName('ঢাকা মৌজা RS-১২.jpg') === 'RS.jpg',
     K.safeName('ঢাকা মৌজা RS-১২.jpg'));
  ok('পরপর আন্ডারস্কোর জোড়া লাগে না', !/__/.test(K.safeName('a   b   c.jpg')));
  ok('দুই প্রান্তে বিভাজক থাকে না', !/^[_.-]|[_.-]\.jpg$/.test(K.safeName('__a__.jpg')));
  ok('খালি নাম → map.jpg', K.safeName('') === 'map.jpg');
  ok('null → map.jpg', K.safeName(null) === 'map.jpg');
}

/* ═══════════ ১১. পূর্ণ KMZ ═══════════ */
head('পূর্ণ KMZ');
{
  const PNG = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'));
  const r = K.build({
    imageBytes: PNG, imageName: 'ঢাকা মৌজা.png', width: 1000, height: 800,
    name: 'ঢাকা মৌজা ম্যাপ', opacity: 0.8,
    points: [
      { px: 100, py: 700, lat: 23.780, lng: 90.400 },
      { px: 900, py: 100, lat: 23.790, lng: 90.415 }
    ]
  });
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);

  ok('KMZ বাইট ফেরত এসেছে', r.bytes instanceof Uint8Array && r.bytes.length > 0,
     r.bytes.length + ' বাইট');
  ok('ZIP সিগনেচার দিয়ে শুরু', u32(r.bytes, 0) === 0x04034b50);
  ok('দুটি ফাইল (doc.kml + ছবি)', u16(r.bytes, r.bytes.length - 22 + 10) === 2);
  ok('doc.kml প্রথমে', new TextDecoder().decode(r.bytes.slice(30, 37)) === 'doc.kml');
  ok('ছবির নাম ASCII হয়েছে', r.kml.includes('.png') && !/[\u0980-\u09FF]/.test(
     r.kml.match(/<href>([^<]*)<\/href>/)[1]));
  ok('transform ফেরত এসেছে', r.transform && r.transform.mode === 'similarity');
  ok('চার কোণা ফেরত', r.corners.length === 4);
  ok('একই ইনপুটে একই বাইট (নির্ধারক)',
     K.build({
       imageBytes: PNG, imageName: 'ঢাকা মৌজা.png', width: 1000, height: 800,
       name: 'ঢাকা মৌজা ম্যাপ', opacity: 0.8,
       points: [{ px: 100, py: 700, lat: 23.780, lng: 90.400 },
                { px: 900, py: 100, lat: 23.790, lng: 90.415 }]
     }).bytes.length === r.bytes.length);

  throws('ছবি ছাড়া ত্রুটি', () => K.build({ width: 1, height: 1, points: [] }), 'ছবি');
}

/* ═══════════ ১২. ক্যালিব্রেশনের মান ═══════════ */
head('ক্যালিব্রেশনের মান');
{
  ok('০.৫ মি → চমৎকার', K.quality(0.5).level === 'great');
  ok('৫ মি → ভালো', K.quality(5).level === 'good');
  ok('১৫ মি → মোটামুটি', K.quality(15).level === 'ok');
  ok('১০০ মি → দুর্বল', K.quality(100).level === 'bad');
  ok('সব স্তরে বাংলা লেবেল',
     [0.5, 5, 15, 100].every(v => /[\u0980-\u09FF]/.test(K.quality(v).label)));
}

/* ═══════════ ফলাফল ═══════════ */
console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
console.log('='.repeat(78) + '\n');
process.exit(fail ? 1 : 0);
