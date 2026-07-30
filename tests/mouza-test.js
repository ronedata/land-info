/* মৌজা মূল্য তালিকা — উৎস নির্বাচন ও রেসপন্স পার্সিং টেস্ট
   নেটওয়ার্ক ছাড়াই চলে — API রেসপন্সের নমুনা হাতে বসানো (২৯ জুলাই ২০২৬ এ যাচাই করা) */
const fs = require('fs'), path = require('path'), vm = require('vm');
// ফোল্ডার সরালেও যেন না ভাঙে — পথ ফাইলের অবস্থান থেকেই বের করা
const ROOT = path.resolve(__dirname, '..');

// দুটো ফাইল একসাথেই চালাতে হবে — top-level const লেক্সিক্যাল, window এ বসে না
const srcSources = fs.readFileSync(path.join(ROOT, 'js/mouza-sources.js'), 'utf8');
const srcValue = fs.readFileSync(path.join(ROOT, 'js/mouza-value.js'), 'utf8');
const sb = { console, module: { exports: {} }, fetch: undefined };
vm.createContext(sb);
const { MS, MV } = vm.runInContext(
  srcSources + '\n' + srcValue + '\n; ({ MS: MouzaSources, MV: MouzaValue });', sb
);

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra !== undefined ? '   → ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const PALLABI = '63819a100c2ba5e6beec9a80';
const S3_URL = 'https://landvalue.s3.ap-south-1.amazonaws.com/jomirMullo/637dde18ab075dfd7335b900/'
  + '637de32321b23bbe26633a89/63819a100c2ba5e6beec9a80/'
  + '%E0%A6%AA%E0%A6%B2%E0%A7%8D%E0%A6%B2%E0%A6%AC%E0%A7%80-1675139750988.pdf';

console.log('\n' + '='.repeat(78));
console.log('  Google Drive লিংক/আইডি সনাক্তকরণ');
console.log('='.repeat(78));

