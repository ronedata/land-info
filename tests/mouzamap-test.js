/* মৌজা ম্যাপ আর্কাইভ — ইনডেক্স ও হেল্পার টেস্ট
   আসল tree.json ও একটি শার্ড পড়ে যাচাই করা হয় (নেটওয়ার্ক ছাড়া) */
const fs = require('fs'), path = require('path'), vm = require('vm');
// ফোল্ডার সরালেও যেন না ভাঙে — পথ ফাইলের অবস্থান থেকেই বের করা
const ROOT = path.resolve(__dirname, '..');

const src = fs.readFileSync(path.join(ROOT, 'js/calculators.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(ROOT, 'js/mouza-map.js'), 'utf8');
const sb = { console, module: { exports: {} }, fetch: undefined };
vm.createContext(sb);
const MM = vm.runInContext(src + '\n; MouzaMap;', sb);

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra !== undefined ? '   → ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const DATA = path.join(ROOT, 'data/mouza-map');
const tree = JSON.parse(fs.readFileSync(path.join(DATA, 'tree.json'), 'utf8'));

console.log('\n' + '='.repeat(78));
console.log('  আসল ইনডেক্স — গঠন ও পরিমাণ');
console.log('='.repeat(78));

const s = MM.summary(tree);
console.log(`    বিভাগ ${s.divisions} · জেলা ${s.districts} · উপজেলা ${s.upazilas}`
          + ` · জরিপ ${s.surveys} · ফাইল ${s.files.toLocaleString('en-US')}`);

check('৮ বিভাগ', s.divisions === 8, s.divisions);
check('৬০ জেলা', s.districts === 60, s.districts);
check('৪৫৪ উপজেলা', s.upazilas === 454, s.upazilas);
check('১,০১২ জরিপ ফোল্ডার', s.surveys === 1012, s.surveys);
check('★ ১,৯৪,৩১৭ ফাইল (পুরনো ইনডেক্সে ১,৩২,৮৯১ ছিল)', s.files === 194317, s.files);
check('পুরনো সংখ্যার চেয়ে বেশি', s.files > 132891, '+' + (s.files - 132891));

const names = tree.divisions.map(d => d.name);
check('সব বিভাগ আছে', names.length === 8 && names.every(n => n.endsWith('বিভাগ')), names.join(', '));
check('বর্ণক্রমে সাজানো', JSON.stringify(names) === JSON.stringify([...names].sort()));
check('root ও bangladesh আইডি আছে', !!tree.root && !!tree.bangladesh);

// প্রতিটি জরিপ ফোল্ডারের শার্ড ফাইল সত্যিই আছে কি
let missing = 0, shardFiles = 0, mismatch = [];
for (const dv of tree.divisions)
  for (const dt of dv.districts)
    for (const up of dt.upazilas)
      for (const sv of up.surveys) {
        const p = path.join(DATA, 'files', sv.id + '.json');
        if (!fs.existsSync(p)) { missing++; continue; }
        const list = JSON.parse(fs.readFileSync(p, 'utf8'));
        shardFiles += list.length;
        if (list.length !== sv.count) mismatch.push(`${sv.name}:${list.length}≠${sv.count}`);
      }
check('প্রতিটি জরিপের শার্ড ফাইল আছে', missing === 0, missing + ' টি নেই');
check('★ শার্ডের ফাইলসংখ্যা tree এর count এর সাথে মেলে',
  mismatch.length === 0, mismatch.slice(0, 3).join(', ') || 'সব মেলে');
check('শার্ডের মোট = summary এর মোট', shardFiles === s.files, shardFiles);

console.log('\n' + '='.repeat(78));
console.log('  ফাইল এন্ট্রির গুণমান');
console.log('='.repeat(78));

// সব শার্ড ঘেঁটে দেখি
let noId = 0, noName = 0, noMime = 0, noSize = 0, tooBig = 0, mimes = {}, maxFile = null;
for (const f of fs.readdirSync(path.join(DATA, 'files'))) {
  for (const x of JSON.parse(fs.readFileSync(path.join(DATA, 'files', f), 'utf8'))) {
    if (!x.id) noId++;
    if (!x.name) noName++;
    if (!x.mimeType) noMime++;
    if (!x.size) noSize++;
    if (x.tooBig) tooBig++;
    mimes[x.mimeType] = (mimes[x.mimeType] || 0) + 1;
    if (!maxFile || (x.size || 0) > (maxFile.size || 0)) maxFile = x;
  }
}
check('সব ফাইলে id আছে', noId === 0, noId);
check('সব ফাইলে name আছে', noName === 0, noName);
check('সব ফাইলে mimeType আছে', noMime === 0, noMime);
check('২১৭টি tooBig চিহ্নিত', tooBig === 217, tooBig);
console.log('    সবচেয়ে বড়:', maxFile.name.slice(0, 40),
  '→', MM.formatSize(maxFile.size), '| tooBig:', maxFile.tooBig === true);
check('সবচেয়ে বড় ফাইলটি tooBig', maxFile.tooBig === true);
check('PDF সবচেয়ে বেশি', mimes['application/pdf'] > mimes['image/jpeg'],
  `PDF ${mimes['application/pdf'].toLocaleString('en-US')} · JPEG ${mimes['image/jpeg'].toLocaleString('en-US')}`);

console.log('\n' + '='.repeat(78));
console.log('  canProxy — কোন ফাইল প্রক্সিতে আনা যাবে');
console.log('='.repeat(78));

check('ছোট ফাইল → যাবে', MM.canProxy({ size: 5 * 1048576 }) === true);
check('৩৫ MB ঠিক সীমায় → যাবে', MM.canProxy({ size: 35 * 1024 * 1024 }) === true);
check('৩৬ MB → যাবে না', MM.canProxy({ size: 36 * 1048576 }) === false);
check('tooBug চিহ্ন থাকলে যাবে না', MM.canProxy({ size: 100, tooBig: true }) === false);
check('null → যাবে না', MM.canProxy(null) === false);
check('আকার নেই → যাবে (০ ধরে)', MM.canProxy({}) === true);

console.log('\n' + '='.repeat(78));
console.log('  আকার ও ধরন দেখানো');
console.log('='.repeat(78));

check('৬.০ MB (৫.৯৭ রাউন্ড হয়)', MM.formatSize(6260000) === '৬.০ MB', MM.formatSize(6260000));
check('৭১৯.৮ MB', MM.formatSize(754800000) === '৭১৯.৮ MB', MM.formatSize(754800000));
check('১.৪ GB', MM.formatSize(1503238553) === '১.৪০ GB', MM.formatSize(1503238553));
check('KB', MM.formatSize(2048) === '২ KB', MM.formatSize(2048));
check('বাইট', MM.formatSize(500) === '৫০০ বাইট', MM.formatSize(500));
check('শূন্য', MM.formatSize(0) === '০ বাইট');
check('অবৈধ → ০', MM.formatSize('abc') === '০ বাইট');

check('PDF আইকন', MM.fileKind('application/pdf').label === 'PDF');
check('TIFF আলাদা করে চেনায়', MM.fileKind('image/tiff').label === 'TIFF');
check('JPEG → ছবি', MM.fileKind('image/jpeg').label === 'ছবি');
check('অজানা → অন্যান্য', MM.fileKind('application/zip').label === 'অন্যান্য');
check('খালি → অন্যান্য', MM.fileKind(null).label === 'অন্যান্য');

console.log('\n  ব্রাউজারে ক্যানভাসে বসানো যাবে?');
check('JPEG যাবে', MM.canRenderInBrowser('image/jpeg') === true);
check('PNG যাবে', MM.canRenderInBrowser('image/png') === true);
check('★ TIFF যাবে না (ব্রাউজার ডিকোড করে না)', MM.canRenderInBrowser('image/tiff') === false);
check('PDF যাবে না (pdf.js লাগবে)', MM.canRenderInBrowser('application/pdf') === false);

console.log('\n' + '='.repeat(78));
console.log('  জায়গা খোঁজা');
console.log('='.repeat(78));

let r = MM.searchPlaces(tree, 'কুমারখালী');
check('উপজেলার নামে পাওয়া যায়', r.length >= 1, r.length + ' ফল');
if (r.length) {
  console.log('    →', r[0].division.name, '/', r[0].district.name, '/', r[0].upazila.name,
    '· জরিপ', r[0].surveys.length, '· ফাইল', r[0].total);
  check('জরিপ ও মোট ফাইল সাথে আসে', r[0].surveys.length > 0 && r[0].total > 0);
}
check('জেলার নামে পাওয়া যায়', MM.searchPlaces(tree, 'কুষ্টিয়া').length > 1,
  MM.searchPlaces(tree, 'কুষ্টিয়া').length);
check('বিভাগের নামে অনেক ফল', MM.searchPlaces(tree, 'সিলেট').length > 5,
  MM.searchPlaces(tree, 'সিলেট').length);
check('এক অক্ষরে খোঁজে না', MM.searchPlaces(tree, 'ক').length === 0);
check('খালি প্রশ্নে খালি ফল', MM.searchPlaces(tree, '').length === 0);
check('নেই এমন নামে খালি', MM.searchPlaces(tree, 'জাপানশহর').length === 0);
check('limit মানে', MM.searchPlaces(tree, 'া', 5).length <= 5);
check('tree না দিলে ক্র্যাশ করে না', MM.searchPlaces(null, 'কুষ্টিয়া').length === 0);

console.log('\n' + '='.repeat(78));
console.log('  ফাইল ছাঁকা');
console.log('='.repeat(78));

const shardId = tree.divisions[0].districts[0].upazilas[0].surveys[0].id;
const list = JSON.parse(fs.readFileSync(path.join(DATA, 'files', shardId + '.json'), 'utf8'));
console.log(`    নমুনা শার্ড: ${list.length} ফাইল · প্রথমটি "${list[0].name.slice(0, 40)}"`);
check('খালি প্রশ্নে সব ফেরে', MM.filterFiles(list, '').length === list.length);
const q = list[0].name.slice(0, 6);
check('নামের অংশ দিয়ে ছাঁকে', MM.filterFiles(list, q).length >= 1, `"${q}" → ${MM.filterFiles(list, q).length}`);
check('নেই এমন লেখায় শূন্য', MM.filterFiles(list, 'zzqqxx').length === 0);
check('null তালিকায় ক্র্যাশ নয়', MM.filterFiles(null, 'ক').length === 0);
check('subPath দিয়েও ছাঁকে',
  MM.filterFiles([{ name: 'a.pdf', subPath: 'ভেতরের ফোল্ডার' }], 'ভেতরের').length === 1);

console.log('\n' + '='.repeat(78));
console.log('  লিংক তৈরি');
console.log('='.repeat(78));

check('প্রক্সি URL এ action=download', /action=download/.test(MM.proxyUrl('ABC123')));
check('প্রক্সি URL এ fileId', /fileId=ABC123/.test(MM.proxyUrl('ABC123')));
check('আইডি এনকোড হয়', /fileId=a%2Fb/.test(MM.proxyUrl('a/b')), MM.proxyUrl('a/b').slice(-20));
// ★ Drive এর লিংক কোথাও থাকতে পারবে না (ইউজারের নির্দেশ)
check('★ driveUrl ফাংশন সরানো হয়েছে', typeof MM.driveUrl === 'undefined');
check('★ মডিউলে drive.google লেখা নেই',
  !fs.readFileSync(path.join(ROOT, 'js/mouza-map.js'), 'utf8').includes('drive.google'));
check('BASE আপেক্ষিক (যেখানেই হোস্ট হোক চলবে)',
  !/^https?:/.test(MM.BASE), MM.BASE);
check('প্রক্সি ঠিকানা Apps Script', /script\.google\.com\/macros/.test(MM.PROXY));

console.log('\n' + '='.repeat(78));
console.log('  ★ Drive লিংক কোথাও ফাঁস হয়নি');
console.log('='.repeat(78));

// ইনডেক্সের কোনো শার্ডে url ফিল্ড বা drive.google লেখা থাকতে পারবে না
let urlLeak = 0, textLeak = 0;
for (const f of fs.readdirSync(path.join(DATA, 'files'))) {
  const raw = fs.readFileSync(path.join(DATA, 'files', f), 'utf8');
  if (raw.includes('drive.google')) textLeak++;
  for (const x of JSON.parse(raw)) if (x.url) urlLeak++;
}
check('★ কোনো এন্ট্রিতে url ফিল্ড নেই', urlLeak === 0, urlLeak);
check('★ কোনো শার্ডে drive.google লেখা নেই', textLeak === 0, textLeak + ' ফাইলে');

// app.js এর মৌজা ম্যাপ অংশে Drive লিংক তৈরি হচ্ছে না
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const mmBlock = appSrc.slice(appSrc.indexOf('initMouzaMap()'), appSrc.indexOf('resetMouzaMap()'));
check('★ app.js এর টুল-অংশে drive.google নেই', !mmBlock.includes('drive.google'));
check('★ app.js এর টুল-অংশে driveUrl ডাকা হয় না', !mmBlock.includes('driveUrl'));

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
console.log('='.repeat(78) + '\n');
process.exit(fail ? 1 : 0);
