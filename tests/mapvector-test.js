/* ==========================================================================
   tests/mapvector-test.js — স্ক্যান করা নকশা থেকে ভেক্টর রেখা
   চালাও:  node tests/mapvector-test.js
   ========================================================================== */

const V = require('../js/map-vector.js');
const K = require('../js/kmz-export.js');

let pass = 0, fail = 0;
const head = t => console.log('\n\x1b[36m── ' + t + ' ──\x1b[0m');
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  \x1b[31m✗ ' + name + (extra ? '   ' + extra : '') + '\x1b[0m'); }
}
function throws(name, fn, match) {
  try { fn(); ok(name, false, 'ত্রুটি আসেনি'); }
  catch (e) { ok(name, !match || e.message.includes(match), e.message.slice(0, 60)); }
}

/* কৃত্রিম নকশা আঁকার সহায়ক — সাদা কাগজে গাঢ় দাগ */
function blank(w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 245; d[i + 3] = 255; }
  return d;
}
function dot(d, w, x, y, t) {
  const r = Math.floor((t || 1) / 2);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const i = ((y + dy) * w + (x + dx)) * 4;
    if (i >= 0 && i + 3 < d.length) { d[i] = d[i + 1] = d[i + 2] = 20; }
  }
}
function line(d, w, x1, y1, x2, y2, t) {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= n; i++) {
    dot(d, w, Math.round(x1 + (x2 - x1) * i / n), Math.round(y1 + (y2 - y1) * i / n), t);
  }
}

const W = 200, H = 160;

/* ═══════════ ১. থ্রেশহোল্ড ═══════════ */
head('কালি বনাম কাগজ');
{
  const d = blank(20, 10);
  dot(d, 20, 5, 5, 1);
  const m = V.toMask(d, 20, 10);
  ok('কালির পিক্সেল ১', m[5 * 20 + 5] === 1);
  ok('কাগজের পিক্সেল ০', m[0] === 0);
  let ink = 0; for (let i = 0; i < m.length; i++) ink += m[i];
  ok('কেবল একটি পিক্সেল কালি', ink === 1, ink + 'টি');

  // ★ স্বচ্ছ পিক্সেল কাগজ ধরতে হবে — নইলে ব্যাকগ্রাউন্ড-মোছা ছবিতে
  //   পুরো মোছা অংশটাই কালি হয়ে যেত (rgb ০,০,০ থাকে)
  const t = new Uint8ClampedArray(4 * 4);
  const m2 = V.toMask(t, 2, 2);
  let ink2 = 0; for (let i = 0; i < m2.length; i++) ink2 += m2[i];
  ok('স্বচ্ছ পিক্সেল কালি নয়', ink2 === 0, ink2 + 'টি');

  ok('সীমা বদলানো যায়', V.toMask(blank(2, 2), 2, 2, { threshold: 255 })[0] === 1);
  throws('মাপ ছাড়া ত্রুটি', () => V.toMask(blank(2, 2), 0, 2), 'প্রস্থ ও উচ্চতা');
  throws('ছোট ডেটায় ত্রুটি', () => V.toMask(new Uint8ClampedArray(4), 10, 10), 'ছোট পড়ে');
}

/* ═══════════ ২. সরলরেখা ═══════════ */
head('মোটা সরলরেখা → দুই বিন্দু');
{
  const d = blank(W, H);
  line(d, W, 20, 80, 180, 80, 5);          // ৫ পিক্সেল মোটা
  const r = V.vectorize(d, W, H, { tolerance: 1.2 });

  ok('একটিই পথ', r.paths.length === 1, r.paths.length + 'টি');
  const p = r.paths[0];
  ok('সরলীকরণের পর ঠিক ২ বিন্দু', p.length === 2, p.length + 'টি');
  ok('কাঁচা বিন্দু অনেক বেশি ছিল', r.stats.pointsBefore > 100, r.stats.pointsBefore + 'টি');
  // ★ থিনিং মাঝ বরাবর কঙ্কাল দেয় — ৫ পিক্সেল মোটা রেখার মাঝ y = ৮০
  ok('রেখা মাঝ বরাবর (y = ৮০)', p.every(q => Math.abs(q.y - 80) <= 1),
     p.map(q => q.y).join(','));
  ok('দুই প্রান্ত ঠিক জায়গায়',
     Math.abs(p[0].x - 20) <= 2 && Math.abs(p[1].x - 179) <= 2,
     p[0].x + ' → ' + p[1].x);
  ok('থিনিং কয়েক চক্রেই থামে', r.stats.thinIterations <= 10, r.stats.thinIterations);
}

