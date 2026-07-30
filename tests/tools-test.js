/* দাগ পোরশন · তফসিল বন্টন · অনুপাত · এক্সপ্রেশন — ইঞ্জিন টেস্ট */
const fs = require('fs'), path = require('path'), vm = require('vm');
// ফোল্ডার সরালেও যেন না ভাঙে — পথ ফাইলের অবস্থান থেকেই বের করা
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/calculators.js'), 'utf8');

const sandbox = { console };
vm.createContext(sandbox);
const LandMath = vm.runInContext(src + '\n; LandMath;', sandbox);
const bn2n = s => parseFloat(String(s).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)));

let pass = 0, fail = 0;
function check(label, ok, extra) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra !== undefined ? '   → ' + extra : ''}`);
  ok ? pass++ : fail++;
}
function near(a, b, tol) { return Math.abs(a - b) < (tol || 1e-9); }

LandMath.setKathaPreset('standard');

/* ================= দাগ পোরশন ================= */
console.log('\n' + '='.repeat(78));
console.log('  দাগ পোরশন — অংশ = আবেদিত জমি ÷ দাগের মোট জমি');
console.log('='.repeat(78));

let d = LandMath.calculateDagPortion(100, 25);
check('১০০ শতক দাগে ২৫ শতক → ০.২৫', near(d.fraction, 0.25), d.decimalStr);
check('শতকরা ২৫%', d.percentStr === '২৫.০০০%', d.percentStr);
check('ভগ্নাংশ ১/৪', d.fractionStr === '১/৪', d.fractionStr);
check('আনা-গণ্ডা ৪ আনা', d.anaStr.startsWith('৪ আনা'), d.anaStr);

d = LandMath.calculateDagPortion(120, 15);
check('১২০ শতক দাগে ১৫ শতক → ০.১২৫', near(d.fraction, 0.125), d.decimalStr);
check('ভগ্নাংশ ১/৮', d.fractionStr === '১/৮', d.fractionStr);

d = LandMath.calculateDagPortion(0, 25);
check('দাগের জমি ০ হলে isValid মিথ্যা', d.isValid === false && d.fraction === 0);

d = LandMath.calculateDagPortion(50, 80);
check('আবেদিত জমি বেশি হলে isOver সত্য', d.isOver === true, d.decimalStr);

/* ================= তফসিল বন্টন ================= */
console.log('\n' + '='.repeat(78));
console.log('  তফসিল বন্টন — অংশ = (মালিকের জমি ÷ মোট জমি) × টার্গেট');
console.log('='.repeat(78));

let t = LandMath.calculateTofasil([
  { name: 'ক', land: 50 }, { name: 'খ', land: 30 }, { name: 'গ', land: 20 }
]);
check('৫০ শতক → অংশ ০.৫', near(t.results[0].share, 0.5), t.results[0].shareStr);
check('৩০ শতক → অংশ ০.৩', near(t.results[1].share, 0.3), t.results[1].shareStr);
check('২০ শতক → অংশ ০.২', near(t.results[2].share, 0.2), t.results[2].shareStr);
check('মোট অংশ = ১.০০০০০০', t.totals.shareStr === '১.০০০০০০', t.totals.shareStr);
check('মোট জমি = ১০০', bn2n(t.totals.landStr) === 100, t.totals.landStr);
check('isExact সত্য', t.isExact === true);
check('ক্রমিক নং বাংলায়', t.results.map(r => r.serial).join(',') === '১,২,৩');

// টার্গেট অংশ ভিন্ন হলে (যেমন খতিয়ানে মোট ০.৫ অংশ বসবে)
t = LandMath.calculateTofasil([{ name: 'ক', land: 50 }, { name: 'খ', land: 50 }], 0.5);
check('টার্গেট ০.৫ → প্রত্যেকে ০.২৫', near(t.results[0].share, 0.25), t.results[0].shareStr);
check('টার্গেট ০.৫ → মোট ০.৫', near(bn2n(t.totals.shareStr), 0.5), t.totals.shareStr);

// মোট জমি আলাদা দিলে (মালিকদের যোগফল কম)
t = LandMath.calculateTofasil([{ name: 'ক', land: 30 }, { name: 'খ', land: 20 }], 1, 100);
check('মোট ১০০ ধরে ৩০ শতক → ০.৩', near(t.results[0].share, 0.3), t.results[0].shareStr);
check('যোগফল কম হলে isExact মিথ্যা', t.isExact === false);
check('বাকি জমি ৫০ শতক', near(t.leftover, 50), t.leftover);

/* ================= অনুপাত ================= */
console.log('\n' + '='.repeat(78));
console.log('  অনুপাত ক্যালকুলেটর');
console.log('='.repeat(78));

let r = LandMath.calculateRatio([2, 1, 1], 100);
check('২:১:১ এ ১০০ ভাগ → ৫০', near(r.results[0].result, 50), r.results[0].resultStr);
check('২:১:১ এ ১০০ ভাগ → ২৫', near(r.results[1].result, 25), r.results[1].resultStr);
check('সরল অনুপাত ২ : ১ : ১', r.simpleRatio === '২ : ১ : ১', r.simpleRatio);

r = LandMath.calculateRatio([30, 20, 10]);
check('টার্গেট না দিলে যোগফলই টার্গেট (৬০)', near(r.target, 60), r.targetStr);
check('৩০ → ফলাফল ৩০ (অপরিবর্তিত)', near(r.results[0].result, 30), r.results[0].resultStr);
check('সরল অনুপাত ৩ : ২ : ১', r.simpleRatio === '৩ : ২ : ১', r.simpleRatio);
check('৩০ এর শতকরা ৫০%', r.results[0].percentStr === '৫০.০০০%', r.results[0].percentStr);

r = LandMath.calculateRatio([0, 0]);
check('সব শূন্য হলে ভাগ ০ (ক্র্যাশ নয়)', r.results[0].result === 0);

/* ================= এক্সপ্রেশন ================= */
console.log('\n' + '='.repeat(78));
console.log('  ইনলাইন এক্সপ্রেশন ক্যালকুলেটর');
console.log('='.repeat(78));

let e = LandMath.evalExpression('54+52+69*5/8');
check('54+52+69*5/8 = ১৪৯.১২৫', e.ok && near(e.value, 149.125), e.value);
e = LandMath.evalExpression('(100-40)/3');
check('(100-40)/3 = ২০', e.ok && near(e.value, 20), e.value);
e = LandMath.evalExpression('435.6*100');
check('435.6*100 = ৪৩৫৬০', e.ok && near(e.value, 43560), e.value);
e = LandMath.evalExpression('alert(1)');
check('alert(1) প্রত্যাখ্যাত (নিরাপত্তা)', !e.ok, e.error);
e = LandMath.evalExpression('window.location');
check('window.location প্রত্যাখ্যাত', !e.ok, e.error);
e = LandMath.evalExpression('1/0');
check('1/0 প্রত্যাখ্যাত (Infinity)', !e.ok, e.error);
e = LandMath.evalExpression('2+');
check('অসম্পূর্ণ সমীকরণ প্রত্যাখ্যাত', !e.ok, e.error);
e = LandMath.evalExpression('');
check('খালি ইনপুটে চুপচাপ ০', !e.ok && e.error === '');

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল:  ✓ পাস ${pass}   ✗ ফেল ${fail}   (মোট ${pass + fail})`);
console.log('='.repeat(78) + '\n');