let n = MS.normalize('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
check('খালি Drive আইডি → preview লিংক',
  n.view === 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview', n && n.view);
check('খালি Drive আইডি → kind = drive', n.kind === 'drive');
check('আইডির open লিংক /view এ যায়', /\/view$/.test(n.open));

n = MS.normalize('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/view?usp=sharing');
check('শেয়ার লিংক থেকে আইডি বের হয়',
  n.view === 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/preview', n.view);

n = MS.normalize('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrS');
check('open?id= ধরনের লিংকও চলে',
  n.view === 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/preview', n.view);

n = MS.normalize('https://cdn.example.com/mouza/2025/dhaka.pdf');
check('সাধারণ লিংক অবিকৃত থাকে', n.view === 'https://cdn.example.com/mouza/2025/dhaka.pdf');
check('সাধারণ লিংক → kind = direct', n.kind === 'direct');

check('খালি মান → null', MS.normalize('') === null);
check('null → null', MS.normalize(null) === null);
check('শুধু স্পেস → null', MS.normalize('   ') === null);

console.log('\n' + '='.repeat(78));
console.log('  নিজস্ব উৎস খোঁজা (OFFICES / PATTERN)');
console.log('='.repeat(78));

check('কনফিগ খালি থাকলে কিছু পাওয়া যায় না', MS.lookup(PALLABI, '2025') === null);

MS.OFFICES[PALLABI] = { '2025': '1PallabiDriveIdXXXXXXXXX' };
n = MS.lookup(PALLABI, '2025');
check('OFFICES এ থাকলে পাওয়া যায়',
  n && n.view === 'https://drive.google.com/file/d/1PallabiDriveIdXXXXXXXXX/preview', n && n.view);
check('অন্য বছরের জন্য পাওয়া যায় না', MS.lookup(PALLABI, '2024') === null);
check('অন্য অফিসের জন্য পাওয়া যায় না', MS.lookup('637de32321b23bbe26633a89', '2025') === null);
check('বছর সংখ্যা হিসেবে দিলেও চলে', MS.lookup(PALLABI, 2025) !== null);

MS.PATTERN['2024'] = 'https://cdn.example.com/mouza/{year}/{officeId}.pdf';
n = MS.lookup(PALLABI, '2024');
check('PATTERN থেকে লিংক বানায়',
  n && n.view === `https://cdn.example.com/mouza/2024/${PALLABI}.pdf`, n && n.view);
check('OFFICES এর অগ্রাধিকার PATTERN এর উপরে',
  MS.lookup(PALLABI, '2025').kind === 'drive');

check('officeId ছাড়া null', MS.lookup('', '2025') === null);
check('year ছাড়া null', MS.lookup(PALLABI, '') === null);

console.log('\n' + '='.repeat(78));
console.log('  উৎস নির্বাচন — নিজস্ব বনাম বাইরের');
console.log('='.repeat(78));

let r = MV.resolve(PALLABI, '2025', S3_URL);
check('নিজস্ব থাকলে API লিংক উপেক্ষিত', r.source === 'own', r.source);
check('নিজস্ব হলে Drive preview দেখায়', /drive\.google\.com/.test(r.view));

r = MV.resolve(PALLABI, '2026', S3_URL);
check('নিজস্ব না থাকলে API লিংক', r.source === 'external' && r.view === S3_URL, r.source);

check('দুটোর কোনোটাই না থাকলে null', MV.resolve(PALLABI, '2026', null) === null);

// পরের টেস্টগুলোর জন্য কনফিগ আবার খালি করি
delete MS.OFFICES[PALLABI];
delete MS.PATTERN['2024'];
check('কনফিগ পরিষ্কারের পর আবার বাইরের উৎস',
  MV.resolve(PALLABI, '2025', S3_URL).source === 'external');

console.log('\n' + '='.repeat(78));
console.log('  API তালিকা-রেসপন্স পার্সিং');
console.log('='.repeat(78));

const divJson = {
  success: true, message: 'Successfully Division Retrived',
  data: [
    { _id: '637dde18ab075dfd7335b900', name: 'ঢাকা', diviId: '3' },
    { _id: '637dde01ab075dfd7335b8fc', name: 'বরিশাল', diviId: '1' },
    { _id: '637dde0cab075dfd7335b8fe', name: 'চট্টগ্রাম', diviId: '2' }
  ]
};
let list = MV.parseList(divJson);
check('৩টি বিভাগ পার্স হয়', list.length === 3, list.length);
check('Mongo _id ব্যবহার হয় (diviId নয়)', list[0].id.length === 24, list[0].id);
check('বাংলা বর্ণক্রমে সাজানো — চট্টগ্রাম প্রথম',
  list.map(d => d.name).join(',') === 'চট্টগ্রাম,ঢাকা,বরিশাল', list.map(d => d.name).join(','));

check('success:false → খালি তালিকা',
  MV.parseList({ success: false, message: 'Some thing wrong' }).length === 0);
check('data নেই → খালি তালিকা', MV.parseList({ success: true }).length === 0);
check('null → খালি তালিকা', MV.parseList(null).length === 0);
check('নাম খালি হলে বাদ পড়ে',
  MV.parseList({ success: true, data: [{ _id: 'x', name: '' }, { _id: 'y', name: 'ক' }] }).length === 1);

console.log('\n' + '='.repeat(78));
console.log('  search রেসপন্স পার্সিং');
console.log('='.repeat(78));

const searchJson = {
  success: true, message: 'jomirMullo Successfully Retrieved',
  data: [{
    _id: '6776b14eb1ab332e85af677a',
    officeId: { _id: PALLABI, name: 'সাব-রেজিস্ট্রারের কার্যালয়, পল্লবী' },
    year: '2025',
    createdAt: '2025-01-02T15:31:26.310Z',
    districtName: 'ঢাকা', divisionName: 'ঢাকা',
    jomirMulloFileUrl: S3_URL
  }]
};
let m = MV.parseSearch(searchJson);
check('PDF লিংক পাওয়া যায়', m.url === S3_URL);
check('অফিসের নাম nested officeId থেকে আসে',
  m.officeName === 'সাব-রেজিস্ট্রারের কার্যালয়, পল্লবী', m.officeName);
check('বছর স্ট্রিং হিসেবে', m.year === '2025');
check('জেলা ও বিভাগ আসে', m.districtName === 'ঢাকা' && m.divisionName === 'ঢাকা');

// ২০২৪ এর রেসপন্সে officeId অবজেক্ট না-ও থাকতে পারে — officeName সরাসরি
m = MV.parseSearch({
  success: true,
  data: [{ officeName: 'সরাসরি নাম', year: '2024', jomirMulloFileUrl: S3_URL }]
});
check('officeId অবজেক্ট না থাকলেও নাম পাওয়া যায়', m.officeName === 'সরাসরি নাম', m.officeName);

// data অ্যারে না হয়ে সরাসরি অবজেক্ট হলেও চলা উচিত
m = MV.parseSearch({ success: true, data: { year: '2025', jomirMulloFileUrl: S3_URL } });
check('data অবজেক্ট হলেও পার্স হয়', m && m.url === S3_URL);

check('"Search result not found" → null',
  MV.parseSearch({ success: false, message: 'Search result not found' }) === null);
check('খালি data → null', MV.parseSearch({ success: true, data: [] }) === null);
check('লিংক খালি → null',
  MV.parseSearch({ success: true, data: [{ jomirMulloFileUrl: '' }] }) === null);
check('null → null', MV.parseSearch(null) === null);

console.log('\n' + '='.repeat(78));
console.log('  ফাইলের নাম');
console.log('='.repeat(78));

check('URL থেকে বাংলা ফাইলনাম ডিকোড হয়',
  MV.fileNameFrom(S3_URL, 'x') === 'পল্লবী-1675139750988.pdf', MV.fileNameFrom(S3_URL, 'x'));
check('query string বাদ যায়',
  MV.fileNameFrom('https://a.com/b/c.pdf?token=1', 'x') === 'c.pdf');
check('pdf না হলে fallback',
  MV.fileNameFrom('https://drive.google.com/file/d/abc/preview', 'পল্লবী-2025') === 'পল্লবী-2025.pdf');
check('খারাপ URL এ ক্র্যাশ করে না',
  MV.fileNameFrom('%%%নষ্ট%%', 'ভালো') === 'ভালো.pdf');

console.log('\n' + '='.repeat(78));
console.log('  কনফিগ স্নিপেট ও বছরের তালিকা');
console.log('='.repeat(78));

const snip = MS.snippetFor(PALLABI, 'পল্লবী', '2025');
check('স্নিপেটে officeId থাকে', snip.includes(PALLABI));
check('স্নিপেটে অফিসের নাম মন্তব্যে থাকে', snip.includes('// পল্লবী'));
check('স্নিপেটে বছর থাকে', snip.includes('"2025"'));

check('বছরের তালিকায় ২০২৫ ও ২০২৪', MV.YEARS.join(',') === '2025,2024', MV.YEARS.join(','));
check('নতুন বছর আগে থাকে', MV.YEARS[0] === '2025');
check('API ঠিকানা ঠিক আছে',
  MV.API_BASE === 'https://ji4139zbah.execute-api.ap-south-1.amazonaws.com/api/v1/');

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
console.log('='.repeat(78) + '\n');
process.exit(fail ? 1 : 0);
