/* ফরায়েজ ইঞ্জিন টেস্ট হারনেস — DOM স্টাব করে app.js এর calculateDistribution চালায় */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ফোল্ডার সরালেও যেন না ভাঙে — পথ ফাইলের অবস্থান থেকেই বের করা
const ROOT = path.resolve(__dirname, '..');
const calcSrc = fs.readFileSync(path.join(ROOT, 'js/calculators.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

// ---- DOM stub ----
let FIELD = {};
const sandbox = {
  console,
  document: {
    getElementById: id => (id in FIELD ? { value: String(FIELD[id]), checked: false, style: {}, innerHTML: '' } : null),
    documentElement: { classList: { add() {}, toggle() { return false; }, contains() { return false; } } },
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    body: { classList: { add() {}, remove() {} } }
  },
  window: { addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {} },
  Chart: undefined
};
vm.createContext(sandbox);
// দুটো ফাইল একসাথে চালাতে হবে — const লেক্সিক্যাল স্কোপ শেয়ার করার জন্য
const App = vm.runInContext(calcSrc + '\n;\n' + appSrc + '\n; AppController;', sandbox);
App.renderResultsFromState = () => {}; // UI বন্ধ

// ---- fraction helper ----
function frac(x, maxDen = 5040) {
  if (Math.abs(x) < 1e-9) return '0';
  let best = null, bestErr = Infinity;
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(x * d);
    const err = Math.abs(x - n / d);
    if (err < bestErr - 1e-12) { bestErr = err; best = [n, d]; if (err < 1e-10) break; }
  }
  const [n, d] = best;
  return d === 1 ? String(n) : `${n}/${d}`;
}

function run(heirs, dynamic = {}) {
  FIELD = { 'inh-land-input': 0, 'inh-gold-input': 0, 'inh-silver-input': 0, 'inh-cash-input': 0 };
  App.heirsConfig.forEach(h => { FIELD[`count-${h.id}`] = heirs[h.id] || 0; });
  App.dynamicHeirData = { ...dynamic };
  App.lastCalculatedData = null;
  App.calculateDistribution();
  return App.lastCalculatedData;
}

const CASES = [];
function t(name, heirs, expected, note, dynamic) { CASES.push({ name, heirs, expected, note, dynamic }); }

// ── ১. উমারিয়্যাতাইন (স্বামী + মাতা + পিতা)
t('উমারিয়্যাতাইন: স্বামী + মাতা + পিতা', { husband: 1, mother: 1, father: 1 },
  { husband: 1 / 2, mother: 1 / 6, father: 1 / 3 });

// ── ২. উমারিয়্যাতাইন (স্ত্রী + মাতা + পিতা)
t('উমারিয়্যাতাইন: স্ত্রী + মাতা + পিতা', { wife: 1, mother: 1, father: 1 },
  { wife: 1 / 4, mother: 1 / 4, father: 1 / 2 });

// ── ৩. আওল (স্বামী + ২ কন্যা + পিতা + মাতা) => ১৫ এ আওল
t('আওল: স্বামী + ২ কন্যা + পিতা + মাতা', { husband: 1, daughter: 2, father: 1, mother: 1 },
  { husband: 3 / 15, daughter: 8 / 15, father: 2 / 15, mother: 2 / 15 });

// ── ৪. মিনবারিয়্যা (স্ত্রী + ২ কন্যা + পিতা + মাতা) => ২৭ এ আওল
t('মিনবারিয়্যা: স্ত্রী + ২ কন্যা + পিতা + মাতা', { wife: 1, daughter: 2, father: 1, mother: 1 },
  { wife: 3 / 27, daughter: 16 / 27, father: 4 / 27, mother: 4 / 27 });

// ── ৫. রদ (মাতা + ১ কন্যা)
t('রদ: মাতা + ১ কন্যা', { mother: 1, daughter: 1 },
  { mother: 1 / 4, daughter: 3 / 4 });

// ── ৬. রদ স্বামী/স্ত্রী সহ (স্ত্রী + ১ কন্যা)
t('রদ: স্ত্রী + ১ কন্যা', { wife: 1, daughter: 1 },
  { wife: 1 / 8, daughter: 7 / 8 });

// ── ৭. পুত্র-কন্যা ২:১
t('২:১ অনুপাত: ১ পুত্র + ১ কন্যা', { son: 1, daughter: 1 },
  { son: 2 / 3, daughter: 1 / 3 });

// ── ৮. স্ত্রী + ২ পুত্র + ৩ কন্যা
t('স্ত্রী + ২ পুত্র + ৩ কন্যা', { wife: 1, son: 2, daughter: 3 },
  { wife: 1 / 8, son: (7 / 8) * (4 / 7), daughter: (7 / 8) * (3 / 7) });

// ── ৯. পিতা + মাতা (মাতা ১/৩, পিতা ২/৩)
t('পিতা + মাতা', { father: 1, mother: 1 }, { mother: 1 / 3, father: 2 / 3 });

// ── ১০. আসাবা মাআল গায়র: ২ কন্যা + ১ সহোদর বোন
t('আসাবা মাআল গায়র: ২ কন্যা + সহোদর বোন', { daughter: 2, fullSister: 1 },
  { daughter: 2 / 3, fullSister: 1 / 3 });

// ── ১১. স্বামী + সহোদর বোন
t('স্বামী + সহোদর বোন', { husband: 1, fullSister: 1 }, { husband: 1 / 2, fullSister: 1 / 2 });

// ── ১২. হিমারিয়্যা/মুশতারাকা: স্বামী + মাতা + ২ বৈপিত্রেয় ভাই + ১ সহোদর ভাই
t('মুশতারাকা: স্বামী+মাতা+২ বৈপিত্রেয় ভাই+সহোদর ভাই',
  { husband: 1, mother: 1, uterineBrother: 2, fullBrother: 1 },
  { husband: 1 / 2, mother: 1 / 6, uterineBrother: 1 / 3, fullBrother: 0 },
  'হানাফি মতে সহোদর ভাই বঞ্চিত (মুশতারাকা মালিকি/শাফেয়ি মত)');

// ── ১৩. সহোদর বোন ১/২ + বৈমাত্রেয় বোন ১/৬
t('সহোদর বোন + বৈমাত্রেয় বোন (তাকমিলা)', { fullSister: 1, consanguineSister: 1 },
  { fullSister: 1 / 2 * 1.5, consanguineSister: 1 / 6 * 1.5 },
  'রদ প্রযোজ্য: ১/২ ও ১/৬ → ৩/৪ ও ১/৪');

// ── ১৪. দাদী + নানী একসাথে
t('দাদী + নানী (মাতা মৃত) + পুত্র', { paternalGrandmother: 1, maternalGrandmother: 1, son: 1 },
  { paternalGrandmother: 1 / 12, maternalGrandmother: 1 / 12, son: 5 / 6 });

// ── ১৫. মাতা জীবিত থাকলে দাদী-নানী বঞ্চিত
t('মাতা জীবিত → দাদী/নানী বঞ্চিত', { mother: 1, paternalGrandmother: 1, maternalGrandmother: 1, son: 1 },
  { mother: 1 / 6, son: 5 / 6 });

// ── ১৬. দাদা (পিতা মৃত) + ১ পুত্র
t('দাদা + ১ পুত্র', { paternalGrandfather: 1, son: 1 }, { paternalGrandfather: 1 / 6, son: 5 / 6 });

// ── ১৭. মাতা ১/৬ (একাধিক ভাইবোন থাকলে)
t('মাতা + ২ সহোদর ভাই', { mother: 1, fullBrother: 2 }, { mother: 1 / 6, fullBrother: 5 / 6 });

// ── ১৮. একমাত্র স্বামী (রদ প্রযোজ্য নয়)
t('একমাত্র স্বামী', { husband: 1 }, { husband: 1 / 2 }, 'অবশিষ্ট ১/২ কোথাও যায়নি — বাইতুল মাল');

// ── ১৯. ১ কন্যা + ১ সহোদর ভাই
t('১ কন্যা + সহোদর ভাই', { daughter: 1, fullBrother: 1 }, { daughter: 1 / 2, fullBrother: 1 / 2 });

// ── ২০. স্বামী + মাতা + ১ বৈপিত্রেয় বোন (যোগফল ঠিক ১, রদ লাগে না)
t('স্বামী + মাতা + ১ বৈপিত্রেয় বোন', { husband: 1, mother: 1, uterineSister: 1 },
  { husband: 1 / 2, mother: 1 / 3, uterineSister: 1 / 6 });

// ── ২১. চাচা (দূরবর্তী আসাবা)
t('স্ত্রী + চাচা', { wife: 1, paternalUncle: 1 }, { wife: 1 / 4, paternalUncle: 3 / 4 });

// ── ২২. ভাতিজা
t('মাতা + সহোদর ভাইয়ের পুত্র', { mother: 1, fullBrotherSon: 1 },
  { mother: 1 / 3, fullBrotherSon: 2 / 3 });

// ── ২৩. পুত্র থাকলে ভাই-বোন বঞ্চিত
t('পুত্র থাকলে ভাই বঞ্চিত', { son: 1, fullBrother: 2 }, { son: 1 });

// ── ২৪. ৩ কন্যা (২/৩) + পিতা
t('৩ কন্যা + পিতা', { daughter: 3, father: 1 }, { daughter: 2 / 3, father: 1 / 3 });

// ── ২৫. ২ স্ত্রী + ১ পুত্র
t('২ স্ত্রী + ১ পুত্র', { wife: 2, son: 1 }, { wife: 1 / 8, son: 7 / 8 });

// ── ২৬. রদ স্ত্রী সহ: স্ত্রী + মাতা + ১ বৈপিত্রেয় বোন
t('রদ: স্ত্রী + মাতা + ১ বৈপিত্রেয় বোন', { wife: 1, mother: 1, uterineSister: 1 },
  { wife: 1 / 4, mother: 1 / 2, uterineSister: 1 / 4 });

// ── ২৭. মৃত পুত্র (আগে মৃত) — ১৯৬১ আইন, নাতি-নাতনি পিতার অংশ পায়
t('মৃত পুত্র (আগে মৃত) ১ পুত্র রেখে + ১ জীবিত পুত্র',
  { son: 1, deadSon: 1 },
  { son: 1 / 2, deadSon_1_son: 1 / 2 },
  null,
  { deadSon_1_timing: 'pre', deadSon_1_son: 1, deadSon_1_daughter: 0, deadSon_1_spouse: 0 });

// ── ২৮. মৃত পুত্র (পরে মৃত) — মুনাছাখা: স্ত্রী ১/৮ + পুত্র বাকি
t('মৃত পুত্র (পরে মৃত) স্ত্রী+১ পুত্র রেখে + ১ জীবিত পুত্র',
  { son: 1, deadSon: 1 },
  { son: 1 / 2, deadSon_1_spouse: (1 / 2) * (1 / 8), deadSon_1_son: (1 / 2) * (7 / 8) },
  null,
  { deadSon_1_timing: 'post', deadSon_1_son: 1, deadSon_1_daughter: 0, deadSon_1_spouse: 1 });

// ── ২৯. মৃত কন্যা (আগে মৃত) + ১ জীবিত পুত্র  → S=1, D=1 → ২:১
t('মৃত কন্যা (আগে মৃত) ১ কন্যা রেখে + ১ জীবিত পুত্র',
  { son: 1, deadDaughter: 1 },
  { son: 2 / 3, deadDaughter_1_daughter: 1 / 3 },
  null,
  { deadDaughter_1_timing: 'pre', deadDaughter_1_son: 0, deadDaughter_1_daughter: 1, deadDaughter_1_spouse: 0 });

// ── ৩০. [BUG-1 রিগ্রেশন] সন্তানহীন আগে-মৃত পুত্র উত্তরাধিকারী নন
t('BUG-1: সন্তানহীন আগে-মৃত পুত্র + ১ জীবিত পুত্র',
  { son: 1, deadSon: 1 },
  { son: 1 },
  null,
  { deadSon_1_timing: 'pre', deadSon_1_son: 0, deadSon_1_daughter: 0, deadSon_1_spouse: 0 });

// ── ৩১. [BUG-1 রিগ্রেশন] সন্তানহীন পরে-মৃত পুত্র, স্ত্রীও নেই
t('BUG-1: সন্তানহীন পরে-মৃত পুত্র (স্ত্রী নেই) + ১ জীবিত পুত্র',
  { son: 1, deadSon: 1 },
  { son: 1 },
  null,
  { deadSon_1_timing: 'post', deadSon_1_son: 0, deadSon_1_daughter: 0, deadSon_1_spouse: 0 });

// ── ৩২. [BUG-1 রিগ্রেশন] সন্তানহীন আগে-মৃত পুত্র → স্ত্রী ১/৮ নয়, ১/৪ পাবেন
t('BUG-1: স্ত্রী + সন্তানহীন আগে-মৃত পুত্র + ১ সহোদর ভাই',
  { wife: 1, deadSon: 1, fullBrother: 1 },
  { wife: 1 / 4, fullBrother: 3 / 4 },
  null,
  { deadSon_1_timing: 'pre', deadSon_1_son: 0, deadSon_1_daughter: 0, deadSon_1_spouse: 0 });

// ── ৩৩. [BUG-1 রিগ্রেশন] মুনাছাখা উদ্বৃত্ত: পরে-মৃত পুত্র শুধু স্ত্রী রেখে
//    মৃত পুত্রের অংশ ১/২ → স্ত্রী ১/৪ × ১/২ = ১/৮; বাকি ৩/৮ জীবিত পুত্রে ফিরবে
t('BUG-1: পরে-মৃত পুত্র শুধু স্ত্রী রেখে + ১ জীবিত পুত্র',
  { son: 1, deadSon: 1 },
  { son: 1 / 2 + 3 / 8, deadSon_1_spouse: 1 / 8 },
  null,
  { deadSon_1_timing: 'post', deadSon_1_son: 0, deadSon_1_daughter: 0, deadSon_1_spouse: 1 });

/* ===================================================================
   পুত্রের পুত্র (sonSon) ও পুত্রের কন্যা (sonDaughter)
   =================================================================== */

// ── ৩৪. পুত্র থাকলে পুত্রের পুত্র/কন্যা সম্পূর্ণ বঞ্চিত (হাজব)
t('পুত্র থাকলে পুত্রের পুত্র ও পুত্রের কন্যা বঞ্চিত',
  { son: 1, sonSon: 2, sonDaughter: 2 }, { son: 1 });

// ── ৩৫. একমাত্র পুত্রের কন্যা → ১/২, রদ করে ১০০%
t('একমাত্র পুত্রের কন্যা (রদ)', { sonDaughter: 1 }, { sonDaughter: 1 });

// ── ৩৬. ১ কন্যা + ১ পুত্রের কন্যা → ১/২ ও ১/৬ (তাকমিলা), রদে ৩/৪ ও ১/৪
t('তাকমিলা: ১ কন্যা + ১ পুত্রের কন্যা', { daughter: 1, sonDaughter: 1 },
  { daughter: 3 / 4, sonDaughter: 1 / 4 });

// ── ৩৭. ২ কন্যা + ১ পুত্রের কন্যা → কন্যারা ২/৩ নিয়ে নেওয়ায় পুত্রের কন্যা বঞ্চিত
t('২ কন্যা + পুত্রের কন্যা → পুত্রের কন্যা বঞ্চিত', { daughter: 2, sonDaughter: 1 },
  { daughter: 1 }, 'রদের পর কন্যারাই সব পান');

// ── ৩৮. ২ কন্যা + ১ পুত্রের পুত্র + ১ পুত্রের কন্যা → আসাবা বিল গায়র ২:১
t('আসাবা বিল গায়র: ২ কন্যা + পুত্রের পুত্র + পুত্রের কন্যা',
  { daughter: 2, sonSon: 1, sonDaughter: 1 },
  { daughter: 2 / 3, sonSon: 2 / 9, sonDaughter: 1 / 9 });

// ── ৩৯. পুত্রের পুত্র একা আসাবা
t('স্ত্রী + ১ পুত্রের পুত্র', { wife: 1, sonSon: 1 }, { wife: 1 / 8, sonSon: 7 / 8 });

// ── ৪০. মাতা ১/৬ (পুত্রের পুত্র বংশধর হিসেবে গণ্য)
t('মাতা + পুত্রের পুত্র', { mother: 1, sonSon: 1 }, { mother: 1 / 6, sonSon: 5 / 6 });

// ── ৪১. পিতা ১/৬ + অবশিষ্টভোগী; পুত্রের কন্যা ১/২
t('পিতা + ১ পুত্রের কন্যা', { father: 1, sonDaughter: 1 },
  { father: 1 / 2, sonDaughter: 1 / 2 });

// ── ৪২. স্বামী ১/৪ (বংশধর আছে) + পুত্রের কন্যা ১/২ → রদে স্বামী ১/৪, পুত্রের কন্যা ৩/৪
t('স্বামী + ১ পুত্রের কন্যা (রদ)', { husband: 1, sonDaughter: 1 },
  { husband: 1 / 4, sonDaughter: 3 / 4 });

// ── ৪৩. পুত্রের কন্যার উপস্থিতিতে সহোদর বোন আসাবা মাআল গায়র
t('আসাবা মাআল গায়র: ১ পুত্রের কন্যা + সহোদর বোন',
  { sonDaughter: 1, fullSister: 1 }, { sonDaughter: 1 / 2, fullSister: 1 / 2 });

// ── ৪৪. পুত্রের পুত্র ভাই-বোনকে বঞ্চিত করে (পুরুষ বংশধর)
t('পুত্রের পুত্র থাকলে সহোদর ভাই বঞ্চিত', { sonSon: 1, fullBrother: 2 },
  { sonSon: 1 });

// ── ৪৫. ২ পুত্রের কন্যা (কন্যা নেই) → একত্রে ২/৩, রদে ১০০%
t('২ পুত্রের কন্যা (রদ)', { sonDaughter: 2 }, { sonDaughter: 1 });

// ── ৪৬. পুত্রের পুত্র বৈপিত্রেয় ভাই-বোনকে বঞ্চিত করে
t('পুত্রের পুত্র থাকলে বৈপিত্রেয় ভাই বঞ্চিত', { sonSon: 1, uterineBrother: 2 },
  { sonSon: 1 });

// ── ৪৭. স্ত্রী + ১ কন্যা + ১ পুত্রের কন্যা + পিতা
//    স্ত্রী ১/৮, কন্যা ১/২, পুত্রের কন্যা ১/৬, পিতা ১/৬ = ২৩/২৪ → পিতা অবশিষ্ট ১/২৪ পান
t('স্ত্রী + কন্যা + পুত্রের কন্যা + পিতা',
  { wife: 1, daughter: 1, sonDaughter: 1, father: 1 },
  { wife: 1 / 8, daughter: 1 / 2, sonDaughter: 1 / 6, father: 1 / 6 + 1 / 24 });

// ================= RUN =================
let pass = 0, fail = 0;
const failures = [];

console.log('\n' + '='.repeat(78));
console.log('  ফরায়েজ ইঞ্জিন টেস্ট — Land Info');
console.log('='.repeat(78));

CASES.forEach((c, i) => {
  let res;
  try { res = run(c.heirs, c.dynamic || {}); }
  catch (e) { fail++; failures.push({ c, err: e.message }); console.log(`\n[${i + 1}] ✗ ERROR  ${c.name}\n     ${e.message}`); return; }

  const shares = res.shares;
  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  const problems = [];

  for (const k in c.expected) {
    const got = shares[k] || 0, exp = c.expected[k];
    if (Math.abs(got - exp) > 1e-6) problems.push(`  ${k}: পাওয়া ${frac(got)} (${(got * 100).toFixed(3)}%) — প্রত্যাশিত ${frac(exp)} (${(exp * 100).toFixed(3)}%)`);
  }
  for (const k in shares) {
    if (shares[k] > 1e-6 && !(k in c.expected)) problems.push(`  ${k}: অপ্রত্যাশিতভাবে ${frac(shares[k])} পেয়েছে`);
  }
  const expTotal = Object.values(c.expected).reduce((a, b) => a + b, 0);
  if (Math.abs(total - expTotal) > 1e-6) problems.push(`  মোট যোগফল: ${frac(total)} (${(total * 100).toFixed(3)}%) — প্রত্যাশিত ${frac(expTotal)}`);

  if (problems.length === 0) { pass++; console.log(`\n[${i + 1}] ✓ ${c.name}`); }
  else {
    fail++; failures.push({ c, problems });
    console.log(`\n[${i + 1}] ✗ ${c.name}`);
    problems.forEach(p => console.log(p));
    if (c.note) console.log(`     টীকা: ${c.note}`);
  }
});

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল:  ✓ পাস ${pass}   ✗ ফেল ${fail}   (মোট ${CASES.length})`);
console.log('='.repeat(78) + '\n');