/* ═══════════ ৩. আয়ত ═══════════ */
head('আয়তের সীমানা');
{
  const d = blank(W, H);
  line(d, W, 30, 30, 170, 30, 3);
  line(d, W, 170, 30, 170, 130, 3);
  line(d, W, 170, 130, 30, 130, 3);
  line(d, W, 30, 130, 30, 30, 3);
  const r = V.vectorize(d, W, H, { tolerance: 1.5 });

  ok('পথ পাওয়া গেছে', r.paths.length > 0, r.paths.length + 'টি');
  const all = [].concat.apply([], r.paths);
  const xs = all.map(q => q.x), ys = all.map(q => q.y);
  ok('বাঁ সীমা ≈ ৩০', Math.abs(Math.min.apply(null, xs) - 30) <= 2, Math.min.apply(null, xs));
  ok('ডান সীমা ≈ ১৭০', Math.abs(Math.max.apply(null, xs) - 170) <= 2, Math.max.apply(null, xs));
  ok('উপর সীমা ≈ ৩০', Math.abs(Math.min.apply(null, ys) - 30) <= 2, Math.min.apply(null, ys));
  ok('নিচ সীমা ≈ ১৩০', Math.abs(Math.max.apply(null, ys) - 130) <= 2, Math.max.apply(null, ys));
  ok('বিন্দু অনেক কমেছে', r.stats.pointsAfter < r.stats.pointsBefore / 10,
     r.stats.pointsBefore + ' → ' + r.stats.pointsAfter);
}

/* ═══════════ ৪. ফুটকি ═══════════ */
head('স্ক্যানের ময়লা বাদ দেওয়া');
{
  const mk = () => {
    const d = blank(W, H);
    line(d, W, 20, 80, 180, 80, 3);
    for (let i = 0; i < 25; i++) dot(d, W, 10 + (i * 7) % 180, 20 + (i * 13) % 40, 1);
    return d;
  };
  const keep = V.vectorize(mk(), W, H, { minSpeck: 1, tolerance: 1.2 });
  const clean = V.vectorize(mk(), W, H, { minSpeck: 12, tolerance: 1.2 });

  ok('ফুটকি সরানো হয়েছে', clean.stats.specksRemoved === 25,
     clean.stats.specksRemoved + 'টি');
  ok('আসল রেখা টিকে আছে', clean.paths.length === 1, clean.paths.length + 'টি পথ');
  ok('না সরালেও রেখা আছে', keep.paths.length >= 1);
  ok('খালি কাগজে কোনো পথ নেই', V.vectorize(blank(W, H), W, H).paths.length === 0);
}

/* ═══════════ ৫. Douglas–Peucker ═══════════ */
head('সরলীকরণ');
{
  const straight = [];
  for (let x = 0; x <= 100; x++) straight.push({ x: x, y: 50 });
  ok('সোজা রেখা ১০১ → ২ বিন্দু', V.simplify(straight, 1).length === 2);
  ok('সহনশীলতা ০ হলে অপরিবর্তিত', V.simplify(straight, 0).length === 101);

  const zig = [];
  for (let x = 0; x <= 100; x += 2) zig.push({ x: x, y: 50 + (x % 4 === 0 ? 0 : 8) });
  ok('জিগজ্যাগ কড়া সহনশীলতায় থাকে', V.simplify(zig, 1).length === zig.length);
  ok('জিগজ্যাগ ঢিলে সহনশীলতায় মেলায়', V.simplify(zig, 20).length === 2);

  ok('২ বিন্দু অপরিবর্তিত', V.simplify([{ x: 0, y: 0 }, { x: 5, y: 5 }], 1).length === 2);
  ok('খালি তালিকা নিরাপদ', V.simplify([], 1).length === 0);

  // ★ কোণা যেন হারিয়ে না যায় — সরলীকরণের মূল দায়িত্ব
  const corner = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];
  ok('সমকোণ টিকে থাকে', V.simplify(corner, 1).length === 3);
}

