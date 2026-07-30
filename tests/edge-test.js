/* এজ কেস + LandMath যাচাই */
const fs = require('fs'), path = require('path'), vm = require('vm');
// ফোল্ডার সরালেও যেন না ভাঙে — পথ ফাইলের অবস্থান থেকেই বের করা
const ROOT = path.resolve(__dirname, '..');
const calcSrc = fs.readFileSync(path.join(ROOT, 'js/calculators.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

let FIELD = {};
const sandbox = {
  console,
  document: {
    getElementById: id => (id in FIELD ? { value: String(FIELD[id]), checked: false, style: {}, innerHTML: '' } : null),
    documentElement: { classList: { add() {}, toggle() { return false; }, contains() { return false; } } },
    querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
    body: { classList: { add() {}, remove() {} } }
  },
  window: { addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {} },
  Chart: undefined
};
vm.createContext(sandbox);
const ctx = vm.runInContext(calcSrc + '\n;\n' + appSrc + '\n; ({App: AppController, LandMath});', sandbox);
const App = ctx.App, LandMath = ctx.LandMath;
App.renderResultsFromState = () => {};

function run(heirs, dynamic = {}) {
  FIELD = { 'inh-land-input': 0, 'inh-gold-input': 0, 'inh-silver-input': 0, 'inh-cash-input': 0 };
  App.heirsConfig.forEach(h => { FIELD[`count-${h.id}`] = heirs[h.id] || 0; });
  App.dynamicHeirData = { ...dynamic };
  App.lastCalculatedData = null;
  App.calculateDistribution();
  return App.lastCalculatedData.shares;
}
const pct = x => (x * 100).toFixed(3) + '%';
function show(title, shares) {
  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  console.log(`\n▸ ${title}`);
  Object.entries(shares).filter(([, v]) => v > 1e-9).forEach(([k, v]) => console.log(`    ${k.padEnd(28)} ${pct(v)}`));
  const flag = Math.abs(total - 1) > 1e-6 ? '   ⚠️  যোগফল ১০০% নয়!' : '   ✓';
  console.log(`    ${'মোট'.padEnd(28)} ${pct(total)}${flag}`);
  return total;
}

console.log('='.repeat(78));
console.log('  এজ কেস যাচাই — সন্তানহীন মৃত পুত্র/কন্যা');
console.log('='.repeat(78));

show('A. ১ জীবিত পুত্র + ১ সন্তানহীন মৃত পুত্র (আগে মৃত)',
  run({ son: 1, deadSon: 1 }, { deadSon_1_timing: 'pre', deadSon_1_son: 0, deadSon_1_daughter: 0, deadSon_1_spouse: 0 }));

show('B. ১ জীবিত পুত্র + ১ সন্তানহীন মৃত পুত্র (পরে মৃত, স্ত্রীও নেই)',
  run({ son: 1, deadSon: 1 }, { deadSon_1_timing: 'post', deadSon_1_son: 0, deadSon_1_daughter: 0, deadSon_1_spouse: 0 }));

show('C. স্ত্রী + ১ সন্তানহীন মৃত পুত্র (আগে মৃত) — স্ত্রী ১/৪ পাওয়ার কথা',
  run({ wife: 1, deadSon: 1 }, { deadSon_1_timing: 'pre', deadSon_1_son: 0, deadSon_1_daughter: 0, deadSon_1_spouse: 0 }));

show('D. ১ সহোদর ভাই + ১ সন্তানহীন মৃত পুত্র (আগে মৃত) — ভাই সব পাওয়ার কথা',
  run({ fullBrother: 1, deadSon: 1 }, { deadSon_1_timing: 'pre', deadSon_1_son: 0, deadSon_1_daughter: 0, deadSon_1_spouse: 0 }));

show('E. ১ জীবিত কন্যা + ১ সন্তানহীন মৃত কন্যা (আগে মৃত)',
  run({ daughter: 1, deadDaughter: 1 }, { deadDaughter_1_timing: 'pre', deadDaughter_1_son: 0, deadDaughter_1_daughter: 0, deadDaughter_1_spouse: 0 }));

show('F. স্বাভাবিক: ১ জীবিত পুত্র + মৃত পুত্র (আগে মৃত, ১ পুত্র রেখে)',
  run({ son: 1, deadSon: 1 }, { deadSon_1_timing: 'pre', deadSon_1_son: 1, deadSon_1_daughter: 0, deadSon_1_spouse: 0 }));

console.log('\n' + '='.repeat(78));
console.log('  LandMath — একক রূপান্তর যাচাই');
console.log('='.repeat(78));

const unitChecks = [
  ['১ একর = ১০০ শতক', LandMath.convertArea(1, 'acre').satak, 100],
  ['১ একর = ৪৩৫৬০ বর্গফুট', LandMath.convertArea(1, 'acre').sqft, 43560],
  ['১ শতক = ৪৩৫.৬ বর্গফুট', LandMath.convertArea(1, 'satak').sqft, 435.6],
  ['১ বিঘা = ২০ কাঠা', LandMath.convertArea(1, 'bigha').katha, 20],
  ['১ বিঘা = ৩৩.০৫৮ শতক', LandMath.convertArea(1, 'bigha').satak, 33.0578],
  ['১ কাঠা = ৭২০ বর্গফুট', LandMath.convertArea(1, 'katha').sqft, 720],
  ['১ কাঠা = ১.৬৫২৯ শতক', LandMath.convertArea(1, 'katha').satak, 1.65289],
  ['১ শতক = ১০০০ অযুতাংশ', LandMath.convertArea(1, 'satak').ajutangsha, 1000],
  ['১ বর্গমিটার = ১০.৭৬৩৯ বর্গফুট', LandMath.convertArea(1, 'sqmeter').sqft, 10.7639],
  ['১ একর = ৪০৪৬.৮৬ বর্গমিটার', LandMath.convertArea(1, 'acre').sqmeter, 4046.86],
];
let up = 0, uf = 0;
unitChecks.forEach(([name, got, exp]) => {
  const g = parseFloat(got);
  const ok = Math.abs(g - exp) < Math.max(0.01, Math.abs(exp) * 0.0005);
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(34)} পাওয়া ${g}   প্রত্যাশিত ${exp}`);
  ok ? up++ : uf++;
});

console.log('\n' + '-'.repeat(78));
console.log('  আনা-গণ্ডা যাচাই');
console.log('-'.repeat(78));
const agChecks = [
  ['১৬ আনা = পূর্ণ (১.০)', LandMath.anaGondaToFraction(16, 0, 0, 0, 0), 1],
  ['৮ আনা = ০.৫', LandMath.anaGondaToFraction(8, 0, 0, 0, 0), 0.5],
  ['১ আনা = ১/১৬', LandMath.anaGondaToFraction(1, 0, 0, 0, 0), 1 / 16],
  ['১ গণ্ডা = ১/২০ আনা', LandMath.anaGondaToFraction(0, 1, 0, 0, 0), (1 / 16) / 20],
  ['১ কড়া = ১/৪ গণ্ডা', LandMath.anaGondaToFraction(0, 0, 1, 0, 0), (1 / 16) / 20 / 4],
  ['১ ক্রান্তি = ১/৩ কড়া', LandMath.anaGondaToFraction(0, 0, 0, 1, 0), (1 / 16) / 20 / 4 / 3],
  ['১ তিল = ১/২০ ক্রান্তি', LandMath.anaGondaToFraction(0, 0, 0, 0, 1), (1 / 16) / 20 / 4 / 3 / 20],
];
let ap = 0, af = 0;
agChecks.forEach(([name, got, exp]) => {
  const ok = Math.abs(got - exp) < 1e-9;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(30)} পাওয়া ${got.toFixed(10)}   প্রত্যাশিত ${exp.toFixed(10)}`);
  ok ? ap++ : af++;
});

