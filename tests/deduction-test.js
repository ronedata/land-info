/* বণ্টনের আগে বাদ যাওয়া খাত — দাফন-কাফন · ঋণ · ওসিয়ত
   শরিয়াহ ক্রম: দাফন-কাফন → ঋণ → ওসিয়ত (অবশিষ্টের সর্বোচ্চ ১/৩) → বণ্টন */
const fs = require('fs'), path = require('path'), vm = require('vm');
// ফোল্ডার সরালেও যেন না ভাঙে — পথ ফাইলের অবস্থান থেকেই বের করা
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/calculators.js'), 'utf8');
const sb = { console, module: { exports: {} } };
vm.createContext(sb);
const LM = vm.runInContext(src + '\n; LandMath;', sb);

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra !== undefined ? '   → ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a, b, tol) => Math.abs(a - b) < (tol || 1e-6);
const E = (...a) => LM.estateAfterDeductions(...a);

console.log('\n' + '='.repeat(78));
console.log('  কোনো বাদ নেই — আগের মতোই পুরো সম্পত্তি বণ্টনযোগ্য');
console.log('='.repeat(78));

let r = E(120);
check('বণ্টনযোগ্য = ১২০', near(r.net, 120), r.net);
check('hasDeduction = false', r.hasDeduction === false);
check('ওসিয়ত কাটা পড়েনি', r.bequestCapped === false);
check('সম্পত্তি যথেষ্ট', r.insufficient === false);

// শূন্য ও অবৈধ ইনপুট
check('শূন্য সম্পত্তি → ০', near(E(0).net, 0));
check('ঋণাত্মক সম্পত্তি → ০', near(E(-50).net, 0), E(-50).net);
check('ঋণাত্মক ঋণ উপেক্ষিত', near(E(100, 0, -20).net, 100), E(100, 0, -20).net);
check('undefined → ০', near(E(undefined).net, 0));
check('স্ট্রিং ইনপুটও চলে', near(E('100', '0', '10').net, 90), E('100', '0', '10').net);

console.log('\n' + '='.repeat(78));
console.log('  দাফন-কাফন ও ঋণ');
console.log('='.repeat(78));

r = E(100, 5, 15);
check('১০০ − ৫ − ১৫ = ৮০', near(r.net, 80), r.net);
check('afterDebt = ৮০', near(r.afterDebt, 80));
check('hasDeduction = true', r.hasDeduction === true);

// ঋণ সম্পত্তির সমান
r = E(100, 0, 100);
check('ঋণ = সম্পত্তি → বণ্টনযোগ্য ০', near(r.net, 0), r.net);
check('এটি "অপর্যাপ্ত" নয় (ঠিক সমান)', r.insufficient === false);

// ঋণ সম্পত্তির চেয়ে বেশি
r = E(100, 10, 150);
check('ঋণ > সম্পত্তি → বণ্টনযোগ্য ০', near(r.net, 0), r.net);
check('insufficient = true', r.insufficient === true);
check('ঘাটতি = ১৬০ − ১০০ = ৬০', near(r.shortfall, 60), r.shortfall);
check('ঋণাত্মক net কখনো নয়', r.net >= 0);

// ঋণ অপর্যাপ্ত হলে ওসিয়তও শূন্য
r = E(100, 0, 200, 50);
check('ঋণ শোধ না হলে ওসিয়ত ০', near(r.bequest, 0), r.bequest);
check('ওসিয়তের অনুমোদিত সীমাও ০', near(r.bequestAllowed, 0));

console.log('\n' + '='.repeat(78));
console.log('  ওসিয়ত — অবশিষ্টের সর্বোচ্চ ১/৩');
console.log('='.repeat(78));

check('সীমা ধ্রুবক = ১/৩', near(LM.BEQUEST_LIMIT, 1 / 3));

