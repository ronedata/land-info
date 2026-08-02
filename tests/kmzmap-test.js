/* ==========================================================================
   tests/kmzmap-test.js — টাইল ভিউয়ারের Web Mercator গণিত
   চালাও:  node tests/kmzmap-test.js
   ========================================================================== */

const M = require('../js/kmz-ui.js');

let pass = 0, fail = 0;
const head = t => console.log('\n\x1b[36m── ' + t + ' ──\x1b[0m');
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  \x1b[31m✗ ' + name + (extra ? '   ' + extra : '') + '\x1b[0m'); }
}
function near(name, got, want, tol, unit) {
  ok(name, Math.abs(got - want) <= tol,
     `পাওয়া ${got.toFixed(8)}${unit || ''} · প্রত্যাশিত ${want.toFixed(8)}${unit || ''}`);
}

/* ═══════════ ১. জানা মান ═══════════ */
head('Web Mercator — জানা মান');
{
  // z=0 এ পুরো পৃথিবী একটি ২৫৬×২৫৬ টাইল; (০,০) ঠিক মাঝখানে
  const w = M.lngLatToWorld(0, 0, 0);
  near('(০°,০°) z=0 → বিশ্ব-পিক্সেল x', w.x, 128, 1e-9);
  near('(০°,০°) z=0 → বিশ্ব-পিক্সেল y', w.y, 128, 1e-9);

  // পশ্চিম প্রান্ত
  near('দ্রাঘিমাংশ −১৮০° → x = ০', M.lngLatToWorld(-180, 0, 0).x, 0, 1e-9);
  near('দ্রাঘিমাংশ +১৮০° → x = ২৫৬', M.lngLatToWorld(180, 0, 0).x, 256, 1e-9);

  // z বাড়লে দ্বিগুণ
  near('z=1 এ (০,০) → ২৫৬', M.lngLatToWorld(0, 0, 1).x, 256, 1e-9);
  near('z=16 এ প্রস্থ = ২৫৬×2^16', M.lngLatToWorld(180, 0, 16).x, 256 * 65536, 1e-6);
}

/* ═══════════ ২. রাউন্ড-ট্রিপ ═══════════ */
head('রাউন্ড-ট্রিপ (lngLat → world → lngLat)');
{
  const cases = [
    ['ঢাকা', 23.7806, 90.4074],
    ['চট্টগ্রাম', 22.3569, 91.7832],
    ['তেঁতুলিয়া (উত্তর প্রান্ত)', 26.5931, 88.3931],
    ['টেকনাফ (দক্ষিণ প্রান্ত)', 20.8600, 92.2989],
    ['বিষুবরেখা', 0, 0],
    ['ঋণাত্মক দ্রাঘিমাংশ', 40.7128, -74.0060]
  ];
  for (const [name, lat, lng] of cases) {
    let worst = 0;
    for (const z of [5, 10, 16, 19]) {
      const w = M.lngLatToWorld(lng, lat, z);
      const g = M.worldToLngLat(w.x, w.y, z);
      worst = Math.max(worst, Math.abs(g.lat - lat), Math.abs(g.lng - lng));
    }
    // ডিগ্রি → মিটার (মোটামুটি) দিয়ে বোঝানো
    ok(`${name}: সব জুমে ফেরত আসে`, worst < 1e-9,
       'সর্বোচ্চ পার্থক্য ' + worst.toExponential(2) + '°');
  }
}

/* ═══════════ ৩. দিক ═══════════ */
head('দিক ঠিক আছে?');
{
  const z = 16;
  const a = M.lngLatToWorld(90.40, 23.78, z);
  const east = M.lngLatToWorld(90.41, 23.78, z);
  const north = M.lngLatToWorld(90.40, 23.79, z);
  ok('পূর্বে গেলে x বাড়ে', east.x > a.x);
  ok('উত্তরে গেলে y কমে (পর্দায় উপরে)', north.y < a.y);
}

/* ═══════════ ৪. স্কেল ═══════════ */
head('স্কেল (মিটার প্রতি পিক্সেল)');
{
  // বিষুবরেখায় z এ: ১৫৬৫৪৩.০৩ / 2^z মিটার/পিক্সেল (প্রচলিত মান)
  for (const z of [10, 16, 19]) {
    const w1 = M.lngLatToWorld(0, 0, z);
    const w2 = M.lngLatToWorld(0.001, 0, z);
    const dpx = w2.x - w1.x;
    const dm = 0.001 * 111319.49;                 // বিষুবরেখায় ০.০০১° দ্রাঘিমাংশ
    const mpp = dm / dpx;
    const expect = 156543.03 / Math.pow(2, z);
    near(`z=${z} এ মিটার/পিক্সেল`, mpp, expect, expect * 0.001);
  }
}

/* ═══════════ ৫. অক্ষাংশ আটকানো ═══════════ */
head('মার্কেটরের সীমা');
{
  ok('৯০° আটকে ৮৫.০৫ হয়', Math.abs(M.clampLat(90) - 85.05112878) < 1e-6);
  ok('−৯০° আটকে −৮৫.০৫ হয়', Math.abs(M.clampLat(-90) + 85.05112878) < 1e-6);
  ok('স্বাভাবিক মান অপরিবর্তিত', M.clampLat(23.78) === 23.78);
  const w = M.lngLatToWorld(0, M.clampLat(90), 0);
  ok('সীমায় y ঋণাত্মক নয়', w.y >= -1e-6 && isFinite(w.y), 'y=' + w.y.toFixed(6));
}

/* ═══════════ ৬. টাইল URL ═══════════ */
head('টাইল URL');
{
  const u = M.tileUrl(16, 49226, 28308);
  ok('z/y/x ঠিক ক্রমে (Esri)', u.endsWith('/16/28308/49226'), u.slice(-30));
  ok('https', u.startsWith('https://'));
  ok('কোনো API key নেই', !/key=|token=|apikey/i.test(u));
  ok('কোনো প্লেসহোল্ডার বাকি নেই', !/\{[zxy]\}/.test(u));

  // ঢাকার টাইল সংখ্যা মিলিয়ে দেখা (স্বাধীন সূত্রে)
  const z = 16, lat = 23.7806, lng = 90.4074;
  const n = Math.pow(2, z);
  const tx = Math.floor((lng + 180) / 360 * n);
  const ty = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  const w = M.lngLatToWorld(lng, lat, z);
  ok('ঢাকার টাইল x মেলে', Math.floor(w.x / 256) === tx, `${Math.floor(w.x / 256)} = ${tx}`);
  ok('ঢাকার টাইল y মেলে', Math.floor(w.y / 256) === ty, `${Math.floor(w.y / 256)} = ${ty}`);
}

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
console.log('='.repeat(78) + '\n');
process.exit(fail ? 1 : 0);