/* ═══════════ ৬. ভূ-রূপান্তর ═══════════ */
head('পিক্সেল → অক্ষাংশ/দ্রাঘিমাংশ');
{
  const mLat = K.metersPerDegLat(23.78), mLng = K.metersPerDegLng(23.78);
  const pairs = [[0, 0], [1000, 0], [0, 800], [1000, 800]].map(a => ({
    px: a[0], py: a[1],
    lng: 90.40 + (0.5 * a[0]) / mLng,
    lat: 23.78 - (0.5 * a[1]) / mLat
  }));
  const t = K.solveTransform(pairs);
  const paths = [[{ x: 0, y: 0 }, { x: 100, y: 0 }]];

  const g1 = V.toGeoPaths(paths, t.toGeo, 1);
  const d1 = (g1[0][1].lng - g1[0][0].lng) * mLng;
  ok('scale ১ → ১০০ পিক্সেল = ৫০ মিটার', Math.abs(d1 - 50) < 0.1, d1.toFixed(3) + ' মি');

  // ★ মাস্ক ছোট করা হলে scale দিয়ে মূল পিক্সেলে ফেরাতেই হবে —
  //   না ফেরালে পুরো নকশা ছোট হয়ে ভুল জায়গায় বসত
  const g5 = V.toGeoPaths(paths, t.toGeo, 5);
  const d5 = (g5[0][1].lng - g5[0][0].lng) * mLng;
  ok('scale ৫ → ২৫০ মিটার', Math.abs(d5 - 250) < 0.5, d5.toFixed(3) + ' মি');

  ok('পথের গঠন অক্ষত', g1.length === 1 && g1[0].length === 2);
  throws('toGeo ছাড়া ত্রুটি', () => V.toGeoPaths(paths, null), 'toGeo');
}

/* ═══════════ ৭. আকার সীমা ═══════════ */
head('ভেক্টর করার আগে ছবি ছোট করা');
{
  ok('সীমা ২০৪৮', V.VECTOR_MAX_SIDE === 2048);
  ok('ছোট ছবি অপরিবর্তিত', !V.vectorFit(1600, 1200).resized);
  const f = V.vectorFit(4096, 3072);
  ok('বড় ছবি অর্ধেক হয়', f.resized && f.width === 2048 && f.height === 1536,
     f.width + '×' + f.height);
  ok('অনুপাত অক্ষত', Math.abs(f.width / f.height - 4096 / 3072) < 1e-6);
  ok('অতি লম্বাটে ছবিতেও ≥ ১', V.vectorFit(100000, 300).height >= 1);
  throws('শূন্য মাপে ত্রুটি', () => V.vectorFit(0, 10), 'প্রস্থ ও উচ্চতা');
}

