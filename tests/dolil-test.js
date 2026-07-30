/* দলিল রেজিস্ট্রেশন খরচ — ইঞ্জিন টেস্ট
   হার-সূত্র: নিবন্ধন অধিদপ্তর, ১৬ সেপ্টেম্বর ২০২৫ (সারণি ০১–০৫ সহ) */
const fs = require('fs'), path = require('path'), vm = require('vm');
// ফোল্ডার সরালেও যেন না ভাঙে — পথ ফাইলের অবস্থান থেকেই বের করা
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/dolil-fee.js'), 'utf8');
const sb = { console, module: { exports: {} } };
vm.createContext(sb);
const DF = vm.runInContext(src + '\n; DolilFee;', sb);

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra !== undefined ? '   → ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a, b, tol) => Math.abs(a - b) < (tol || 0.01);
const item = (r, name) => (r.items.find(i => i.name === name) || {}).amount;
const has = (r, name) => r.items.some(i => i.name === name);

/* সাধারণ ভিত্তি — ৫০ লক্ষ টাকা, ইউনিয়ন, ১০ শতক, ৫ পৃষ্ঠা */
const BASE = {
  deedType: 'saf_kabla', propertyValue: 5000000, landQty: 10, landUnit: 'satak',
  localTaxId: 'union', pages: 5, landAreaId: 'b2', landClassId: 'cho'
};

console.log('\n' + '='.repeat(78));
console.log('  সাফ কবলা — মূল খাতসমূহ');
console.log('='.repeat(78));

let r = DF.calculate(BASE);
check('স্ট্যাম্প শুল্ক ১.৫% = ৭৫,০০০', near(item(r, 'স্ট্যাম্প শুল্ক'), 75000), item(r, 'স্ট্যাম্প শুল্ক'));
check('হলফনামা ৩০০', near(item(r, 'হলফনামা স্ট্যাম্প'), 300));
check('এ-ফি ১% = ৫০,০০০', near(item(r, 'রেজিস্ট্রেশন ফি (এ-ফি)'), 50000), item(r, 'রেজিস্ট্রেশন ফি (এ-ফি)'));
check('এন-ফি ৫ × ২৪ = ১২০', near(item(r, 'এন-ফি'), 120), item(r, 'এন-ফি'));
check('ই-ফি ১০০', near(item(r, 'ই-ফি'), 100));
check('কোর্ট ফি ১০', near(item(r, 'কোর্ট ফি'), 10));
check('স্থানীয় কর ৩% = ১,৫০,০০০', near(item(r, 'স্থানীয় সরকার কর'), 150000), item(r, 'স্থানীয় সরকার কর'));