// রাউন্ড ট্রিপ
console.log('\n  রাউন্ড-ট্রিপ (fraction → ana-gonda → fraction):');
[1 / 3, 1 / 7, 0.5, 2 / 3, 5 / 16].forEach(f => {
  const ag = LandMath.fractionToAnaGonda(f);
  const back = LandMath.anaGondaToFraction(ag.ana, ag.gonda, ag.kora, ag.kranti, ag.til);
  const err = Math.abs(back - f);
  console.log(`  ${err < 1e-5 ? '✓' : '✗'} ${f.toFixed(6)} → ${ag.ana}আ ${ag.gonda}গ ${ag.kora}ক ${ag.kranti}ক্র ${ag.til}তি → ${back.toFixed(6)}  (ত্রুটি ${err.toExponential(2)})`);
});

console.log('\n' + '='.repeat(78));
console.log(`  একক: ✓${up} ✗${uf}   |   আনা-গণ্ডা: ✓${ap} ✗${af}`);
console.log('='.repeat(78) + '\n');

console.log('\n' + '='.repeat(78));
console.log('  কাঠার মাপ পরিবর্তন যাচাই (অঞ্চলভেদে আলাদা)');
console.log('='.repeat(78));

function kathaCheck(label, got, exp, tol) {
  const g = parseFloat(got);
  const ok = Math.abs(g - exp) < (tol || 0.01);
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(42)} পাওয়া ${g}   প্রত্যাশিত ${exp}`);
  return ok;
}

let kp = 0, kf = 0;
const K = (ok) => ok ? kp++ : kf++;

// ---- ১. স্ট্যান্ডার্ড (৭২০ বর্গফুট) ----
LandMath.setKathaPreset('standard');
let b = LandMath.kathaBasis();
K(kathaCheck('স্ট্যান্ডার্ড: ১ কাঠা = ১.৬৫ শতক', b.satakPerKatha, 1.6529, 0.0005));
K(kathaCheck('স্ট্যান্ডার্ড: ১ কাঠা = ৭২০ বর্গফুট', b.sqftPerKatha, 720));
K(kathaCheck('স্ট্যান্ডার্ড: ১ বিঘা = ৩৩.০৬ শতক', b.satakPerBigha, 33.0578, 0.001));
K(kathaCheck('স্ট্যান্ডার্ড: ২০ কাঠা = ১ বিঘা', LandMath.convertArea(20, 'katha').bigha, 1));
K(kathaCheck('স্ট্যান্ডার্ড: ১ একর = ৬০.৫ কাঠা', LandMath.convertArea(1, 'acre').katha, 60.5, 0.01));

// ---- ২. চওড়া কাঠা (২.৬০ শতক) ----
LandMath.setKathaPreset('wide');
b = LandMath.kathaBasis();
K(kathaCheck('চওড়া: ১ কাঠা = ২.৬০ শতক', b.satakPerKatha, 2.60));
K(kathaCheck('চওড়া: ১ বিঘা = ৫২ শতক', b.satakPerBigha, 52));
K(kathaCheck('চওড়া: ২০ কাঠা = ১ বিঘা', LandMath.convertArea(20, 'katha').bigha, 1));
K(kathaCheck('চওড়া: ১০০ শতক = ৩৮.৪৬ কাঠা', LandMath.convertArea(100, 'satak').katha, 38.4615, 0.001));
K(kathaCheck('চওড়া: ১ কাঠা = ১১৩২.৫৬ বর্গফুট', b.sqftPerKatha, 1132.56, 0.01));

// ---- ৩. কাস্টম ----
LandMath.setKathaPreset('custom', 2.0);
b = LandMath.kathaBasis();
K(kathaCheck('কাস্টম ২.০: ১ বিঘা = ৪০ শতক', b.satakPerBigha, 40));
K(kathaCheck('কাস্টম ২.০: ২০ কাঠা = ১ বিঘা', LandMath.convertArea(20, 'katha').bigha, 1));

// ---- ৪. শতক/একর/বর্গফুট কাঠা বদলালেও অপরিবর্তিত ----
K(kathaCheck('কাঠা বদলালেও ১ একর = ১০০ শতক', LandMath.convertArea(1, 'acre').satak, 100));
K(kathaCheck('কাঠা বদলালেও ১ শতক = ৪৩৫.৬ বর্গফুট', LandMath.convertArea(1, 'satak').sqft, 435.6));

// ---- ৫. অবৈধ মান প্রত্যাখ্যান ----
const before = LandMath.SATAK_PER_KATHA;
LandMath.setKatha(0);
LandMath.setKatha(-5);
LandMath.setKatha('abc');
K(kathaCheck('অবৈধ মান (০, ঋণাত্মক, টেক্সট) উপেক্ষিত', LandMath.SATAK_PER_KATHA, before, 1e-9));

// ডিফল্টে ফিরিয়ে দিই
LandMath.setKathaPreset('standard');

console.log('\n' + '='.repeat(78));
console.log(`  কাঠা যাচাই: ✓${kp} ✗${kf}`);
console.log('='.repeat(78) + '\n');

console.log('\n' + '='.repeat(78));
console.log('  খতিয়ান — হিস্যার চার ধরন যাচাই');
console.log('='.repeat(78));

let hp = 0, hf = 0;
function hcheck(label, got, exp, tol) {
  const ok = Math.abs(got - exp) < (tol || 1e-9);
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(46)} পাওয়া ${(+got).toFixed(6)}   প্রত্যাশিত ${(+exp).toFixed(6)}`);
  ok ? hp++ : hf++;
}