// ১২০ শতক, ঋণ নেই → সীমা ৪০
r = E(120, 0, 0, 30);
check('৩০ ≤ ৪০ → পুরোটাই বৈধ', near(r.bequest, 30), r.bequest);
check('কাটা পড়েনি', r.bequestCapped === false);
check('বণ্টনযোগ্য = ৯০', near(r.net, 90), r.net);

r = E(120, 0, 0, 40);
check('ঠিক ১/৩ (৪০) বৈধ — কাটা পড়ে না', r.bequestCapped === false, r.bequest);
check('বণ্টনযোগ্য = ৮০', near(r.net, 80));

r = E(120, 0, 0, 60);
check('৬০ > ৪০ → ৪০ এ নামে', near(r.bequest, 40), r.bequest);
check('bequestCapped = true', r.bequestCapped === true);
check('যা চাওয়া হয়েছিল মনে রাখে', near(r.bequestAsked, 60));
check('বণ্টনযোগ্য = ৮০ (৬০ নয়)', near(r.net, 80), r.net);

// ঋণ আগে বাদ যায়, তারপর ১/৩ হিসাব হয় — ক্রম ঠিক আছে কি?
r = E(120, 0, 30, 40);
check('ঋণ ৩০ বাদে অবশিষ্ট ৯০, সীমা ৩০', near(r.bequestAllowed, 30), r.bequestAllowed);
check('ওসিয়ত ৪০ → ৩০ এ নামে', near(r.bequest, 30), r.bequest);
check('বণ্টনযোগ্য = ৬০', near(r.net, 60), r.net);
// ভুল ক্রমে (আগে ওসিয়ত) হলে সীমা হতো ৪০ → বণ্টনযোগ্য ৫০ হয়ে যেত
check('ভুল ক্রমের ফল (৫০) আসেনি', !near(r.net, 50));

console.log('\n' + '='.repeat(78));
console.log('  সব খাত একসাথে ও বাস্তব উদাহরণ');
console.log('='.repeat(78));

// নগদ ১০,০০,০০০ · দাফন ৫০,০০০ · ঋণ ২,০০,০০০ · ওসিয়ত ৩,০০,০০০
r = E(1000000, 50000, 200000, 300000);
check('অবশিষ্ট (ঋণ পর) = ৭,৫০,০০০', near(r.afterDebt, 750000), r.afterDebt);
check('ওসিয়তের সীমা = ২,৫০,০০০', near(r.bequestAllowed, 250000), r.bequestAllowed);
check('ওসিয়ত ৩ লাখ → ২.৫ লাখ', near(r.bequest, 250000), r.bequest);
check('বণ্টনযোগ্য = ৫,০০,০০০', near(r.net, 500000), r.net);

// দশমিকে জমি
r = E(33.33, 0, 3.33, 10);
check('জমি ৩৩.৩৩ শতক — সীমা ঠিক', near(r.bequestAllowed, 10), r.bequestAllowed.toFixed(4));
check('ওসিয়ত ১০ বৈধ (ঠিক ১/৩)', r.bequestCapped === false);
check('বণ্টনযোগ্য = ২০ শতক', near(r.net, 20, 1e-4), r.net.toFixed(4));

// যোগফল সবসময় মেলে: net + bequest + funeral + debt = gross (অপর্যাপ্ত না হলে)
let ok = true;
[[100, 3, 7, 20], [55.5, 0, 5.5, 10], [1e6, 5e4, 2e5, 1e5], [7, 1, 1, 1]].forEach(a => {
  const x = E(...a);
  if (!near(x.net + x.bequest + x.funeral + x.debt, x.gross, 1e-6)) ok = false;
});
check('যোগফল সর্বদা মূল সম্পত্তির সমান', ok);

// একই সম্পত্তিতে বারবার ডাকলে একই ফল (কোনো state নেই)
check('ফাংশনটি বিশুদ্ধ — ফল বদলায় না',
  JSON.stringify(E(120, 5, 15, 50)) === JSON.stringify(E(120, 5, 15, 50)));

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
console.log('='.repeat(78) + '\n');
process.exit(fail ? 1 : 0);