/* ================= N-বাহু জ্যামিতি (canvas-measure.js) ================= */
const canvasSrc = fs.readFileSync(path.join(ROOT, 'js/canvas-measure.js'), 'utf8');
const csb = {
  console,
  toBn: n => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]),
  document: { getElementById: () => null, documentElement: { classList: { contains: () => false } } },
  window: { addEventListener() {} }
};
vm.createContext(csb);
const LCE = vm.runInContext(canvasSrc + '\n; LandCanvasEngine;', csb);

console.log('\n' + '='.repeat(78));
console.log('  N-বাহু জ্যামিতি — বাহু ও কর্ণ থেকে সঠিক আকৃতি');
console.log('='.repeat(78));

// ---- ত্রিভুজ: ৩-৪-৫ সমকোণী, ক্ষেত্রফল ৬ ----
let s = LCE.solvePolygon([3, 4, 5], []);
check('৩-৪-৫ ত্রিভুজ সমাধান হয়', s.ok);
check('৩-৪-৫ ত্রিভুজের ক্ষেত্রফল ৬', s.ok && near(LCE.polygonArea(s.points), 6, 1e-6),
  s.ok ? LCE.polygonArea(s.points).toFixed(4) : s.error);

// ---- আয়তক্ষেত্র ১০০×৮০, কর্ণ = √(১০০²+৮০²) = ১২৮.০৬ ----
const diag = Math.hypot(100, 80);
s = LCE.solvePolygon([100, 80, 100, 80], [diag]);
check('আয়তক্ষেত্র ১০০×৮০ সমাধান হয়', s.ok, s.error);
check('ক্ষেত্রফল ৮০০০ বর্গফুট', s.ok && near(LCE.polygonArea(s.points), 8000, 1e-4),
  s.ok ? LCE.polygonArea(s.points).toFixed(2) : '');

