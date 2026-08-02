/* ==========================================================================
   tests/kmzgeo-test.js — জায়গা খোঁজার ইঞ্জিন (নেটওয়ার্ক ছাড়া যা যাচাই করা যায়)
   চালাও:  node tests/kmzgeo-test.js
   ========================================================================== */

const M = require('../js/kmz-source.js');
const G = M.KmzGeo;

let pass = 0, fail = 0;
const head = t => console.log('\n\x1b[36m── ' + t + ' ──\x1b[0m');
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  \x1b[31m✗ ' + name + (extra ? '   ' + extra : '') + '\x1b[0m'); }
}

/* ═══════════ ১. বাংলাদেশের সীমা ═══════════ */
head('বাংলাদেশের সীমা');
{
  const inside = [
    ['ঢাকা', 23.7806, 90.4074],
    ['চট্টগ্রাম', 22.3569, 91.7832],
    ['তেঁতুলিয়া (উত্তর প্রান্ত)', 26.5931, 88.3931],
    ['টেকনাফ (দক্ষিণ প্রান্ত)', 20.8600, 92.2989],
    ['সাতক্ষীরা (পশ্চিম)', 22.7185, 89.0705]
  ];
  inside.forEach(([n, la, lo]) => ok(n + ' ভেতরে', G.inBd(la, lo)));

  const outside = [
    ['কলকাতা', 22.5726, 88.3639 - 1],
    ['দিল্লি', 28.6139, 77.2090],
    ['ইয়াঙ্গুন', 16.8409, 96.1735],
    ['লন্ডন', 51.5074, -0.1278],
    ['উত্তর মেরু', 89, 90]
  ];
  outside.forEach(([n, la, lo]) => ok(n + ' বাইরে', !G.inBd(la, lo)));
}

/* ═══════════ ২. স্থানাঙ্ক চেনা (সার্ভারে যাওয়ার আগেই) ═══════════ */
head('"অক্ষাংশ, দ্রাঘিমাংশ" চেনা');
{
  const good = [
    ['23.7806, 90.4074', 23.7806, 90.4074],
    ['23.7806 90.4074', 23.7806, 90.4074],
    ['  23.78 , 90.40  ', 23.78, 90.40],
    ['-23.5, 90.4', -23.5, 90.4]
  ];
  good.forEach(([t, la, lo]) => {
    const r = G.parseLatLng(t);
    ok('"' + t.trim() + '" চেনা যায়',
       r && Math.abs(r.lat - la) < 1e-9 && Math.abs(r.lng - lo) < 1e-9,
       r ? r.lat + ', ' + r.lng : 'null');
  });

  const bad = ['সাভার', 'Dhaka', '', '23.78', 'abc, def', '200, 300', '95, 90'];
  bad.forEach(t => ok('"' + t + '" স্থানাঙ্ক নয়', G.parseLatLng(t) === null));

  const r = G.parseLatLng('23.7806, 90.4074');
  ok('exact ফ্ল্যাগ বসে', r.exact === true);
  ok('নাম তৈরি হয়', /23\.780600, 90\.407400/.test(r.name), r.name);
}

/* ═══════════ ৩. ছোট প্রশ্ন প্রত্যাখ্যান ═══════════ */
head('অবৈধ প্রশ্ন');
{
  const check = async (q, want) => {
    try { await G.search(q); return false; }
    catch (e) { return e.message.includes(want); }
  };
  Promise.all([check('', 'দুটি অক্ষর'), check('a', 'দুটি অক্ষর'), check('  ', 'দুটি অক্ষর')])
    .then(rs => {
      rs.forEach((r, i) => ok(['খালি', 'এক অক্ষর', 'শুধু ফাঁকা'][i] + ' প্রত্যাখ্যাত', r));
      finish();
    });
}

/* ═══════════ ৪. URL গঠন ═══════════ */
head('সেবার ঠিকানা');
{
  ok('Nominatim https', G.NOMINATIM.startsWith('https://'));
  ok('Photon https', G.PHOTON.startsWith('https://'));
  ok('কোথাও API key নেই',
     !/key=|token=|apikey/i.test(G.NOMINATIM + G.PHOTON));
  ok('throttle ফাংশন আছে', typeof G.throttle === 'function');
  ok('myLocation ফাংশন আছে', typeof G.myLocation === 'function');
}

/* ═══════════ ৫. অবস্থান — ব্রাউজার ছাড়া ═══════════ */
head('myLocation (Node এ geolocation নেই)');
{
  global.navigator = {};
  global.window = { isSecureContext: true };
  global.location = { protocol: 'https:' };
  G.myLocation().then(
    () => ok('geolocation ছাড়া ত্রুটি', false, 'সফল হয়ে গেল'),
    e => ok('geolocation ছাড়া স্পষ্ট বার্তা', /সুবিধা নেই/.test(e.message), e.message)
  );
}

function finish() {
  setTimeout(() => {
    console.log('\n' + '='.repeat(78));
    console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
    console.log('='.repeat(78) + '\n');
    process.exit(fail ? 1 : 0);
  }, 60);
}