/* ═══════════ ৮. KML এ ভেক্টর ═══════════ */
head('ভেক্টর KMZ');
{
  const mLat = K.metersPerDegLat(23.78), mLng = K.metersPerDegLng(23.78);
  const pairs = [[0, 0], [1000, 0], [0, 800], [1000, 800]].map(a => ({
    px: a[0], py: a[1],
    lng: 90.40 + (0.5 * a[0]) / mLng,
    lat: 23.78 - (0.5 * a[1]) / mLat
  }));
  const t = K.solveTransform(pairs);
  const geo = V.toGeoPaths([[{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }],
                            [{ x: 100, y: 100 }, { x: 400, y: 300 }]], t.toGeo, 1);

  const r = K.build({ vectorPaths: geo, points: pairs, name: 'মৌজা',
                      lineColor: '#ff0000', lineWidth: 1.4 });
  ok('ছবি ছাড়াই KMZ হয়', r.bytes.length > 0);
  ok('GroundOverlay নেই', !/GroundOverlay/.test(r.kml));
  ok('দুটি LineString', (r.kml.match(/<LineString>/g) || []).length === 2);
  // ★ সব রেখা এক Placemark এর MultiGeometry তে — হাজারো Placemark দিলে
  //   Google Earth হামাগুড়ি দেয়
  ok('একটিই Placemark', (r.kml.match(/<Placemark>/g) || []).length === 1);
  ok('MultiGeometry ব্যবহার হয়েছে', /<MultiGeometry>/.test(r.kml));
  ok('tessellate আছে (ভূমি অনুসরণ করবে)', /<tessellate>1<\/tessellate>/.test(r.kml));
  ok('ZIP এ কেবল doc.kml', r.bytes.length < 3000, r.bytes.length + ' বাইট');
  ok('চার কোণা লাগেনি', r.corners === null);

  // ★ KML এ রঙের ক্রম aabbggrr — উল্টো, ভুল করা খুব সহজ
  ok('#ff0000 → ff0000ff', K.kmlColor('#ff0000') === 'ff0000ff', K.kmlColor('#ff0000'));
  ok('#00ff00 → ff00ff00', K.kmlColor('#00ff00') === 'ff00ff00', K.kmlColor('#00ff00'));
  ok('#0000ff → ffff0000', K.kmlColor('#0000ff') === 'ffff0000', K.kmlColor('#0000ff'));
  ok('#123456 → ff563412', K.kmlColor('#123456') === 'ff563412', K.kmlColor('#123456'));
  ok('অস্বচ্ছতা মানে', K.kmlColor('#ff0000', 0.5) === '800000ff', K.kmlColor('#ff0000', 0.5));
  ok('ভুল রঙে লাল ধরে', K.kmlColor('হিজিবিজি') === 'ff0000ff');

  // ছবি ও ভেক্টর একসাথে
  const both = K.build({ imageBytes: new Uint8Array([1, 2, 3]), imageName: 'm.jpg',
                         vectorPaths: geo, width: 1000, height: 800,
                         points: pairs, name: 'মৌজা' });
  ok('দুটোই থাকলে GroundOverlay আছে', /GroundOverlay/.test(both.kml));
  ok('দুটোই থাকলে LineString ও আছে', /<LineString>/.test(both.kml));
  ok('দুটোই থাকলে চার কোণা হিসাব হয়', both.corners && both.corners.length === 4);

  throws('ছবি ও ভেক্টর দুটোই না দিলে ত্রুটি',
    () => K.build({ points: pairs, width: 10, height: 10 }), 'ছবি অথবা ভেক্টর');
  throws('খালি ভেক্টর তালিকায়ও ত্রুটি',
    () => K.build({ points: pairs, vectorPaths: [], width: 10, height: 10 }),
    'ছবি অথবা ভেক্টর');
}

/* ═══════════ ৯. গতি ═══════════ */
head('বাস্তব আকারে গতি');
{
  const w = 2048, h = 1536;
  const d = blank(w, h);
  for (let i = 0; i < 40; i++) {
    line(d, w, 50, 40 + i * 37, w - 50, 40 + i * 37, 3);
    line(d, w, 50 + i * 49, 40, 50 + i * 49, h - 40, 3);
  }
  const t0 = Date.now();
  const r = V.vectorize(d, w, h, { tolerance: 1.2 });
  const ms = Date.now() - t0;
  ok('২০৪৮×১৫৩৬ · ৮০ রেখা — ৩ সেকেন্ডের কমে', ms < 3000,
     ms + ' ms · ' + r.paths.length + ' পথ · ' + r.stats.pointsAfter + ' বিন্দু');
  // ★ গ্রিডে প্রতিটি ছেদে রেখা ভাগ হয় — ৪০×৪০ ছেদে হাজারো টুকরো
  //   স্বাভাবিক, বাগ নয়
  ok('ছেদবিন্দুতে রেখা ভাগ হয়', r.paths.length > 1000, r.paths.length + 'টি');
}

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
console.log('='.repeat(78) + '\n');
process.exit(fail ? 1 : 0);
