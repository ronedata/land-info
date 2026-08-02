/* ==========================================================================
   tests/kmzfx-test.js — স্বচ্ছতা ও রঙের পিক্সেল-গণিত
   চালাও:  node tests/kmzfx-test.js
   ========================================================================== */

const F = require('../js/kmz-fx.js');

let pass = 0, fail = 0;
const head = t => console.log('\n\x1b[36m── ' + t + ' ──\x1b[0m');
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  \x1b[31m✗ ' + name + (extra ? '   ' + extra : '') + '\x1b[0m'); }
}

/** কয়েকটি পিক্সেল থেকে RGBA অ্যারে */
const px = (...list) => {
  const a = new Uint8ClampedArray(list.length * 4);
  list.forEach(([r, g, b, al = 255], i) => {
    a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = al;
  });
  return a;
};
const alpha = (a, i) => a[i * 4 + 3];
const rgb = (a, i) => [a[i * 4], a[i * 4 + 1], a[i * 4 + 2]];

/* ═══════════ ১. hex পার্স ═══════════ */
head('রঙ পার্স');
{
  ok('#ff0000', JSON.stringify(F.hexToRgb('#ff0000')) === '{"r":255,"g":0,"b":0}');
  ok('ff0000 (# ছাড়া)', JSON.stringify(F.hexToRgb('ff0000')) === '{"r":255,"g":0,"b":0}');
  ok('#00FF80 বড় হাতের', JSON.stringify(F.hexToRgb('#00FF80')) === '{"r":0,"g":255,"b":128}');
  ok('অবৈধ → null', F.hexToRgb('লাল') === null);
  ok('#fff (তিন অক্ষর) → null', F.hexToRgb('#fff') === null);
  ok('খালি → null', F.hexToRgb('') === null);
}

/* ═══════════ ২. উজ্জ্বলতা ═══════════ */
head('উজ্জ্বলতা');
{
  ok('সাদা = ২৫৫', Math.round(F.luma(255, 255, 255)) === 255);
  ok('কালো = ০', F.luma(0, 0, 0) === 0);
  ok('সবুজ সবচেয়ে উজ্জ্বল', F.luma(0, 255, 0) > F.luma(255, 0, 0));
  ok('নীল সবচেয়ে কম', F.luma(0, 0, 255) < F.luma(255, 0, 0));
}

/* ═══════════ ৩. স্বচ্ছতা বন্ধ থাকলে কিছুই বদলায় না ═══════════ */
head('স্বচ্ছতা বন্ধ');
{
  const a = px([255, 255, 255], [0, 0, 0], [128, 128, 128]);
  const before = Array.from(a);
  const st = F.processPixels(a, { transparent: false });
  ok('সব পিক্সেল অক্ষত', JSON.stringify(Array.from(a)) === JSON.stringify(before));
  ok('changed = ০', st.changed === 0);
  ok('kept = ৩', st.kept === 3);
}

/* ═══════════ ৪. সাদা বাদ ═══════════ */
head('সাদা পটভূমি স্বচ্ছ');
{
  const a = px(
    [255, 255, 255],   // ০ বিশুদ্ধ সাদা → স্বচ্ছ
    [250, 248, 245],   // ১ প্রায় সাদা কাগজ → স্বচ্ছ
    [0, 0, 0],         // ২ কালো রেখা → থাকবে
    [60, 60, 60],      // ৩ গাঢ় রেখা → থাকবে
    [210, 210, 210]    // ৪ হালকা ছায়া → প্রান্তে
  );
  const st = F.processPixels(a, { transparent: true, threshold: 205, soft: 45 });

  ok('বিশুদ্ধ সাদা স্বচ্ছ', alpha(a, 0) === 0);
  ok('প্রায়-সাদা কাগজও স্বচ্ছ', alpha(a, 1) === 0);
  ok('কালো রেখা পুরো অস্বচ্ছ', alpha(a, 2) === 255);
  ok('গাঢ় রেখা পুরো অস্বচ্ছ', alpha(a, 3) === 255);
  ok('হালকা ছায়া মাঝামাঝি', alpha(a, 4) === 0, 'alpha=' + alpha(a, 4));
  ok('গণনা মিলছে', st.changed === 3 && st.kept === 2,
     'changed=' + st.changed + ' kept=' + st.kept);
}

/* ═══════════ ৫. মসৃণ প্রান্ত ═══════════ */
head('প্রান্ত মসৃণ (soft)');
{
  // threshold ২০০, soft ৫০ → ১৫০–২০০ এর মাঝে ক্রমশ
  const a = px([200, 200, 200], [175, 175, 175], [150, 150, 150], [140, 140, 140]);
  F.processPixels(a, { transparent: true, threshold: 200, soft: 50 });
  ok('ঠিক থ্রেশহোল্ডে স্বচ্ছ', alpha(a, 0) === 0, String(alpha(a, 0)));
  ok('মাঝামাঝি ~অর্ধেক', Math.abs(alpha(a, 1) - 128) < 10, String(alpha(a, 1)));
  ok('সীমার নিচে পুরো', alpha(a, 2) === 255, String(alpha(a, 2)));
  ok('আরও গাঢ় পুরো', alpha(a, 3) === 255);

  // soft = ০ হলে হঠাৎ কাটা
  const b = px([201, 201, 201], [199, 199, 199]);
  F.processPixels(b, { transparent: true, threshold: 200, soft: 0 });
  ok('soft=০ এ হঠাৎ কাটা', alpha(b, 0) === 0 && alpha(b, 1) === 255);
}

/* ═══════════ ৬. থ্রেশহোল্ড বদলালে ═══════════ */
head('থ্রেশহোল্ডের প্রভাব');
{
  const mk = () => px([230, 230, 230], [180, 180, 180], [100, 100, 100]);
  const hi = mk(); F.processPixels(hi, { transparent: true, threshold: 240, soft: 0 });
  const lo = mk(); F.processPixels(lo, { transparent: true, threshold: 150, soft: 0 });
  ok('উঁচু থ্রেশহোল্ডে কম বাদ যায়',
     [0, 1, 2].filter(i => alpha(hi, i) === 0).length <
     [0, 1, 2].filter(i => alpha(lo, i) === 0).length + 1);
  ok('threshold=২৪০ এ ২৩০ থাকে', alpha(hi, 0) === 255);
  ok('threshold=১৫০ এ ২৩০ ও ১৮০ বাদ', alpha(lo, 0) === 0 && alpha(lo, 1) === 0);
  ok('সীমার বাইরে থ্রেশহোল্ড আটকানো হয়', (() => {
    const a = px([255, 255, 255]);
    F.processPixels(a, { transparent: true, threshold: 999, soft: 0 });
    return alpha(a, 0) === 0;                  // ২৫৫ এ আটকে, সাদা ≥ ২৫৫
  })());
}

/* ═══════════ ৭. আগে থেকেই স্বচ্ছ পিক্সেল ═══════════ */
head('আগের স্বচ্ছতা মানা হয়');
{
  const a = px([0, 0, 0, 128]);               // অর্ধ-স্বচ্ছ কালো রেখা
  F.processPixels(a, { transparent: true, threshold: 205, soft: 0 });
  ok('অর্ধ-স্বচ্ছ রেখা অর্ধেকই থাকে', alpha(a, 0) === 128, String(alpha(a, 0)));

  const b = px([255, 255, 255, 0]);           // আগেই সম্পূর্ণ স্বচ্ছ
  F.processPixels(b, { transparent: true });
  ok('আগে থেকে স্বচ্ছ → স্বচ্ছই', alpha(b, 0) === 0);
}

/* ═══════════ ৮. রঙ বদল ═══════════ */
head('রেখার রঙ');
{
  const a = px([0, 0, 0], [128, 128, 128], [255, 255, 255]);
  F.processPixels(a, { transparent: false, color: '#ff0000', strength: 1 });
  ok('কালো রেখা পুরো লাল', JSON.stringify(rgb(a, 0)) === '[255,0,0]', rgb(a, 0).join(','));
  ok('মাঝারি ধূসর আংশিক লাল', rgb(a, 1)[0] > 128 && rgb(a, 1)[1] < 128,
     rgb(a, 1).join(','));
  ok('সাদা প্রায় অপরিবর্তিত', rgb(a, 2)[1] > 250, rgb(a, 2).join(','));

  const b = px([0, 0, 0]);
  F.processPixels(b, { color: '#ff0000', strength: 0.5 });
  ok('strength ০.৫ এ অর্ধেক', Math.abs(rgb(b, 0)[0] - 128) < 3, rgb(b, 0).join(','));

  const c = px([0, 0, 0]);
  F.processPixels(c, { color: 'লাল' });          // অবৈধ hex
  ok('অবৈধ রঙে কিছু বদলায় না', JSON.stringify(rgb(c, 0)) === '[0,0,0]');
}

/* ═══════════ ৯. স্বচ্ছ + রঙ একসাথে ═══════════ */
head('স্বচ্ছ ও রঙ একসাথে');
{
  const a = px([255, 255, 255], [20, 20, 20]);
  F.processPixels(a, { transparent: true, color: '#0000ff', threshold: 205, soft: 0 });
  ok('সাদা স্বচ্ছ, রঙ বসেনি', alpha(a, 0) === 0);
  ok('রেখা নীল ও অস্বচ্ছ',
     alpha(a, 1) === 255 && rgb(a, 1)[2] > 200 && rgb(a, 1)[0] < 60,
     rgb(a, 1).join(',') + ' a=' + alpha(a, 1));
}

/* ═══════════ ১০. নাম ও শতাংশ ═══════════ */
head('নাম ও পরিসংখ্যান');
{
  ok('স্বচ্ছ হলে .png', F.nameFor('map.jpg', 'image/png') === 'map.png');
  ok('নইলে .jpg', F.nameFor('map.png', 'image/jpeg') === 'map.jpg');
  ok('এক্সটেনশন ছাড়া নামেও', F.nameFor('মৌজা', 'image/png') === 'মৌজা.png');
  ok('নাম ছাড়া → map', F.nameFor('', 'image/jpeg') === 'map.jpg');

  ok('৫০% স্বচ্ছ', Math.abs(F.transparentPct({ changed: 50, kept: 50 }) - 50) < 1e-9);
  ok('০ পিক্সেলে ০%', F.transparentPct({ changed: 0, kept: 0 }) === 0);
  ok('সব স্বচ্ছ = ১০০%', F.transparentPct({ changed: 10, kept: 0 }) === 100);
}

/* ═══════════ ১১. বাস্তবসদৃশ নকশা ═══════════ */
head('বাস্তবসদৃশ স্ক্যান');
{
  // ১০০×১০০ সাদা কাগজে কয়েকটি কালো রেখা
  const W = 100, H = 100;
  const a = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    const line = (x % 25 === 0) || (y % 25 === 0);
    const v = line ? 30 : 248;                  // রেখা গাঢ়, কাগজ প্রায় সাদা
    a[i * 4] = a[i * 4 + 1] = a[i * 4 + 2] = v;
    a[i * 4 + 3] = 255;
  }
  const st = F.processPixels(a, { transparent: true, threshold: 205, soft: 45 });
  const pct = F.transparentPct(st);
  ok('বেশির ভাগ কাগজ স্বচ্ছ হলো', pct > 80, pct.toFixed(1) + '%');
  ok('রেখা টিকে আছে', st.kept > 0, st.kept + 'টি পিক্সেল');
  // রেখার উপরের পিক্সেল অস্বচ্ছ থাকা চাই
  ok('রেখার পিক্সেল অস্বচ্ছ', a[(0 * W + 0) * 4 + 3] === 255);
}

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
console.log('='.repeat(78) + '\n');
process.exit(fail ? 1 : 0);