// প্রতিটি বাহুর মাপ ইনপুটের সাথে মেলে কি না — এটাই আগের বাগ ছিল
if (s.ok) {
  const p = s.points, exp = [100, 80, 100, 80];
  let allMatch = true;
  for (let i = 0; i < 4; i++) {
    const q = p[(i + 1) % 4];
    const d = Math.hypot(q.x - p[i].x, q.y - p[i].y);
    if (!near(d, exp[i], 1e-6)) allMatch = false;
  }
  check('চারটি বাহুর মাপ ইনপুটের সাথে হুবহু মেলে', allMatch);
  const dd = Math.hypot(p[2].x - p[0].x, p[2].y - p[0].y);
  check('কর্ণের মাপও মেলে', near(dd, diag, 1e-6), dd.toFixed(4));
}

// ---- অসম চতুর্ভুজ: বাহু ১২০,৮০,১০০,৯০ কর্ণ ১৪০ ----
s = LCE.solvePolygon([120, 80, 100, 90], [140]);
check('অসম চতুর্ভুজ সমাধান হয়', s.ok, s.error);
if (s.ok) {
  // হিরণ দিয়ে দুই ত্রিভুজের যোগফলের সাথে মিলিয়ে দেখি
  const her = (a, b, c) => { const p = (a + b + c) / 2; return Math.sqrt(p * (p - a) * (p - b) * (p - c)); };
  const expect = her(120, 80, 140) + her(100, 90, 140);
  check('ক্ষেত্রফল = দুই ত্রিভুজের যোগফল (হিরণ)',
    near(LCE.polygonArea(s.points), expect, 1e-6),
    LCE.polygonArea(s.points).toFixed(4) + ' vs ' + expect.toFixed(4));
}

// ---- পঞ্চভুজ: ৫ বাহু + ২ কর্ণ ----
s = LCE.solvePolygon([100, 70, 80, 90, 110], [130, 150]);
check('পঞ্চভুজ (৫ বাহু + ২ কর্ণ) সমাধান হয়', s.ok, s.error);
check('পঞ্চভুজে ৫টি কোণা তৈরি হয়', s.ok && s.points.length === 5);

// ---- ষড়ভুজ: ৬ বাহু + ৩ কর্ণ ----
s = LCE.solvePolygon([100, 60, 70, 60, 80, 90], [120, 150, 160]);
check('ষড়ভুজ (৬ বাহু + ৩ কর্ণ) সমাধান হয়', s.ok, s.error);
check('ষড়ভুজে ৬টি কোণা তৈরি হয়', s.ok && s.points.length === 6);

// ---- ভুল ইনপুট ----
s = LCE.solvePolygon([10, 10, 10, 10], [500]);
check('কর্ণ অসম্ভব বড় হলে ত্রুটি বার্তা', !s.ok && /ত্রিভুজ/.test(s.error || ''), s.error);

s = LCE.solvePolygon([1, 2, 50], []);
check('ত্রিভুজ অসমতা ভাঙলে ত্রুটি', !s.ok, s.error);

s = LCE.solvePolygon([100, 80, 100, 80], []);
check('চতুর্ভুজে কর্ণ না দিলে ত্রুটি', !s.ok && /কর্ণ/.test(s.error || ''), s.error);

s = LCE.solvePolygon([100, 0, 100, 80], [120]);
check('বাহু শূন্য হলে ত্রুটি', !s.ok, s.error);

s = LCE.solvePolygon([100, 80], []);
check('২ বাহু দিলে ত্রুটি', !s.ok, s.error);

// ---- বৃত্ত-ছেদ সরাসরি ----
let ci = LCE.circleIntersect({ x: 0, y: 0 }, 5, { x: 6, y: 0 }, 5);
check('বৃত্ত-ছেদ: (0,0,r5) ও (6,0,r5) → x=3, y=4', ci && near(ci.x, 3) && near(ci.y, 4),
  ci ? `${ci.x.toFixed(2)}, ${ci.y.toFixed(2)}` : 'null');
check('বৃত্ত আলাদা হলে null', LCE.circleIntersect({ x: 0, y: 0 }, 1, { x: 10, y: 0 }, 1) === null);

console.log('\n' + '='.repeat(78));
console.log(`  সর্বমোট:  ✓ পাস ${pass}   ✗ ফেল ${fail}`);
console.log('='.repeat(78) + '\n');
