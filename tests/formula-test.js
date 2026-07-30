/* জমির সকল সূত্র — গঠন ও কাঠা-নির্ভরতা টেস্ট
   মূল যাচাই: কাঠা/বিঘার মান যেন কোথাও হার্ডকোড না থাকে */
const fs = require('fs'), path = require('path'), vm = require('vm');
// ফোল্ডার সরালেও যেন না ভাঙে — পথ ফাইলের অবস্থান থেকেই বের করা
const ROOT = path.resolve(__dirname, '..');

// একসাথে চালাতে হবে — toBn ও LandMath দুটোই calculators.js এর top-level const
const src = fs.readFileSync(path.join(ROOT, 'js/calculators.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(ROOT, 'js/land-formula.js'), 'utf8');
const sb = { console, module: { exports: {} } };
vm.createContext(sb);
const { LM, LF } = vm.runInContext(src + '\n; ({ LM: LandMath, LF: LandFormula });', sb);

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra !== undefined ? '   → ' + extra : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n' + '='.repeat(78));
console.log('  সূত্রের তালিকা ও গঠন');
console.log('='.repeat(78));

check('৯টি আকৃতির সূত্র আছে', LF.SHAPES.length === 9, LF.SHAPES.length);
check('হিরণের সূত্র সবার আগে', LF.SHAPES[0].id === 'heron', LF.SHAPES[0].id);
check('হিরণে "সর্বাধিক ব্যবহৃত" ব্যাজ', LF.SHAPES[0].badge === 'সর্বাধিক ব্যবহৃত');
check('হিরণে দুই ধাপ আছে', LF.SHAPES[0].steps.length === 2);

const ids = LF.SHAPES.map(s => s.id);
['heron', 'right', 'trapezium', 'rect', 'square', 'parallelogram', 'rhombus', 'circle', 'ellipse']
  .forEach(id => check(`"${id}" আছে`, ids.includes(id)));
check('কোনো id দুইবার নেই', new Set(ids).size === ids.length);

let bad = LF.SHAPES.filter(s => !s.title || !s.plain || !s.note || !s.steps.length);
check('প্রতিটিতে শিরোনাম · সূত্র · কপি-টেক্সট · টীকা আছে', bad.length === 0,
  bad.map(s => s.id).join(',') || 'সব ঠিক');

bad = LF.SHAPES.filter(s => typeof LF.svg[s.fig] !== 'function');
check('প্রতিটির ডায়াগ্রাম আছে', bad.length === 0, bad.map(s => s.fig).join(',') || 'সব ঠিক');

console.log('\n' + '='.repeat(78));
console.log('  ডায়াগ্রাম (SVG)');
console.log('='.repeat(78));

const figs = ['scalene', 'right', 'trapezium', 'rect', 'square', 'parallelogram',
  'rhombus', 'circle', 'ellipse', 'quadAvg', 'quadDiag'];
check('১১টি ডায়াগ্রাম', figs.every(f => typeof LF.svg[f] === 'function'), figs.length);

let allSvg = figs.map(f => LF.svg[f]());
check('সবগুলো <svg> দিয়ে শুরু', allSvg.every(s => s.startsWith('<svg')));
check('সবগুলোতে একই viewBox', allSvg.every(s => s.includes('viewBox="0 0 200 132"')));
check('রঙ CSS ক্লাস থেকে (ইনলাইন fill/stroke নেই)',
  !allSvg.some(s => /\s(fill|stroke)="/.test(s)));
check('স্ক্রিনরিডারে লুকানো', allSvg.every(s => s.includes('aria-hidden="true"')));
check('ত্রিভুজে a, b, c লেবেল', ['a', 'b', 'c'].every(l => LF.svg.scalene().includes(`>${l}<`)));
check('কর্ণ পদ্ধতিতে T1 ও T2', LF.svg.quadDiag().includes('>T1<') && LF.svg.quadDiag().includes('>T2<'));
check('গড় পদ্ধতিতে কর্ণ নেই', !LF.svg.quadAvg().includes('lf-dash'));
check('কর্ণ পদ্ধতিতে কর্ণ আছে', LF.svg.quadDiag().includes('lf-dash'));

console.log('\n' + '='.repeat(78));
console.log('  একক — কাঠা/বিঘা হার্ডকোড নয় তো?');
console.log('='.repeat(78));

// স্ট্যান্ডার্ড: ১ কাঠা = ৭২০ বর্গফুট = ১.৬৫২৯ শতক, ১ বিঘা = ৩৩.০৫ শতক
LM.setKathaPreset('standard');
let g = LF.unitGroups(LM.kathaBasis());
check('তিনটি একক-গ্রুপ', g.length === 3, g.length);
check('শতক গ্রুপ dynamic নয়', g[0].dynamic === false);
check('কাঠা গ্রুপ dynamic', g[1].dynamic === true);

let katha = JSON.stringify(g[1].rows);
check('স্ট্যান্ডার্ডে ১ কাঠা = ৭২০ বর্গফুট', katha.includes('৭২০ বর্গফুট'), katha);
check('স্ট্যান্ডার্ডে ১ বিঘা = ২০ কাঠা', katha.includes('২০ কাঠা'));

// চওড়া কাঠা: ২.৬০ শতক → ১ কাঠা = ১১৩২.৫৬ বর্গফুট, ১ বিঘা = ৫২ শতক
LM.setKathaPreset('wide');
g = LF.unitGroups(LM.kathaBasis());
katha = JSON.stringify(g[1].rows);
check('চওড়ায় ১ কাঠা = ২.৬ শতক', katha.includes('২.৬ শতক'), katha);
check('চওড়ায় ১ বিঘা = ৫২ শতক', katha.includes('৫২ শতক'));
check('চওড়ায় ৭২০ বর্গফুট আর দেখায় না', !katha.includes('৭২০ বর্গফুট'));
check('চওড়ায়ও ১ বিঘা = ২০ কাঠাই থাকে', katha.includes('২০ কাঠা'));

// কাস্টম ২ শতক → ১ বিঘা = ৪০ শতক
LM.setKathaPreset('custom', 2);
g = LF.unitGroups(LM.kathaBasis());
katha = JSON.stringify(g[1].rows);
check('কাস্টম ২ শতকে ১ বিঘা = ৪০ শতক', katha.includes('৪০ শতক'), katha);

// শতক ও চেইন গ্রুপ কাঠার সাথে বদলায় না
check('১ শতক = ৪৩৫.৬ বর্গফুট অপরিবর্তিত', JSON.stringify(g[0].rows).includes('৪৩৫.৬ বর্গফুট'));
check('১ চেইন = ৬৬ ফুট অপরিবর্তিত', JSON.stringify(g[2].rows).includes('৬৬ ফুট'));

LM.setKathaPreset('standard');   // বাকি টেস্টের জন্য ফিরিয়ে আনি

console.log('\n' + '='.repeat(78));
console.log('  পরামর্শ ও টুলের তালিকা');
console.log('='.repeat(78));

check('৫টি ব্যবহারিক পরামর্শ', LF.TIPS.length === 5, LF.TIPS.length);
check('Offset/সিম্পসনের রুল আছে',
  LF.TIPS.some(([t, d]) => /Offset/.test(t) && /সিম্পসন/.test(d)));
check('কর্ণ মাপার পরামর্শ আছে', LF.TIPS.some(([t]) => /কর্ণ/.test(t)));
check('গান্টার্স স্কেলের কথা আছে', LF.TIPS.some(([, d]) => /গান্টার্স/.test(d)));

check('১৩টি টুল লিংক', LF.TOOLS.length === 13, LF.TOOLS.length);
check('সব টুলে id · নাম · বর্ণনা', LF.TOOLS.every(t => t.length === 3 && t.every(Boolean)));
check('মৌজা মূল্য টুল তালিকায়', LF.TOOLS.some(([id]) => id === 'mouza-value'));
check('ক্যানভাস টুল সবার আগে', LF.TOOLS[0][0] === 'canvas-measure');

console.log('\n' + '='.repeat(78));
console.log('  render() — পুরো HTML');
console.log('='.repeat(78));

const html = LF.render(LM.kathaBasis());
check('৬টি প্যানেল', (html.match(/fz-badge-num/g) || []).length === 6,
  (html.match(/fz-badge-num/g) || []).length);
check('কাঠার নোটের ঘর আছে', html.includes('fz-katha-note'));
check('৯টি আকৃতির কার্ড', LF.SHAPES.every(s => html.includes(`id="lf-${s.id}"`)));
check('ভুল ও সঠিক পদ্ধতি পাশাপাশি',
  html.includes('lf-card-bad') && html.includes('lf-card-good'));
check('ভুল সূত্রটি কাটা দাগ দিয়ে দেখানো', html.includes('lf-eq-bad'));

const copies = (html.match(/AppController\.copyFormula\(/g) || []).length;
check('কপি বোতাম আছে (৯ আকৃতি + কর্ণ + ৪ বন্টন = ১৪)', copies === 14, copies);
check('টুল খোলার বোতাম আছে', html.includes("AppController.openToolModal('canvas-measure')"));
check('সব টুলের বোতাম', LF.TOOLS.every(([id]) => html.includes(`openToolModal('${id}')`)));

// কপি-টেক্সটে ' বা \n থাকলে onclick ভাঙা যাবে না
const risky = LF.SHAPES.filter(s => s.plain.includes("'"));
check('সিঙ্গেল কোট এস্কেপ হয়', !html.includes("copyFormula('" + "s = (a + b + c) / 2\n"),
  risky.length + 'টি ঝুঁকিপূর্ণ');
check('নিউলাইন \\n হিসেবে এস্কেপ হয়', html.includes('\\n') && !/copyFormula\('[^']*\n/.test(html));

// HTML এ কাঁচা {{ }} বা undefined থেকে গেছে কি না
check('কোথাও undefined নেই', !html.includes('undefined'));
check('কোথাও [object Object] নেই', !html.includes('[object Object]'));

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
console.log('='.repeat(78) + '\n');
process.exit(fail ? 1 : 0);
