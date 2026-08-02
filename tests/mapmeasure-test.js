/* ==========================================================================
   tests/mapmeasure-test.js — মৌজা নকশা থেকে পরিমাপ ও ভাগবণ্টন
   চালাও:  node tests/mapmeasure-test.js
   ========================================================================== */

const M = require('../js/map-measure.js');

let pass = 0, fail = 0;
const head = t => console.log('\n\x1b[36m── ' + t + ' ──\x1b[0m');
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  \x1b[31m✗ ' + name + (extra ? '   ' + extra : '') + '\x1b[0m'); }
}
function near(name, got, want, tol, unit) {
  ok(name, Math.abs(got - want) <= tol,
     `পাওয়া ${got.toFixed(4)}${unit || ''} · প্রত্যাশিত ${want.toFixed(4)}${unit || ''}`);
}
function throws(name, fn, match) {
  try { fn(); ok(name, false, 'ত্রুটি আসেনি'); }
  catch (e) { ok(name, !match || e.message.includes(match), e.message.slice(0, 55)); }
}

/* ═══════════ ১. স্কেল ক্যালিব্রেশন ═══════════ */
head('স্কেল ক্যালিব্রেশন (৬৬০ ফুট দণ্ড)');
{
  // ৬৬০ ফুটের দণ্ড ছবিতে ৩০০ পিক্সেল লম্বা
  const c = M.calibrate({ x: 100, y: 500 }, { x: 400, y: 500 }, 660);
  near('পিক্সেল দৈর্ঘ্য ৩০০', c.pxLength, 300, 1e-9);
  near('ফুট/পিক্সেল = ২.২', c.ftPerPx, 2.2, 1e-9);

  // তির্যক দণ্ডেও চলে (৩-৪-৫)
  const d = M.calibrate({ x: 0, y: 0 }, { x: 300, y: 400 }, 660);
  near('তির্যক দণ্ড → ৫০০ পিক্সেল', d.pxLength, 500, 1e-9);
  near('ফুট/পিক্সেল = ১.৩২', d.ftPerPx, 1.32, 1e-9);

  throws('একই বিন্দুতে ত্রুটি', () => M.calibrate({ x: 5, y: 5 }, { x: 5, y: 5 }, 660), 'একই জায়গায়');
  throws('শূন্য দৈর্ঘ্যে ত্রুটি', () => M.calibrate({ x: 0, y: 0 }, { x: 10, y: 0 }, 0), 'শূন্যের বেশি');
}

/* ═══════════ ২. নকশার স্কেল + DPI ═══════════ */
head('নকশার স্কেল ও DPI');
{
  // ১৬ ইঞ্চি = ১ মাইল (৫২৮০ ফুট), স্ক্যান ৩০০ DPI
  const r = M.fromMapScale(16, 5280, 300);
  near('ফুট/পিক্সেল = ১.১', r.ftPerPx, 1.1, 1e-12);

  // যাচাই: ১ ইঞ্চিতে ৩৩০ ফুট, ৩০০ পিক্সেল → ১.১
  near('স্বাধীন হিসাব মেলে', r.ftPerPx, (5280 / 16) / 300, 1e-12);

  // DPI দ্বিগুণ হলে ফুট/পিক্সেল অর্ধেক
  const r2 = M.fromMapScale(16, 5280, 600);
  near('৬০০ DPI তে অর্ধেক', r2.ftPerPx, r.ftPerPx / 2, 1e-12);

  throws('DPI শূন্যে ত্রুটি', () => M.fromMapScale(16, 5280, 0), 'শূন্যের বেশি');
}

/* ═══════════ ৩. ক্ষেত্রফল ═══════════ */
head('ক্ষেত্রফল (শোলেস)');
{
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  near('১০×১০ বর্গ = ১০০', M.areaPx(sq), 100, 1e-9);
  near('পরিসীমা = ৪০', M.perimeterPx(sq), 40, 1e-9);

  // ঘড়ির উল্টো দিকে দিলেও ধনাত্মক
  near('উল্টো ক্রমেও ধনাত্মক', M.areaPx(sq.slice().reverse()), 100, 1e-9);

  const tri = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 4 }];
  near('৩-৪-৫ ত্রিভুজ = ৬', M.areaPx(tri), 6, 1e-9);

  ok('২ বিন্দুতে ক্ষেত্রফল ০', M.areaPx([{ x: 0, y: 0 }, { x: 1, y: 1 }]) === 0);
  ok('খালিতে ০', M.areaPx([]) === 0);

  // এই প্রকল্পের পুরনো টেস্টের সাথে মিল: ১০০×৮০ ফুট = ৮০০০ বর্গফুট
  const rect = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
  near('১০০×৮০ পিক্সেল, ১ ফুট/পিক্সেল = ৮০০০ বর্গফুট',
       M.sqFt(rect, 1), 8000, 1e-9);
  throws('স্কেল ছাড়া ত্রুটি', () => M.sqFt(rect, 0), 'স্কেল');
}