// একই হিস্যা (অর্ধেক) চার ধরনে দিলে একই ফল আসা উচিত
hcheck('আনা-গণ্ডা ৮ আনা = ০.৫', LandMath.hissaToFraction('anagonda', { ana: 8 }), 0.5);
hcheck('শতকরা ৫০% = ০.৫', LandMath.hissaToFraction('percent', { percent: 50 }), 0.5);
hcheck('দশমিক ০.৫ = ০.৫', LandMath.hissaToFraction('decimal', { decimal: 0.5 }), 0.5);
hcheck('ভগ্নাংশ ১/২ = ০.৫', LandMath.hissaToFraction('fraction', { num: 1, den: 2 }), 0.5);
hcheck('হর শূন্য হলে ০ (ভাগ করা যাবে না)', LandMath.hissaToFraction('fraction', { num: 1, den: 0 }), 0);

// toFractionParts
let fp = LandMath.toFractionParts(0.125);
hcheck('toFractionParts(০.১২৫) লব = ১', fp.n, 1);
hcheck('toFractionParts(০.১২৫) হর = ৮', fp.d, 8);
fp = LandMath.toFractionParts(1 / 3);
hcheck('toFractionParts(১/৩) → ১/৩', fp.n / fp.d, 1 / 3, 1e-6);