// b2 = উপজেলা (পৌরসভা ব্যতীত): ২% বা শতকপ্রতি ৫০০ — যেটি বেশি
// ২% = ১,০০,০০০ · ৫০০×১০ = ৫,০০০ → ১,০০,০০০
check('উৎসে কর ১২৫ (উপজেলা) = ২% = ১,০০,০০০',
  near(item(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'), 100000), item(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'));

console.log('\n' + '='.repeat(78));
console.log('  ভাষা · একক · পৃষ্ঠা');
console.log('='.repeat(78));

r = DF.calculate({ ...BASE, language: 'en' });
check('ইংরেজি দলিলে এন-ফি দ্বিগুণ = ২৪০', near(item(r, 'এন-ফি'), 240), item(r, 'এন-ফি'));
r = DF.calculate({ ...BASE, copies: 4, language: 'en' });
check('ইংরেজিতে এনএন-ফি ৪ × ৭২ = ২৮৮', near(item(r, 'এনএন-ফি (নকল)'), 288), item(r, 'এনএন-ফি (নকল)'));

check('১ কাঠা = ১.৬৫২৯ শতক', near(DF.toSatak(1, 'katha'), 720 / 435.6, 1e-6), DF.toSatak(1, 'katha'));
check('১০০০ অযুতাংশ = ১ শতক', near(DF.toSatak(1000, 'ajutangsha'), 1, 1e-9));
check('৪৩৫.৬ বর্গফুট = ১ শতক', near(DF.toSatak(435.6, 'sqft'), 1, 1e-9));
check('১ বর্গমিটার = ১০.৭৬৩৯/৪৩৫.৬ শতক', near(DF.toSatak(1, 'sqmeter'), 10.7639 / 435.6, 1e-9));

console.log('\n' + '='.repeat(78));
console.log('  উৎসে কর (ধারা ১২৫) — সারণি ০১ ও ০২');
console.log('='.repeat(78));

// গুলশান বাণিজ্যিক (ক-শ্রেণি): ৫% বা শতকপ্রতি ৯,০০,০০০
// ২ শতক → ১৮,০০,০০০ vs ৫% = ২,৫০,০০০ → শতকভিত্তিক
r = DF.calculate({ ...BASE, landQty: 2, landAreaId: 'a1', landClassId: 'ka' });
check('গুলশান ক-শ্রেণি ২ শতক → ১৮,০০,০০০',
  near(item(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'), 1800000), item(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'));

// গুলশান আবাসিক (খ-শ্রেণি): শতকপ্রতি ৩,৫০,০০০ × ২ = ৭,০০,০০০
r = DF.calculate({ ...BASE, landQty: 2, landAreaId: 'a1', landClassId: 'kha' });
check('গুলশান খ-শ্রেণি ২ শতক → ৭,০০,০০০',
  near(item(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'), 700000), item(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'));

// চট্টগ্রাম খুলশী (a5) — এখানে ৩%, ৫% নয়
r = DF.calculate({ ...BASE, propertyValue: 100000000, landQty: 1, landAreaId: 'a5', landClassId: 'ka' });
check('a5 এলাকায় শতাংশ ৩% (৫% নয়) = ৩০,০০,০০০',
  near(item(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'), 3000000), item(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'));

// পৌরসভা (b1): ২% বা শতকপ্রতি ১০,০০০
r = DF.calculate({ ...BASE, landQty: 100, landAreaId: 'b1' });
check('পৌরসভা ১০০ শতক → ১০,০০০×১০০ = ১০,০০,০০০ (২% এর চেয়ে বেশি)',
  near(item(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'), 1000000), item(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'));

// সব শ্রেণির হার আলাদা কি না
const cls = ['ka', 'kha', 'ga', 'gha', 'uo', 'cho'];
const vals = cls.map(c => item(DF.calculate({ ...BASE, landQty: 1, landAreaId: 'a3', landClassId: c }),
  'উৎসে কর — ভূমি (ধারা ১২৫)'));
check('a3 এলাকার ৬ শ্রেণি: ৪,০০,০০০ / ১,৭৫,০০০ / ৪,০০,০০০ / ১,৭৫,০০০ / ১,৭৫,০০০ / ২,৫০,০০০(৫%)',
  near(vals[0], 400000) && near(vals[1], 250000) && near(vals[5], 250000), vals.join(' · '));

console.log('\n' + '='.repeat(78));
console.log('  স্থাপনা — সারণি ০৩ (১২৫) ও সারণি ০৪ (১২৬)');
console.log('='.repeat(78));

// সারণি-৩: ক/খ শ্রেণির ভূমিতে — প্রতি বর্গমিটার ৮০০ বা ৮%
// ১০৭৬.৩৯ বর্গফুট = ১০০ বর্গমিটার → ৮০০×১০০ = ৮০,০০০ vs ৮% of ৫,০০,০০০ = ৪০,০০০
r = DF.calculate({ ...BASE, hasBuilding: true, buildingSqft: 1076.39, buildingValue: 500000, building125Id: 's1' });
check('সারণি-৩ ক/খ: ১০০ বর্গমিটার × ৮০০ = ৮০,০০০',
  near(item(r, 'উৎসে কর — স্থাপনা (ধারা ১২৫)'), 80000, 1), item(r, 'উৎসে কর — স্থাপনা (ধারা ১২৫)'));

r = DF.calculate({ ...BASE, hasBuilding: true, buildingSqft: 1076.39, buildingValue: 5000000, building125Id: 's3' });
check('সারণি-৩ অন্যান্য: ৬% of ৫০ লক্ষ = ৩,০০,০০০ (৩০,০০০ এর চেয়ে বেশি)',
  near(item(r, 'উৎসে কর — স্থাপনা (ধারা ১২৫)'), 300000, 1), item(r, 'উৎসে কর — স্থাপনা (ধারা ১২৫)'));

// সারণি-৪ (ধারা ১২৬) — ডেভেলপার
r = DF.calculate({ ...BASE, sellerIsDeveloper: true, district: 'ঢাকা',
  hasBuilding: true, buildingSqft: 1076.39, buildingKind: 'com', building126Id: 'd1' });
check('সারণি-৪ গুলশান বাণিজ্যিক: ১০০ × ৬,৫০০ = ৬,৫০,০০০',
  near(item(r, 'উৎসে আয়কর — ভবন (ধারা ১২৬)'), 650000, 5), item(r, 'উৎসে আয়কর — ভবন (ধারা ১২৬)'));

r = DF.calculate({ ...BASE, sellerIsDeveloper: true, district: 'ঢাকা',
  hasBuilding: true, buildingSqft: 1076.39, buildingKind: 'res', building126Id: 'd6' });
check('সারণি-৪ অন্যান্য আবাসিক: ১০০ × ৩০০ = ৩০,০০০',
  near(item(r, 'উৎসে আয়কর — ভবন (ধারা ১২৬)'), 30000, 5), item(r, 'উৎসে আয়কর — ভবন (ধারা ১২৬)'));

// সারণি-৫ — প্লট, জেলাভেদে ৫% / ৩%
r = DF.calculate({ ...BASE, sellerIsDeveloper: true, district: 'ঢাকা' });
check('সারণি-৫ ঢাকা জেলা → ৫% = ২,৫০,০০০',
  near(item(r, 'উৎসে আয়কর — প্লট (ধারা ১২৬)'), 250000), item(r, 'উৎসে আয়কর — প্লট (ধারা ১২৬)'));
r = DF.calculate({ ...BASE, sellerIsDeveloper: true, district: 'রাজশাহী' });
check('সারণি-৫ রাজশাহী → ৩% = ১,৫০,০০০',
  near(item(r, 'উৎসে আয়কর — প্লট (ধারা ১২৬)'), 150000), item(r, 'উৎসে আয়কর — প্লট (ধারা ১২৬)'));
r = DF.calculate(BASE);
check('ডেভেলপার না হলে ধারা ১২৬ প্রযোজ্য নয়', !has(r, 'উৎসে আয়কর — প্লট (ধারা ১২৬)'));

console.log('\n' + '='.repeat(78));
console.log('  দলিলের ধরনভেদে হার');
console.log('='.repeat(78));

r = DF.calculate({ ...BASE, deedType: 'ewaj' });
check('এওয়াজ স্ট্যাম্প ১% = ৫০,০০০', near(item(r, 'স্ট্যাম্প শুল্ক'), 50000), item(r, 'স্ট্যাম্প শুল্ক'));
check('এওয়াজে উৎসে কর নেই', !has(r, 'উৎসে কর — ভূমি (ধারা ১২৫)'));
check('এওয়াজে স্থানীয় কর আছে', has(r, 'স্থানীয় সরকার কর'));

r = DF.calculate({ ...BASE, deedType: 'ewaj', propertyValue: 5000000000 });
check('এওয়াজ স্ট্যাম্প সর্বোচ্চ ১ কোটি', near(item(r, 'স্ট্যাম্প শুল্ক'), 10000000), item(r, 'স্ট্যাম্প শুল্ক'));

r = DF.calculate({ ...BASE, deedType: 'heba_ghoshona' });
check('হেবার ঘোষণাপত্র স্ট্যাম্প ১,০০০', near(item(r, 'স্ট্যাম্প শুল্ক'), 1000));
check('হেবার ঘোষণাপত্র এ-ফি ১০০', near(item(r, 'রেজিস্ট্রেশন ফি (এ-ফি)'), 100));

r = DF.calculate({ ...BASE, deedType: 'will' });
check('উইলে স্ট্যাম্প প্রযোজ্য নয় (০)', near(item(r, 'স্ট্যাম্প শুল্ক'), 0), item(r, 'স্ট্যাম্প শুল্ক'));
check('উইলে সি-ফিস ২০০', near(item(r, 'রেজিস্ট্রেশন ফি (এ-ফি)'), 200));

// বন্টননামা ও বায়নার স্ল্যাব
[[200000, 500], [900000, 700], [2500000, 1200], [4500000, 1800], [9000000, 2000]].forEach(([v, e]) => {
  const rr = DF.calculate({ ...BASE, deedType: 'bontonnama', propertyValue: v });
  check(`বন্টননামা ${DF.moneyBn(v)} → এ-ফি ${DF.moneyBn(e)}`,
    near(item(rr, 'রেজিস্ট্রেশন ফি (এ-ফি)'), e), item(rr, 'রেজিস্ট্রেশন ফি (এ-ফি)'));
});
[[400000, 500], [3000000, 1000], [9000000, 2000]].forEach(([v, e]) => {
  const rr = DF.calculate({ ...BASE, deedType: 'baynanama', propertyValue: v });
  check(`বায়নাপত্র ${DF.moneyBn(v)} → এ-ফি ${DF.moneyBn(e)}`,
    near(item(rr, 'রেজিস্ট্রেশন ফি (এ-ফি)'), e), item(rr, 'রেজিস্ট্রেশন ফি (এ-ফি)'));
});

// বন্ধকী — ঋণের উপর হিসাব
r = DF.calculate({ ...BASE, deedType: 'mortgage', loanAmount: 3000000, propertyValue: 5000000 });
check('বন্ধকীতে ঋণের উপর হিসাব হয় (৩০ লক্ষ → স্ট্যাম্প ২,০০০)',
  near(item(r, 'স্ট্যাম্প শুল্ক'), 2000), item(r, 'স্ট্যাম্প শুল্ক'));
check('বন্ধকী এ-ফি ০.২৫% সর্বোচ্চ ২,০০০', near(item(r, 'রেজিস্ট্রেশন ফি (এ-ফি)'), 2000), item(r, 'রেজিস্ট্রেশন ফি (এ-ফি)'));
r = DF.calculate({ ...BASE, deedType: 'mortgage', loanAmount: 300000 });
check('বন্ধকী ৩ লক্ষ ঋণে এ-ফি ১% সর্বোচ্চ ৫০০', near(item(r, 'রেজিস্ট্রেশন ফি (এ-ফি)'), 500), item(r, 'রেজিস্ট্রেশন ফি (এ-ফি)'));

// পাওয়ার অব অ্যাটর্নি — পণমূল্যের উপর
r = DF.calculate({ ...BASE, deedType: 'poa_irrevocable_paid', considerationValue: 2000000 });
check('পণমূল্যের POA — পণমূল্যের ১.৫% = ৩০,০০০', near(item(r, 'স্ট্যাম্প শুল্ক'), 30000), item(r, 'স্ট্যাম্প শুল্ক'));

// ইজারা
r = DF.calculate({ ...BASE, deedType: 'lease', leaseTermId: 'upto5' });
check('ইজারা ৫ বছর → ০.১% = ৫,০০০', near(item(r, 'স্ট্যাম্প শুল্ক'), 5000), item(r, 'স্ট্যাম্প শুল্ক'));
r = DF.calculate({ ...BASE, deedType: 'lease', leaseTermId: 'other', propertyValue: 100000000000 });
check('ইজারা অন্যান্য → সর্বোচ্চ ৩ কোটি', near(item(r, 'স্ট্যাম্প শুল্ক'), 30000000), item(r, 'স্ট্যাম্প শুল্ক'));
r = DF.calculate({ ...BASE, deedType: 'lease', leaseTermId: 'upto5', leaseYearsAbove10: true });
check('১০ বছরের বেশি ইজারায় ৪% কর = ২,০০,০০০',
  near(item(r, 'ইজারা কর (১০ বছরের বেশি)'), 200000), item(r, 'ইজারা কর (১০ বছরের বেশি)'));

// নকল
r = DF.calculate({ ...BASE, deedType: 'nokol', originalStampUpto1000: true });
check('নকল — মূল স্ট্যাম্প ≤১০০০ → ১০০', near(item(r, 'স্ট্যাম্প শুল্ক'), 100));
check('নকলে কোর্ট ফি ২০', near(item(r, 'কোর্ট ফি'), 20));
check('নকলে হলফনামা নেই', !has(r, 'হলফনামা স্ট্যাম্প'));
r = DF.calculate({ ...BASE, deedType: 'nokol', originalStampUpto1000: false });
check('নকল — অন্যান্য → ২০০', near(item(r, 'স্ট্যাম্প শুল্ক'), 200));

console.log('\n' + '='.repeat(78));
console.log('  VAT · প্রান্তিক · ফরম্যাট');
console.log('='.repeat(78));

r = DF.calculate(BASE);
check('সাধারণ ক্রেতায় VAT নেই', !has(r, 'মূল্য সংযোজন কর (VAT)'));
r = DF.calculate({ ...BASE, sellerIsDeveloper: true, district: 'ঢাকা', vatKind: 'plot' });
check('ডেভেলপার প্লট VAT ২% = ১,০০,০০০', near(item(r, 'মূল্য সংযোজন কর (VAT)'), 100000), item(r, 'মূল্য সংযোজন কর (VAT)'));
r = DF.calculate({ ...BASE, sellerIsDeveloper: true, district: 'ঢাকা', vatKind: 'flat_above', buildingValue: 8000000 });
check('ডেভেলপার ১৬০০+ ফ্ল্যাট VAT ৪.৫% of স্থাপনা মূল্য = ৩,৬০,০০০',
  near(item(r, 'মূল্য সংযোজন কর (VAT)'), 360000), item(r, 'মূল্য সংযোজন কর (VAT)'));

r = DF.calculate({});
check('খালি ইনপুটে ক্র্যাশ করে না', r.total > 0, r.total);
r = DF.calculate({ ...BASE, propertyValue: -500, landQty: -2, pages: 0 });
check('ঋণাত্মক মান ০ ধরা হয়', near(item(r, 'স্ট্যাম্প শুল্ক'), 0));
check('পৃষ্ঠা কমপক্ষে ১', near(item(r, 'এন-ফি'), 24), item(r, 'এন-ফি'));

check('১২৩৪৫৬৭ → ১২,৩৪,৫৬৭', DF.moneyBn(1234567) === '১২,৩৪,৫৬৭', DF.moneyBn(1234567));
check('১০০০০০০০০ → ১০,০০,০০,০০০', DF.moneyBn(100000000) === '১০,০০,০০,০০০', DF.moneyBn(100000000));

check('দলিলের ধরন ২৮টি', DF.DEED_TYPES.length >= 27, DF.DEED_TYPES.length);
check('জেলা তালিকা ৬১টি', DF.DISTRICTS.length === 61, DF.DISTRICTS.length);
check('এলাকা তালিকা ৯টি (সারণি ১+২)', DF.LAND_AREAS.length === 9, DF.LAND_AREAS.length);
check('শ্রেণি ৬টি (ক–চ)', DF.LAND_CLASSES.length === 6);
check('একক ৫টি', DF.LAND_UNITS.length === 5);

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল:  ✓ পাস ${pass}   ✗ ফেল ${fail}   (মোট ${pass + fail})`);
console.log('='.repeat(78) + '\n');
