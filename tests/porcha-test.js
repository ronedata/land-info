/* খতিয়ান বিশ্লেষণ (পর্চার হিসাব) — bdlandpro এর মডেল অনুযায়ী
   মূল যাচাই:
     ১. বিশ্লেষণ হয় "খতিয়ানে দাগের জমির" উপর, দাগের মোটের উপর নয়
     ২. হিস্যার যোগ ১ না হলে স্বাভাবিক (normalize) করা যাবে না
     ৩. যোগ ১ হলে largest-remainder দিয়ে যোগফল হুবহু মেলাতে হবে */
const fs = require('fs'), path = require('path'), vm = require('vm');
// ফোল্ডার সরালেও যেন না ভাঙে — পথ ফাইলের অবস্থান থেকেই বের করা
const ROOT = path.resolve(__dirname, '..');

const src = fs.readFileSync(path.join(ROOT, 'js/calculators.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(ROOT, 'js/khotian-porcha.js'), 'utf8');
const sb = { console, module: { exports: {} } };
vm.createContext(sb);
const { LM, PM } = vm.runInContext(src + '\n; ({ LM: LandMath, PM: PorchaMath });', sb);

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra !== undefined ? '   → ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a, b, tol) => Math.abs(a - b) < (tol || 1e-9);
const sum = a => a.reduce((x, y) => x + y, 0);

console.log('\n' + '='.repeat(78));
console.log('  ★ bdlandpro এর নমুনা হুবহু মেলে কি?');
console.log('='.repeat(78));
/* তাদের নমুনা: ভাগ্যকুল, খতিয়ান ২৩৪, ৪ জনের মধ্যে ৩ জনের বিশ্লেষণ
   দাগ ৩৫৬: মোট ৫০, খতিয়ানে ৩৩.৫০ · দাগ ৩৫৭: মোট ২০, খতিয়ানে ১২ · দাগ ৩৬২: খতিয়ানে ৮.২৫
   হিস্যা: ০.৩৩৩ · ০.৩৩৩ · ০.১৬৭  (যোগ ০.৮৩৩ — পুরো ১ নয়)
   তাদের ফল (মালিক ১): ১১.১৫৫৫ · ৩.৯৯৬০ · ২.৭৪৭৩ · মোট ১৭.৮৯৮৭ */
const S = PM.sampleData();
let a = PM.analyze({
  unit: S.unit, decimals: 4, totalOwners: S.totalOwners,
  dags: S.dags,
  owners: S.owners.map(o => ({ ...o, type: 'decimal' }))
});

check('খতিয়ানে মোট জমি ৫৩.৭৫', near(a.khotianTotal, 53.75), a.khotianTotal);
check('দাগের সর্বমোট ৭০ (৫০+২০, ৩৬২ এর নেই)', near(a.dagGrandTotal, 70), a.dagGrandTotal);
check('হিস্যার যোগ ০.৮৩৩', near(a.hissaSum, 0.833), a.hissaSum);
check('পূর্ণ বিশ্লেষণ নয় (isFull=false)', a.isFull === false);
check('আংশিক বিশ্লেষণ চিহ্নিত (৪ এর মধ্যে ৩)', a.isPartial === true);

const o1 = a.owners[0];
console.log('    মালিক ১ এর দাগভিত্তিক:', o1.perDag.join(' · '));
check('দাগ ৩৫৬ → ১১.১৫৫৫ (৩৩.৫০ × ০.৩৩৩)', near(o1.perDag[0], 11.1555), o1.perDag[0]);
check('দাগ ৩৫৭ → ৩.৯৯৬০ (১২ × ০.৩৩৩)', near(o1.perDag[1], 3.996), o1.perDag[1]);
check('দাগ ৩৬২ → ২.৭৪৭৩ (৮.২৫ × ০.৩৩৩)', near(o1.perDag[2], 2.7473), o1.perDag[2]);
check('মালিক ১ এর মোট ১৭.৮৯৮৮', near(o1.total, 17.8988), o1.total);

// ★ পুরনো ভুল: স্বাভাবিক করলে ৩৩.৫০ × (০.৩৩৩/০.৮৩৩) = ১৩.৩৯ আসত
check('★ স্বাভাবিক করা হয়নি (১৩.৩৯ আসেনি)', !near(o1.perDag[0], 13.39, 0.01), o1.perDag[0]);

check('মালিক ৩ (০.১৬৭) দাগ ৩৫৬ → ৫.৫৯৪৫', near(a.owners[2].perDag[0], 5.5945), a.owners[2].perDag[0]);

console.log('\n  অন্য মালিকগণের অবশিষ্ট');
// ৩৩.৫ − (১১.১৫৫৫ + ১১.১৫৫৫ + ৫.৫৯৪৫) = ৫.৫৯৪৫
check('দাগ ৩৫৬ এ অবশিষ্ট = ৫.৫৯৪৫',
  near(a.dags[0].unallocated, 5.5945), a.dags[0].unallocated);
// প্রতি দাগে রাউন্ড হওয়ার পর যোগ: ৫.৫৯৪৫ + ২.০০৪ + ১.৩৭৭৬
check('মোট অবশিষ্ট ৮.৯৭৬১ (≈ ১৬.৭%)', near(a.unallocatedTotal, 8.9761), a.unallocatedTotal);
check('অবশিষ্ট তাত্ত্বিক মানের কাছাকাছি (৫৩.৭৫ × ০.১৬৭)',
  near(a.unallocatedTotal, 53.75 * 0.167, 0.001), (53.75 * 0.167).toFixed(5));
check('বিশ্লেষিত + অবশিষ্ট = খতিয়ানের মোট',
  near(a.analyzedTotal + a.unallocatedTotal, a.khotianTotal, 1e-4),
  `${a.analyzedTotal} + ${a.unallocatedTotal} = ${a.khotianTotal}`);

console.log('\n  বর্গফুট');
check('দাগ ৩৫৬ এর খতিয়ান জমি ১৪৫৯২.৬ বর্গফুট',
  near(a.dags[0].khotianSqft, 14592.6, 0.2), a.dags[0].khotianSqft);
check('মালিক ১ এর মোট ৭৭৯৬.৮ বর্গফুট', near(o1.totalSqft, 7796.8, 0.3), o1.totalSqft);

console.log('\n' + '='.repeat(78));
console.log('  পূর্ণ খতিয়ান (হিস্যার যোগ = ১) — যোগফল হুবহু মেলে');
console.log('='.repeat(78));

a = PM.analyze({
  unit: 'শতক', decimals: 4, totalOwners: 3,
  dags: [{ no: '১০১', khotianArea: 30 }, { no: '১০২', khotianArea: 15.5 }, { no: '১০৩', khotianArea: 8.25 }],
  owners: [
    { name: 'করিম', type: 'anagonda', data: { ana: 8 } },
    { name: 'রহিম', type: 'anagonda', data: { ana: 4 } },
    { name: 'ফাতেমা', type: 'anagonda', data: { ana: 4 } }
  ]
});
check('isFull = true', a.isFull === true, a.hissaSum);
check('আংশিক নয়', a.isPartial === false);
check('অবশিষ্ট ০', near(a.unallocatedTotal, 0), a.unallocatedTotal);
check('দাগ ১০১ → ১৫ / ৭.৫ / ৭.৫',
  a.owners.map(o => o.perDag[0]).join(',') === '15,7.5,7.5', a.owners.map(o => o.perDag[0]).join(','));

let allOk = true;
a.dags.forEach((d, di) => {
  const col = sum(a.owners.map(o => o.perDag[di]));
  if (!near(col, d.khotianArea, 1e-9)) { allOk = false; console.log('    ✗', d.no, col, 'vs', d.khotianArea); }
});
check('★ প্রতিটি দাগের কলামের যোগ = খতিয়ানে দাগের জমি', allOk);
check('মালিকদের মোট = খতিয়ানের মোট', near(a.analyzedTotal, a.khotianTotal), a.analyzedTotal);

// রাউন্ডিং যেখানে কামড় দেয়
a = PM.analyze({
  unit: 'শতক', decimals: 2, totalOwners: 3,
  dags: [{ no: '১', khotianArea: 100 }],
  owners: [1, 2, 3].map(i => ({ name: 'ম' + i, type: 'fraction', data: { num: 1, den: 3 } }))
});
let col = a.owners.map(o => o.perDag[0]);
check('১০০ ÷ ৩ (২ দশমিক) = ৩৩.৩৪/৩৩.৩৩/৩৩.৩৩', col.join(',') === '33.34,33.33,33.33', col.join(','));
check('যোগ হুবহু ১০০', near(sum(col), 100), sum(col));
check('সমন্বয় হয়েছে বলে জানায়', a.anyAdjusted === true);

console.log('\n' + '='.repeat(78));
console.log('  দুই স্তরের জমি — খতিয়ানের জমির উপরই ভাগ হয়');
console.log('='.repeat(78));

a = PM.analyze({
  unit: 'শতক', decimals: 4, totalOwners: 2,
  // দাগে মোট ১০০ শতক, কিন্তু এই খতিয়ানে মাত্র ৪০
  dags: [{ no: '৫০', cls: 'কৃষি জমি', totalArea: 100, khotianArea: 40 }],
  owners: [{ name: 'ক', type: 'decimal', data: { decimal: 0.5 } },
           { name: 'খ', type: 'decimal', data: { decimal: 0.5 } }]
});
check('ভাগ হয়েছে ৪০ এর উপর → ২০/২০', a.owners.map(o => o.total).join(',') === '20,20', a.owners.map(o => o.total).join(','));
check('১০০ এর উপর হয়নি (৫০ আসেনি)', !near(a.owners[0].total, 50));
check('দাগের মোট আলাদা রাখা আছে', near(a.dags[0].totalArea, 100) && a.dags[0].hasTotal === true);
check('শ্রেণী সংরক্ষিত', a.dags[0].cls === 'কৃষি জমি');

// দাগের মোট না দিলে
a = PM.analyze({ unit: 'শতক', dags: [{ no: '১', khotianArea: 10 }],
  owners: [{ name: 'ক', type: 'decimal', data: { decimal: 1 } }] });
check('দাগের মোট ঐচ্ছিক — না দিলে hasTotal=false', a.dags[0].hasTotal === false);
check('তবু হিসাব হয়', near(a.owners[0].total, 10));

// খতিয়ানের জমি দাগের মোটের চেয়ে বেশি → তথ্যে ভুল
a = PM.analyze({ unit: 'শতক', dags: [{ no: '১', totalArea: 10, khotianArea: 25 }],
  owners: [{ name: 'ক', type: 'decimal', data: { decimal: 1 } }] });
check('খতিয়ানের জমি > দাগের মোট → overTotal', a.dags[0].overTotal === true);
check('anyOverTotal জানায়', a.anyOverTotal === true);

console.log('\n' + '='.repeat(78));
console.log('  হিস্যা ১ এর বেশি — তথ্যে ভুল');
console.log('='.repeat(78));

a = PM.analyze({
  unit: 'শতক', dags: [{ no: '১', khotianArea: 100 }],
  owners: [{ name: 'ক', type: 'percent', data: { percent: 60 } },
           { name: 'খ', type: 'percent', data: { percent: 60 } }]
});
check('isOver = true', a.isOver === true, a.hissaSum);
check('isFull = false', a.isFull === false);
check('স্বাভাবিক না করায় ৬০/৬০ আসে', a.owners.map(o => o.total).join(',') === '60,60', a.owners.map(o => o.total).join(','));
check('অবশিষ্ট ঋণাত্মক (সংকেত)', a.unallocatedTotal < 0, a.unallocatedTotal);

console.log('\n' + '='.repeat(78));
console.log('  মালিকের পরিচিতি');
console.log('='.repeat(78));

a = PM.analyze({
  unit: 'শতক', dags: [{ no: '১', khotianArea: 10 }],
  owners: [
    { name: 'সুফিয়া বেগম', relation: 'husband', guardian: 'করিম', address: 'ঢাকা',
      type: 'decimal', data: { decimal: 1 } }
  ]
});
let o = a.owners[0];
check('সম্পর্ক স্বামী', o.relationName === 'স্বামী', o.relationName);
check('লেবেল "স্বামীর নাম"', o.guardianLabel === 'স্বামীর নাম', o.guardianLabel);
check('অভিভাবকের নাম', o.guardian === 'করিম');
check('ঠিকানা', o.address === 'ঢাকা');

a = PM.analyze({ unit: 'শতক', dags: [{ no: '১', khotianArea: 10 }],
  owners: [{ name: 'ক', type: 'decimal', data: { decimal: 1 } }] });
check('সম্পর্ক না দিলে ডিফল্ট পিতা', a.owners[0].relationName === 'পিতা');
check('৩ ধরনের সম্পর্ক', PM.RELATIONS.length === 3);

console.log('\n' + '='.repeat(78));
console.log('  তালিকা ও পরামর্শ');
console.log('='.repeat(78));

check('৮ ধরনের খতিয়ান', PM.KHOTIAN_TYPES.length === 8, PM.KHOTIAN_TYPES.length);
check('বি.এস. সবার আগে', PM.KHOTIAN_TYPES[0].id === 'bs');
check('পি.এস. ও নামজারি আছে',
  PM.KHOTIAN_TYPES.some(t => t.id === 'ps') && PM.KHOTIAN_TYPES.some(t => t.id === 'namjari'));
check('১৯টি জমির শ্রেণী', PM.LAND_CLASSES.length === 19, PM.LAND_CLASSES.length);
check('কৃষি জমি ও বাস্তু আছে',
  PM.LAND_CLASSES.includes('কৃষি জমি') && PM.LAND_CLASSES.includes('বাস্তু (বাড়িঘর)'));
check('৪ ধরনের হিস্যা (শতাংশসহ)', PM.HISSA_TYPES.length === 4);
check('দশমিক সবার আগে', PM.HISSA_TYPES[0].id === 'decimal');

check('সি.এস. এ আনা-গণ্ডা পরামর্শ', PM.suggestHissaType('cs') === 'anagonda');
check('পি.এস. এ আনা-গণ্ডা পরামর্শ', PM.suggestHissaType('ps') === 'anagonda');
check('বি.এস. এ দশমিক পরামর্শ', PM.suggestHissaType('bs') === 'decimal');
check('আর.এস. এ দশমিক পরামর্শ', PM.suggestHissaType('rs') === 'decimal');

console.log('\n' + '='.repeat(78));
console.log('  একক রূপান্তর');
console.log('='.repeat(78));

check('১ শতক = ৪৩৫.৬ বর্গফুট', near(PM.toSqft(1, 'শতক'), 435.6, 0.01), PM.toSqft(1, 'শতক'));
check('১ একর = ৪৩৫৬০ বর্গফুট', near(PM.toSqft(1, 'একর'), 43560, 1));
check('১ বর্গফুট = ১', near(PM.toSqft(1, 'বর্গফুট'), 1));
LM.setKathaPreset('standard');
check('১ কাঠা = ৭২০ বর্গফুট', near(PM.toSqft(1, 'কাঠা'), 720, 0.1), PM.toSqft(1, 'কাঠা'));
LM.setKathaPreset('wide');
check('চওড়া কাঠায় ১ কাঠা = ১১৩২.৫৬', near(PM.toSqft(1, 'কাঠা'), 1132.56, 0.1), PM.toSqft(1, 'কাঠা'));
LM.setKathaPreset('standard');
check('অজানা একক → শতক ধরে নেয়', near(PM.toSqft(1, 'হাবিজাবি'), 435.6, 0.01));

console.log('\n' + '='.repeat(78));
console.log('  প্রান্তিক ও ভুল ইনপুট — throw করা যাবে না');
console.log('='.repeat(78));

check('কিছুই না দিলে', PM.analyze({}).dagCount === 0);
check('undefined', PM.analyze().ownerCount === 0);
check('দাগ নেই', PM.analyze({ owners: [{ name: 'ক', type: 'decimal', data: { decimal: 1 } }] }).owners[0].total === 0);
check('মালিক নেই', PM.analyze({ dags: [{ no: '১', khotianArea: 10 }] }).dags[0].split.length === 0);

a = PM.analyze({ dags: [{ khotianArea: 10 }, { no: '  ', khotianArea: 5 }],
  owners: [{ type: 'decimal', data: { decimal: 1 } }] });
check('দাগ নং ফাঁকা → বাংলা সংখ্যায় নাম', a.dags[0].no === 'দাগ ১', a.dags[0].no);
check('মালিকের নাম ফাঁকা → "মালিক ১"', a.owners[0].name === 'মালিক ১', a.owners[0].name);

check('ঋণাত্মক জমি → ০',
  PM.analyze({ dags: [{ no: '১', khotianArea: -50 }], owners: [{ type: 'decimal', data: { decimal: 1 } }] })
    .dags[0].khotianArea === 0);
check('অক্ষর → ০',
  PM.analyze({ dags: [{ no: '১', khotianArea: 'abc' }], owners: [{ type: 'decimal', data: { decimal: 1 } }] })
    .dags[0].khotianArea === 0);
check('স্ট্রিং সংখ্যা চলে',
  near(PM.analyze({ dags: [{ no: '১', khotianArea: '25.5' }], owners: [{ type: 'decimal', data: { decimal: 1 } }] })
    .owners[0].total, 25.5));
check('বিশ্লেষণে বেশি মালিক দিলে countMismatch',
  PM.analyze({ totalOwners: 1, dags: [{ no: '১', khotianArea: 10 }],
    owners: [{ type: 'decimal', data: { decimal: 0.5 } }, { type: 'decimal', data: { decimal: 0.5 } }] })
    .countMismatch === true);

console.log('\n' + '='.repeat(78));
console.log('  splitDirect ও splitExact আলাদা করে');
console.log('='.repeat(78));

let r = PM.splitDirect(100, [0.333, 0.333, 0.167], 4);
check('splitDirect স্বাভাবিক করে না', r.parts.join(',') === '33.3,33.3,16.7', r.parts.join(','));
check('অবশিষ্ট ১৬.৭', near(r.unallocated, 16.7), r.unallocated);
r = PM.splitExact(100, [1, 1, 1], 0);
check('splitExact পূর্ণসংখ্যায় ৩৪/৩৩/৩৩', r.parts.join(',') === '34,33,33', r.parts.join(','));
check('splitExact যোগ = ১০০', near(sum(r.parts), 100));
check('খালি ওজন', PM.splitExact(50, [], 4).parts.length === 0);
check('মোট ০', PM.splitDirect(0, [1], 4).parts[0] === 0);

console.log('\n' + '='.repeat(78));
console.log('  তফসিলের লাইন ও নমুনা');
console.log('='.repeat(78));

a = PM.analyze({ unit: 'শতক', decimals: 2, totalOwners: 1,
  dags: S.dags, owners: [{ name: 'ক', type: 'decimal', data: { decimal: 1 } }] });
const line = PM.tofasilLine(a.owners[0], a.dags, 'শতক', 2);
console.log('    ' + line);
check('তিন দাগ আছে', /৩৫৬/.test(line) && /৩৫৭/.test(line) && /৩৬২/.test(line));
check('শ্রেণী বন্ধনীতে আছে', /\(কৃষি জমি\)/.test(line));
check('শূন্য অংশ বাদ যায়',
  PM.tofasilLine({ perDag: [5, 0, 3] }, a.dags, 'শতক', 2).split(', ').length === 2);

check('নমুনায় ৩ মালিক ও ৩ দাগ', S.owners.length === 3 && S.dags.length === 3);
check('নমুনায় মোট মালিক ৪', S.totalOwners === 4);
check('নমুনায় জেলা-উপজেলা আছে', S.district === 'মুন্সীগঞ্জ' && S.upazila === 'শ্রীনগর');
check('নমুনায় রিপোর্টকারীর তথ্য', !!S.repName && !!S.repTitle && !!S.repMobile);

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
console.log('='.repeat(78) + '\n');
process.exit(fail ? 1 : 0);