/* ═══════════ ৪. একক রূপান্তর ═══════════ */
head('একক রূপান্তর');
{
  const u = M.units(8000);
  near('৮০০০ বর্গফুট = ১৮.৩৬৫ শতক', u.satak, 8000 / 435.6, 1e-9);
  near('একর', u.acre, u.satak / 100, 1e-12);
  near('বর্গমিটার', u.sqm, 8000 * 0.09290304, 1e-9);
  near('১ শতক = ৪৩৫.৬ বর্গফুট', M.units(435.6).satak, 1, 1e-12);
  near('১০০ শতক = ১ একর', M.units(43560).acre, 1, 1e-12);
  ok('শূন্যে সব শূন্য', M.units(0).satak === 0 && M.units(0).katha === 0);
  // LandMath না থাকলে ৭২০ বর্গফুট ধরে
  near('কাঠা (ডিফল্ট ৭২০ বর্গফুট)', M.units(720).katha, 1, 1e-9);
  near('২০ কাঠা = ১ বিঘা', M.units(720 * 20).bigha, 1, 1e-9);
}

/* ═══════════ ৫. অর্ধ-তল ক্লিপ ═══════════ */
head('বহুভুজ ক্লিপিং');
{
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  // x <= 5 পাশ রাখি (n = +x দিক, p0 = (5,0))
  const left = M.clipHalfPlane(sq, { x: 5, y: 0 }, { x: 1, y: 0 });
  near('বাঁ অর্ধেক = ৫০', M.areaPx(left), 50, 1e-9);
  const right = M.clipHalfPlane(sq, { x: 5, y: 0 }, { x: -1, y: 0 });
  near('ডান অর্ধেক = ৫০', M.areaPx(right), 50, 1e-9);
  near('দুই অর্ধেকের যোগ = মোট', M.areaPx(left) + M.areaPx(right), 100, 1e-9);

  // পুরো বহুভুজ এক পাশে থাকলে অক্ষত
  const all = M.clipHalfPlane(sq, { x: 100, y: 0 }, { x: 1, y: 0 });
  near('সম্পূর্ণ ভেতরে → অক্ষত', M.areaPx(all), 100, 1e-9);
  const none = M.clipHalfPlane(sq, { x: -5, y: 0 }, { x: 1, y: 0 });
  near('সম্পূর্ণ বাইরে → শূন্য', M.areaPx(none), 0, 1e-9);
}

/* ═══════════ ৬. নির্দিষ্ট ক্ষেত্রফল কাটা ═══════════ */
head('নির্দিষ্ট ক্ষেত্রফল কাটা');
{
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const c = M.cutByArea(sq, 0, 2500);           // ২৫% পূর্ব দিক থেকে
  near('কাটা অংশ = ২৫০০', c.areaPx, 2500, 1e-3);
  near('অবশিষ্ট = ৭৫০০', M.areaPx(c.rest), 7500, 1e-3);
  near('যোগফল = মোট', c.areaPx + M.areaPx(c.rest), 10000, 1e-3);
  ok('অল্প ইটারেশনে মেলে', c.iterations < 60, c.iterations + ' বার');

  // তির্যক দিকেও
  const d = M.cutByArea(sq, 45, 3000);
  near('৪৫° কোণে কাটা = ৩০০০', d.areaPx, 3000, 1e-2);
  near('৪৫° যোগফল', d.areaPx + M.areaPx(d.rest), 10000, 1e-2);

  // ত্রিভুজেও
  const tri = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
  const e = M.cutByArea(tri, 0, 1000);
  near('ত্রিভুজে কাটা = ১০০০', e.areaPx, 1000, 1e-2);
  near('ত্রিভুজে যোগফল = ৫০০০', e.areaPx + M.areaPx(e.rest), 5000, 1e-2);

  throws('মোটের বেশি কাটতে চাইলে', () => M.cutByArea(sq, 0, 20000), 'বেশি');
  throws('শূন্য কাটতে চাইলে', () => M.cutByArea(sq, 0, 0), 'শূন্যের বেশি');
}