// মিশ্র ধরনে খতিয়ান — ১০০ শতক, তিন মালিক ভিন্ন ধরনে
LandMath.setKathaPreset('standard');
const kres = LandMath.calculateKhotian(100, [
  { name: 'ক', type: 'anagonda', ana: 8 },              // ০.৫
  { name: 'খ', type: 'percent', percent: 25 },          // ০.২৫
  { name: 'গ', type: 'fraction', num: 1, den: 4 }       // ০.২৫
]);
hcheck('মিশ্র: মালিক ক = ০.৫', kres.results[0].fraction, 0.5);
hcheck('মিশ্র: মালিক খ = ০.২৫', kres.results[1].fraction, 0.25);
hcheck('মিশ্র: মালিক গ = ০.২৫', kres.results[2].fraction, 0.25);
hcheck('মিশ্র: মোট যোগফল = ১.০ (১৬ আনা)', kres.results.reduce((a, r) => a + r.fraction, 0), 1);
console.log(`  ${kres.isExact ? '✓' : '✗'} মিশ্র: isExact সত্য (যোগফল ঠিক ১৬ আনা)`);
kres.isExact ? hp++ : hf++;
console.log(`     মালিক খ এর আনা-গণ্ডা সমতুল্য: ${kres.results[1].anaStr}`);
console.log(`     মালিক খ এর ভগ্নাংশ: ${kres.results[1].fractionStr}`);

