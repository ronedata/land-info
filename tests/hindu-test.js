/* হিন্দু উত্তরাধিকার (দায়ভাগ) ইঞ্জিন টেস্ট */
const fs = require('fs'), path = require('path'), vm = require('vm');

// ফোল্ডার সরালেও যেন না ভাঙে — পথ ফাইলের অবস্থান থেকেই বের করা
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/hindu-inheritance.js'), 'utf8');
const sandbox = { console, module: { exports: {} } };
vm.createContext(sandbox);
const H = vm.runInContext(src + '\n; HinduLaw;', sandbox);

function frac(x, maxDen = 5040) {
  if (Math.abs(x) < 1e-9) return '0';
  let best = [0, 1], err = Infinity;
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(x * d);
    const e = Math.abs(x - n / d);
    if (e < err - 1e-12) { err = e; best = [n, d]; if (e < 1e-10) break; }
  }
  return best[1] === 1 ? String(best[0]) : `${best[0]}/${best[1]}`;
}

const CASES = [];
function t(name, counts, expected, opts = {}) {
  CASES.push({ name, counts, expected, dyn: opts.dyn || {}, stage: opts.stage, note: opts.note });
}

/* ---------------- শ্রেণি ১: পুত্র ও বিধবা ---------------- */

t('২ পুত্র + ১ বিধবা স্ত্রী → প্রত্যেকে ১/৩',
  { son: 2, widow: 1 }, { son: 2 / 3, widow: 1 / 3 }, { stage: 'class1' });

t('২ পুত্র + ২ বিধবা → বিধবারা মিলে ১/৩',
  { son: 2, widow: 2 }, { son: 2 / 3, widow: 1 / 3 }, { stage: 'class1' });

t('শুধু ৩ পুত্র', { son: 3 }, { son: 1 }, { stage: 'class1' });

t('শুধু ১ বিধবা স্ত্রী → সম্পূর্ণ সম্পত্তি',
  { widow: 1 }, { widow: 1 }, { stage: 'widow' });

t('১ পুত্র + ১ বিধবা + কন্যা → কন্যা বঞ্চিত',
  { son: 1, widow: 1, unmarriedDaughter: 2 },
  { son: 1 / 2, widow: 1 / 2 }, { stage: 'class1' });

/* ---------------- প্রতিনিধিত্ব (per stirpes) ---------------- */

t('২ জীবিত পুত্র + ১ মৃত পুত্র (২ পৌত্র রেখে) → শাখা ১/৩ করে',
  { son: 2, deadSon: 1 },
  { son: 2 / 3, deadSon_1_son: 1 / 3 },
  { dyn: { deadSon_1_son: 2 }, stage: 'class1',
    note: 'পৌত্র দুজন মিলে তাদের পিতার ১/৩ পাবেন → জনপ্রতি ১/৬' });

t('মৃত পুত্রের বিধবা + ১ পৌত্র → শাখার ভেতরে সমান',
  { son: 1, deadSon: 1 },
  { son: 1 / 2, deadSon_1_son: 1 / 4, deadSon_1_widow: 1 / 4 },
  { dyn: { deadSon_1_son: 1, deadSon_1_widow: 1 }, stage: 'class1' });

t('মৃত পুত্র শুধু বিধবা রেখে → পুরো শাখা তার',
  { son: 1, deadSon: 1 },
  { son: 1 / 2, deadSon_1_widow: 1 / 2 },
  { dyn: { deadSon_1_widow: 1 }, stage: 'class1' });

t('উত্তরাধিকারহীন মৃত পুত্র গণনায় আসবে না',
  { son: 1, deadSon: 1 }, { son: 1 },
  { dyn: {}, stage: 'class1' });

t('বিধবা + ১ জীবিত পুত্র + ১ মৃত পুত্র (১ পৌত্র)',
  { son: 1, deadSon: 1, widow: 1 },
  { son: 1 / 3, deadSon_1_son: 1 / 3, widow: 1 / 3 },
  { dyn: { deadSon_1_son: 1 }, stage: 'class1' });

t('পুত্র নেই, শুধু মৃত পুত্রের পৌত্র + বিধবা স্ত্রী',
  { deadSon: 1, widow: 1 },
  { deadSon_1_son: 1 / 2, widow: 1 / 2 },
  { dyn: { deadSon_1_son: 2 }, stage: 'class1' });

/* ---------------- শ্রেণি ২: কন্যা ---------------- */

t('অবিবাহিতা কন্যা অগ্রগণ্য',
  { unmarriedDaughter: 2, sonfulDaughter: 1, barrenDaughter: 1 },
  { unmarriedDaughter: 1 }, { stage: 'daughter' });

t('অবিবাহিতা নেই → পুত্রবতী কন্যা পাবেন',
  { sonfulDaughter: 2, barrenDaughter: 1 },
  { sonfulDaughter: 1 }, { stage: 'daughter' });