/* ═══════════ ৭. শরিকদের ভাগবণ্টন ═══════════ */
head('শরিকদের মাঝে ভাগবণ্টন');
{
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

  // সমান তিন ভাগ
  const three = M.divide(sq, 0, [1, 1, 1]);
  ok('তিন ভাগ হয়েছে', three.length === 3);
  three.forEach((p, i) =>
    near(`ভাগ ${i + 1} ≈ ৩৩৩৩.৩৩`, p.areaPx, 10000 / 3, 1));
  near('যোগফল = মোট',
       three.reduce((s, p) => s + p.areaPx, 0), 10000, 1e-2);

  // অসম অনুপাত ৫০ : ৩০ : ২০
  const un = M.divide(sq, 0, [50, 30, 20]);
  near('৫০% ভাগ', un[0].areaPx, 5000, 1);
  near('৩০% ভাগ', un[1].areaPx, 3000, 1);
  near('২০% ভাগ', un[2].areaPx, 2000, 1);
  near('যোগফল হুবহু', un.reduce((s, p) => s + p.areaPx, 0), 10000, 1e-2);

  // দুই ভাগ, তির্যক দিকে
  const two = M.divide(sq, 30, [2, 1]);
  near('২:১ প্রথম ভাগ', two[0].areaPx, 10000 * 2 / 3, 1);
  near('২:১ যোগফল', two[0].areaPx + two[1].areaPx, 10000, 1e-2);

  // প্রতিটি ভাগ বৈধ বহুভুজ
  ok('প্রতিটি ভাগে ≥৩ বিন্দু', un.every(p => p.polygon.length >= 3));

  throws('একজনে ত্রুটি', () => M.divide(sq, 0, [1]), 'দুইজন শরিকের');
  throws('খালি তালিকায় ত্রুটি', () => M.divide(sq, 0, []), 'দুইজন শরিকের');
}

/* ═══════════ ৮. বাস্তব দৃশ্য — ৬৬০ ফুট দণ্ড ═══════════ */
head('বাস্তব দৃশ্য');
{
  // নকশায় ৬৬০ ফুটের দণ্ড ৩০০ পিক্সেল → ২.২ ফুট/পিক্সেল
  const cal = M.calibrate({ x: 0, y: 0 }, { x: 300, y: 0 }, 660);
  // একটি দাগ আঁকা হলো — ১০০×৮০ পিক্সেল আয়ত
  const plot = { id: 1, dag: '৩৫৬',
                 points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }] };
  const m = M.measure(plot, cal.ftPerPx);

  // বাস্তব মাপ: ১০০×২.২ = ২২০ ফুট, ৮০×২.২ = ১৭৬ ফুট → ৩৮,৭২০ বর্গফুট
  near('ক্ষেত্রফল ৩৮,৭২০ বর্গফুট', m.sqft, 220 * 176, 1e-6);
  near('= ৮৮.৮৮ শতক', m.satak, (220 * 176) / 435.6, 1e-9);
  near('পরিসীমা = ৭৯২ ফুট', m.perimeterFt, 2 * (220 + 176), 1e-9);
  ok('বিন্দু সংখ্যা ৪', m.points === 4);

  // তিন শরিকে ভাগ
  const parts = M.divide(plot.points, 0, [1, 1, 1]);
  const sat = parts.map(p => M.units(p.areaPx * cal.ftPerPx * cal.ftPerPx).satak);
  near('প্রতি ভাগ ≈ ২৯.৬৩ শতক', sat[0], m.satak / 3, 0.01);
  near('তিন ভাগের যোগ = মোট', sat[0] + sat[1] + sat[2], m.satak, 1e-6);
}