// শতকরা দিলেও জমির পরিমাণ ঠিক আসে
const bnToNum = s => parseFloat(String(s).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)));
hcheck('শতকরা ২৫% এর জমি = ২৫ শতক', bnToNum(kres.results[1].satak), 25, 0.001);

// type না দিলে পুরনো আচরণ (আনা-গণ্ডা)
const legacy = LandMath.calculateKhotian(100, [{ name: 'পুরনো', ana: 4 }]);
hcheck('type ছাড়া → আনা-গণ্ডা ধরা হয় (৪ আনা = ০.২৫)', legacy.results[0].fraction, 0.25);

console.log('\n' + '='.repeat(78));
console.log(`  খতিয়ান ধরন যাচাই: ✓${hp} ✗${hf}`);
console.log('='.repeat(78) + '\n');

console.log('\n' + '='.repeat(78));
console.log('  খতিয়ান — অংশ (দশমিক), ক্রমিক নং ও মোট সারি');
console.log('='.repeat(78));

let dp = 0, df = 0;
const dcheck = (label, cond, extra) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? '   → ' + extra : ''}`);
  cond ? dp++ : df++;
};

LandMath.setKathaPreset('standard');
const r1 = LandMath.calculateKhotian(100, [
  { name: 'ক', type: 'anagonda', ana: 8 },
  { name: 'খ', type: 'percent', percent: 25 },
  { name: 'গ', type: 'decimal', decimal: 0.25 }
]);

dcheck('ক্রমিক নং বাংলায় (১, ২, ৩)',
  r1.results.map(r => r.serial).join(',') === '১,২,৩', r1.results.map(r => r.serial).join(','));
dcheck('অংশ (দশমিক) ৪ ঘর — ০.৫০০০',
  r1.results[0].decimalStr === '০.৫০০০', r1.results[0].decimalStr);
dcheck('শতকরা ইনপুটেও দশমিক দেখায় — ০.২৫০০',
  r1.results[1].decimalStr === '০.২৫০০', r1.results[1].decimalStr);
dcheck('মোট দশমিক = ১.০০০০',
  r1.totals.decimalStr === '১.০০০০', r1.totals.decimalStr);
dcheck('মোট শতকরা = ১০০.০০%',
  r1.totals.percentStr === '১০০.০০%', r1.totals.percentStr);
dcheck('মোট আনা = ১৬.০০ আনা',
  r1.totals.anaStr === '১৬.০০ আনা', r1.totals.anaStr);
dcheck('মোট জমি = ১০০.০০০ শতক',
  r1.totals.satak === '১০০.০০০', r1.totals.satak);
dcheck('isExact সত্য', r1.isExact === true);

// যোগফল ১ না হলে
const r2 = LandMath.calculateKhotian(100, [
  { name: 'ক', type: 'anagonda', ana: 8 },
  { name: 'খ', type: 'anagonda', ana: 4 }
]);
dcheck('অসম্পূর্ণ খতিয়ানে isExact মিথ্যা', r2.isExact === false);
dcheck('অসম্পূর্ণ: মোট দশমিক = ০.৭৫০০',
  r2.totals.decimalStr === '০.৭৫০০', r2.totals.decimalStr);
dcheck('অসম্পূর্ণ: মোট জমি = ৭৫.০০০ শতক (১০০ নয়)',
  r2.totals.satak === '৭৫.০০০', r2.totals.satak);

console.log('\n' + '='.repeat(78));
console.log(`  দশমিক/মোট যাচাই: ✓${dp} ✗${df}`);
console.log('='.repeat(78) + '\n');