t('শুধু বন্ধ্যা কন্যা → বঞ্চিত, পিতা পাবেন',
  { barrenDaughter: 2, father: 1 },
  { father: 1 }, { stage: 'father' });

t('কন্যা নেই → দৌহিত্র per capita',
  { daughterSon: 5 }, { daughterSon: 1 }, { stage: 'daughterSon' });

t('বন্ধ্যা কন্যা + দৌহিত্র → দৌহিত্র পাবেন',
  { barrenDaughter: 1, daughterSon: 2 },
  { daughterSon: 1 }, { stage: 'daughterSon' });

/* ---------------- শ্রেণি ৩ ও ৪: একক ক্রম ---------------- */

t('পিতা মাতাকে বঞ্চিত করেন',
  { father: 1, mother: 1 }, { father: 1 }, { stage: 'father' });

t('পিতা নেই → মাতা',
  { mother: 1, fullBrother: 2 }, { mother: 1 }, { stage: 'mother' });

t('সহোদর ভাই বৈমাত্রেয় ভাইকে বঞ্চিত করেন',
  { fullBrother: 2, stepBrother: 3 }, { fullBrother: 1 }, { stage: 'fullBrother' });

t('ভাই নেই → ভ্রাতুষ্পুত্র',
  { brotherSon: 2, sisterSon: 1 }, { brotherSon: 1 }, { stage: 'brotherSon' });

t('সব নিকটাত্মীয় নেই → পিতামহ',
  { paternalGrandfather: 1, paternalUncle: 2 },
  { paternalGrandfather: 1 }, { stage: 'paternalGrandfather' });

t('শুধু চাচাতো ভাই',
  { paternalUncleSon: 3 }, { paternalUncleSon: 1 }, { stage: 'paternalUncleSon' });

t('কেউ নেই', {}, {}, { stage: 'none' });

/* ---------------- অগ্রাধিকার যাচাই ---------------- */

t('পুত্র থাকলে পিতা-মাতা-ভাই সবাই বঞ্চিত',
  { son: 1, father: 1, mother: 1, fullBrother: 2, daughterSon: 3 },
  { son: 1 }, { stage: 'class1' });

t('বিধবা থাকলে কন্যা ও পিতা বঞ্চিত',
  { widow: 1, unmarriedDaughter: 2, father: 1 },
  { widow: 1 }, { stage: 'widow' });

t('কন্যা থাকলে দৌহিত্র ও পিতা বঞ্চিত',
  { unmarriedDaughter: 1, daughterSon: 3, father: 1 },
  { unmarriedDaughter: 1 }, { stage: 'daughter' });

/* ================= RUN ================= */
let pass = 0, fail = 0;
console.log('\n' + '='.repeat(78));
console.log('  হিন্দু উত্তরাধিকার (দায়ভাগ) ইঞ্জিন টেস্ট — Land Info');
console.log('='.repeat(78));

CASES.forEach((c, i) => {
  let res;
  try { res = H.calculate(c.counts, c.dyn); }
  catch (e) { fail++; console.log(`\n[${i + 1}] ✗ ERROR  ${c.name}\n     ${e.message}`); return; }

  const problems = [];
  for (const k in c.expected) {
    const got = res.shares[k] || 0, exp = c.expected[k];
    if (Math.abs(got - exp) > 1e-9) {
      problems.push(`  ${k}: পাওয়া ${frac(got)} (${(got * 100).toFixed(3)}%) — প্রত্যাশিত ${frac(exp)}`);
    }
  }
  for (const k in res.shares) {
    if (res.shares[k] > 1e-9 && !(k in c.expected)) {
      problems.push(`  ${k}: অপ্রত্যাশিতভাবে ${frac(res.shares[k])} পেয়েছে`);
    }
  }
  const total = Object.values(res.shares).reduce((a, b) => a + b, 0);
  const expTotal = Object.values(c.expected).reduce((a, b) => a + b, 0);
  if (Math.abs(total - expTotal) > 1e-9) {
    problems.push(`  মোট যোগফল: ${frac(total)} — প্রত্যাশিত ${frac(expTotal)}`);
  }
  if (c.stage && res.stage !== c.stage) {
    problems.push(`  stage: পাওয়া "${res.stage}" — প্রত্যাশিত "${c.stage}"`);
  }

  if (!problems.length) { pass++; console.log(`\n[${i + 1}] ✓ ${c.name}`); }
  else {
    fail++;
    console.log(`\n[${i + 1}] ✗ ${c.name}`);
    problems.forEach(p => console.log(p));
    if (c.note) console.log(`     টীকা: ${c.note}`);
  }
});

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল:  ✓ পাস ${pass}   ✗ ফেল ${fail}   (মোট ${CASES.length})`);
console.log('='.repeat(78) + '\n');