/* ═══════════ ৯. একাধিক প্লটের যোগফল ═══════════ */
head('একাধিক প্লট');
{
  const sq = n => [{ x: 0, y: 0 }, { x: n, y: 0 }, { x: n, y: n }, { x: 0, y: n }];
  const plots = [
    { id: 1, points: sq(10) },                    // ১০০ px²
    { id: 2, points: sq(20) },                    // ৪০০ px²
    { id: 3, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }   // অসম্পূর্ণ
  ];
  const t = M.totals(plots, 1);
  ok('সম্পন্ন প্লট = ২', t.count === 2);
  near('মোট বর্গফুট = ৫০০', t.sqft, 500, 1e-9);
  ok('অসম্পূর্ণ প্লট বাদ', t.sqft === 500);
  ok('খালি তালিকায় ০', M.totals([], 1).count === 0);
}

/* ═══════════ ১০. প্রজেক্ট সেভ / রিস্টোর ═══════════ */
head('প্রজেক্ট সেভ ও রিস্টোর');
{
  const state = {
    mapName: 'আলোকদিয়া মৌজা.pdf',
    imageWidth: 5245, imageHeight: 3705,
    scale: { ftPerPx: 2.2, realFeet: 660, pxLength: 300 },
    plots: [
      { id: 1, dag: '৩৫৬', name: 'করিমের জমি', closed: true,
        points: [{ x: 10.123456, y: 20.7 }, { x: 100, y: 20 }, { x: 100, y: 90 }] }
    ]
  };
  const json = M.exportProject(state);
  ok('JSON টেক্সট', typeof json === 'string' && json.length > 50);
  ok('অ্যাপ চিহ্ন আছে', json.includes('land-info-map-measure'));

  const back = M.importProject(json);
  ok('মৌজার নাম ফিরল', back.mapName === state.mapName);
  ok('ছবির মাপ ফিরল', back.imageWidth === 5245 && back.imageHeight === 3705);
  near('স্কেল ফিরল', back.scale.ftPerPx, 2.2, 1e-12);
  ok('প্লট ফিরল', back.plots.length === 1 && back.plots[0].dag === '৩৫৬');
  ok('বিন্দু সংখ্যা ঠিক', back.plots[0].points.length === 3);
  near('স্থানাঙ্ক ২ দশমিকে', back.plots[0].points[0].x, 10.12, 1e-9);

  // ক্ষেত্রফল রাউন্ড-ট্রিপে প্রায় অক্ষত
  const a1 = M.areaPx(state.plots[0].points), a2 = M.areaPx(back.plots[0].points);
  ok('ক্ষেত্রফল রাউন্ড-ট্রিপে অক্ষত (<০.১%)',
     Math.abs(a1 - a2) / a1 < 0.001, `${a1.toFixed(2)} → ${a2.toFixed(2)}`);

  throws('আজেবাজে টেক্সটে ত্রুটি', () => M.importProject('হিজিবিজি'), 'বৈধ');
  throws('অন্য অ্যাপের JSON', () => M.importProject('{"app":"other"}'), 'এই টুলের');
  throws('নতুন সংস্করণে ত্রুটি',
    () => M.importProject('{"app":"land-info-map-measure","version":99}'), 'হালনাগাদ');
  // অবৈধ বিন্দু ছেঁকে ফেলা হয়
  const bad = M.importProject(JSON.stringify({
    app: 'land-info-map-measure', version: 1,
    plots: [{ id: 1, points: [{ x: 1, y: 2 }, { x: 'ক', y: 3 }, { x: 4, y: 5 }] }]
  }));
  ok('অবৈধ বিন্দু বাদ যায়', bad.plots[0].points.length === 2);
}

/* ═══════════ ১১. প্রিসেট ও PDF এর DPI ═══════════ */
head('স্কেল প্রিসেট ও PDF এর DPI');
{
  ok('MAP_SCALES আছে', M.MAP_SCALES.length >= 4);
  near('১৬ ইঞ্চি = ১ মাইল → ৩৩০ ফুট/ইঞ্চি', M.MAP_SCALES[0].ftPerInch, 330, 1e-12);
  ok('সব লেবেল বাংলায়', M.MAP_SCALES.every(x => /[\u0980-\u09FF]/.test(x.label)));
  ok('DPI বিকল্পে ৩০০ আছে', M.DPI_OPTIONS.some(x => x.dpi === 300));

  // PDF: DPI = ৭২ × রেন্ডার স্কেল
  near('স্কেল ১ → ৭২ DPI', M.dpiForPdf(1), 72, 1e-12);
  near('স্কেল ২.২ → ১৫৮.৪ DPI', M.dpiForPdf(2.2), 158.4, 1e-9);
  // স্বাধীন যাচাই — প্রতিযোগীর ডিবাগ লগের সংখ্যা দিয়ে:
  //   পাতা ২৩৮৪ পয়েন্ট চওড়া, স্কেল ২.২ → ক্যানভাস ৫২৪৫ পিক্সেল
  //   বাস্তব প্রস্থ ২৩৮৪/৭২ ইঞ্চি → ৫২৪৫ ÷ তা = ১৫৮.৪ DPI
  const canvasPx = 2384 * 2.2, inches = 2384 / 72;
  near('প্রতিযোগীর লগের সাথে মেলে', M.dpiForPdf(2.2), canvasPx / inches, 1e-6);
  throws('স্কেল শূন্যে ত্রুটি', () => M.dpiForPdf(0), 'শূন্যের বেশি');

  // পুরো শৃঙ্খল
  const dpi = M.dpiForPdf(2.2);
  const cal = M.fromMapScale(1, 330, dpi);
  near('ফুট/পিক্সেল = ৩৩০/১৫৮.৪', cal.ftPerPx, 330 / 158.4, 1e-12);
}

/* ═══════════ ১২. ফুট-ইঞ্চি লেখা ═══════════ */
head('ফুট-ইঞ্চি ফরম্যাট');
{
  const F = (v) => M.formatFtIn(v, false);
  ok('৬০.০৮৩ ফুট → 60\'1"', F(60 + 1 / 12) === '60\'1"', F(60 + 1 / 12));
  ok('৪০ ফুট → 40\'0"', F(40) === '40\'0"');
  ok('০ → 0\'0"', F(0) === '0\'0"');
  ok('৫৯.৯৯৯ → 60\'0" (১২ ইঞ্চি চড়ে যায়)', F(59.9999) === '60\'0"', F(59.9999));
  ok('আধা ফুট → 0\'6"', F(0.5) === '0\'6"');
  ok('ঋণাত্মক', F(-3.25) === '−3\'3"', F(-3.25));
}

/* ═══════════ ১৩. বাহুর দৈর্ঘ্য ও কেন্দ্র ═══════════ */
head('বাহুর দৈর্ঘ্য ও কেন্দ্র');
{
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
  const e = M.edgeLengths(sq, 2.2, true);
  ok('চারটি বাহু', e.length === 4);
  near('বাহু ১ = ২২০ ফুট', e[0].feet, 220, 1e-9);
  near('বাহু ২ = ১৭৬ ফুট', e[1].feet, 176, 1e-9);
  near('বাহু ১ এর মাঝবিন্দু x', e[0].mid.x, 50, 1e-9);
  ok('শেষ বাহু প্রথম বিন্দুতে ফেরে', e[3].to === 0);
  ok('বাহুর যোগ = পরিসীমা',
     Math.abs(e.reduce((a, b) => a + b.px, 0) - M.perimeterPx(sq)) < 1e-9);

  const open = M.edgeLengths(sq, 1, false);
  ok('খোলা রেখায় ৩ বাহু', open.length === 3);

  const c = M.centroid(sq);
  near('কেন্দ্র x = ৫০', c.x, 50, 1e-9);
  near('কেন্দ্র y = ৪০', c.y, 40, 1e-9);

  const tri = [{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 0, y: 60 }];
  near('ত্রিভুজের কেন্দ্র x = ৩০', M.centroid(tri).x, 30, 1e-9);
  near('ত্রিভুজের কেন্দ্র y = ২০', M.centroid(tri).y, 20, 1e-9);

  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
  const lc = M.centroid(line);
  ok('এক রেখায় NaN নয়', isFinite(lc.x) && isFinite(lc.y), lc.x + ',' + lc.y);
  ok('খালিতে ০,০', M.centroid([]).x === 0);
  ok('এক বিন্দুতে সেটিই', M.centroid([{ x: 7, y: 9 }]).x === 7);
}

/* ═══════════ ১৪. প্লট বাছাই · বৃত্ত · ম্যানুয়াল ভাগ ═══════════ */
head('বিন্দু ভেতরে? · বৃত্ত · ম্যানুয়াল ভাগ');
{
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  ok('কেন্দ্র ভেতরে', M.pointInPolygon({ x: 50, y: 50 }, sq));
  ok('বাইরে', !M.pointInPolygon({ x: 150, y: 50 }, sq));
  ok('ঠিক বাইরের ধারে', !M.pointInPolygon({ x: -0.1, y: 50 }, sq));
  ok('কোণার ভেতরে', M.pointInPolygon({ x: 0.5, y: 0.5 }, sq));
  ok('২ বিন্দুর বহুভুজে false', !M.pointInPolygon({ x: 1, y: 1 }, [{ x: 0, y: 0 }, { x: 2, y: 2 }]));

  // অবতল (L আকৃতি) — খাঁজের ভেতরের বিন্দু বাইরে হওয়া চাই
  const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 },
             { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }];
  ok('L আকৃতির বাহুতে ভেতরে', M.pointInPolygon({ x: 20, y: 20 }, L));
  ok('L আকৃতির খাঁজে বাইরে', !M.pointInPolygon({ x: 70, y: 70 }, L));

  // বৃত্ত → বহুভুজ
  const c = M.circleToPolygon({ x: 0, y: 0 }, 100, 72);
  ok('৭২ বাহু', c.length === 72);
  // ক্ষেত্রফল-রক্ষী — বাহু যত কমই হোক, ক্ষেত্রফল ঠিক πr²
  const err = Math.abs(M.areaPx(c) - Math.PI * 1e4) / (Math.PI * 1e4);
  ok('ক্ষেত্রফল ঠিক πr² (ত্রুটি <০.০০১%)', err < 1e-5, (err * 100).toExponential(2) + '%');
  [12, 36, 180, 720].forEach(n => {
    const e = Math.abs(M.areaPx(M.circleToPolygon({ x: 0, y: 0 }, 50, n)) - Math.PI * 2500)
              / (Math.PI * 2500);
    ok(`${n} বাহুতেও ক্ষেত্রফল ঠিক`, e < 1e-5, (e * 100).toExponential(2) + '%');
  });
  ok('ডিফল্ট ১৮০ বাহু', M.circleToPolygon({ x: 0, y: 0 }, 10).length === 180);
  ok('ন্যূনতম বাহু মানা হয়', M.circleToPolygon({ x: 0, y: 0 }, 10, 3).length === 12);
  near('circleAreaPx = πr²', M.circleAreaPx(100), Math.PI * 1e4, 1e-9);
  // ব্যাসার্ধ সামান্য বাড়ে, কিন্তু ১৮০ বাহুতে অদৃশ্য
  const p180 = M.circleToPolygon({ x: 0, y: 0 }, 100, 180);
  const rOut = Math.hypot(p180[0].x, p180[0].y);
  ok('১৮০ বাহুতে ব্যাসার্ধ ০.০১০২% বাড়ে (চোখে অদৃশ্য)',
     Math.abs((rOut - 100) / 100 - 0.000102) < 2e-6,
     ((rOut - 100) / 100 * 100).toFixed(4) + '%');

  // ম্যানুয়াল ভাগ — উল্লম্ব রেখা মাঝখানে
  const cut = M.sliceByLine(sq, { x: 50, y: -10 }, { x: 50, y: 110 });
  near('ক অংশ = ৫০০০', cut.areaA, 5000, 1e-6);
  near('খ অংশ = ৫০০০', cut.areaB, 5000, 1e-6);
  near('যোগফল = মোট', cut.areaA + cut.areaB, 10000, 1e-6);

  // তির্যক রেখা — কর্ণ বরাবর
  const diag = M.sliceByLine(sq, { x: -10, y: -10 }, { x: 110, y: 110 });
  near('কর্ণে দুই সমান ভাগ', diag.areaA, 5000, 1e-6);
  near('কর্ণে যোগফল', diag.areaA + diag.areaB, 10000, 1e-6);

  throws('প্লটের বাইরের রেখায় ত্রুটি',
    () => M.sliceByLine(sq, { x: 200, y: 0 }, { x: 200, y: 100 }), 'দুই ভাগে কাটছে না');
  throws('অতি ছোট রেখায় ত্রুটি',
    () => M.sliceByLine(sq, { x: 50, y: 50 }, { x: 50, y: 50 }), 'অনেক ছোট');
}

console.log('\n' + '='.repeat(78));
console.log(`  ফলাফল: ${pass} পাশ · ${fail} ফেল`);
console.log('='.repeat(78) + '\n');
process.exit(fail ? 1 : 0);
