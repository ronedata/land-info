/* ==========================================================================
   map-measure.js — মৌজা নকশা থেকে জমি পরিমাপ ও ভাগবণ্টন
   --------------------------------------------------------------------------
   ★ মূল ধারণা — স্কেল ক্যালিব্রেশন
     মৌজা নকশায় স্কেল-দণ্ড আঁকা থাকে (সাধারণত ৬৬০ ফুট = ১০ চেইন, নকশার
     স্কেল ১৬ ইঞ্চি = ১ মাইল)। ওই দণ্ডের দুই প্রান্তে ক্লিক করে বাস্তব দৈর্ঘ্য
     বললেই **ফুট প্রতি পিক্সেল** বেরিয়ে আসে। তারপর যেকোনো প্লট আঁকলে তার
     ক্ষেত্রফল বের করা যায়।

     স্কেল-দণ্ড না থাকলে বিকল্প: নকশার স্কেল (১৬ ইঞ্চি = ১ মাইল) ও স্ক্যানের
     DPI দিয়েও হিসাব হয় — `fromMapScale()`।

   ★ ভাগবণ্টন
     একটি প্লটকে নির্দিষ্ট অনুপাতে ভাগ করতে সমান্তরাল রেখা সরানো হয়;
     প্রতিটি ভাগের ক্ষেত্রফল লক্ষ্যে পৌঁছানো পর্যন্ত **বাইসেকশন খোঁজ**।
     ক্ষেত্রফল বের হয় বহুভুজ ক্লিপিং (Sutherland–Hodgman) + শোলেস সূত্রে।

   DOM ছোঁয় না — Node এ টেস্ট করা যায় (tests/mapmeasure-test.js)।
   ========================================================================== */

const MapMeasure = {

  /* ---------------- ধ্রুবক ---------------- */

  SQFT_PER_SATAK: 435.6,          // ১ শতক = ৪৩৫.৬ বর্গফুট (স্থির)
  FT_PER_CHAIN: 66,               // ১ চেইন = ৬৬ ফুট
  FT_PER_MILE: 5280,

  /** নকশায় প্রচলিত স্কেল-দণ্ডের দৈর্ঘ্য (ফুট) — ইউজার বদলাতে পারবেন */
  COMMON_SCALES: [
    { ft: 660, label: '৬৬০ ফুট (১০ চেইন)' },
    { ft: 330, label: '৩৩০ ফুট (৫ চেইন)' },
    { ft: 132, label: '১৩২ ফুট (২ চেইন)' },
    { ft: 66,  label: '৬৬ ফুট (১ চেইন)' }
  ],

  /**
   * মৌজা নকশার প্রচলিত স্কেল — "কত ইঞ্চিতে কত ফুট"
   * বাংলাদেশে সবচেয়ে প্রচলিত ১৬ ইঞ্চি = ১ মাইল, অর্থাৎ ইঞ্চিপ্রতি ৩৩০ ফুট।
   */
  MAP_SCALES: [
    { ftPerInch: 5280 / 16, label: '১৬ ইঞ্চি = ১ মাইল (৩৩০ ফিট/ইঞ্চি)' },
    { ftPerInch: 5280 / 32, label: '৩২ ইঞ্চি = ১ মাইল (১৬৫ ফিট/ইঞ্চি)' },
    { ftPerInch: 5280 / 8,  label: '৮ ইঞ্চি = ১ মাইল (৬৬০ ফিট/ইঞ্চি)' },
    { ftPerInch: 5280 / 4,  label: '৪ ইঞ্চি = ১ মাইল (১৩২০ ফিট/ইঞ্চি)' },
    { ftPerInch: 400,       label: '১ ইঞ্চি = ৪০০ ফুট' },
    { ftPerInch: 200,       label: '১ ইঞ্চি = ২০০ ফুট' }
  ],

  /** স্ক্যানের প্রচলিত DPI */
  DPI_OPTIONS: [
    { dpi: 300, label: '৩০০ DPI (স্ট্যান্ডার্ড স্ক্যান)' },
    { dpi: 150, label: '১৫০ DPI (সাধারণ)' },
    { dpi: 200, label: '২০০ DPI' },
    { dpi: 400, label: '৪০০ DPI (উচ্চ মান)' },
    { dpi: 600, label: '৬০০ DPI (সর্বোচ্চ)' }
  ],

  /**
   * ★ PDF এ DPI বাছার দরকার নেই — রেন্ডার স্কেল থেকেই বেরিয়ে আসে।
   *
   * PDF এর পাতা পরিমাপ হয় **পয়েন্টে** (১ পয়েন্ট = ১/৭২ ইঞ্চি)। আমরা যখন
   * স্কেল `s` এ আঁকি, পাতার প্রস্থ `W` পয়েন্ট হলে ক্যানভাস হয় `W×s` পিক্সেল,
   * আর বাস্তব প্রস্থ `W/৭২` ইঞ্চি। তাই
   *      পিক্সেল/ইঞ্চি = (W×s) ÷ (W/৭২) = ৭২ × s
   * অর্থাৎ DPI কেবল রেন্ডার স্কেলের উপর নির্ভর করে — স্ক্যানের উপর নয়।
   * (প্রতিযোগীর ডায়ালগেও তাই "স্ক্যান DPI — PDF-এর জন্য বন্ধ" লেখা।)
   */
  dpiForPdf(renderScale) {
    const s = Number(renderScale);
    if (!(s > 0)) throw new Error('রেন্ডার স্কেল শূন্যের বেশি হতে হবে');
    return 72 * s;
  },

  /**
   * ফুটকে "৬০'১\"" ধাঁচে — মাঠে আমিনরা এভাবেই বলেন
   * ইঞ্চি ১২ হয়ে গেলে ফুটে চড়িয়ে দেওয়া হয় (৫৯'১২" নয়, ৬০'০")
   */
  formatFtIn(feet, bn) {
    const f = Number(feet) || 0;
    const neg = f < 0;
    let ft = Math.floor(Math.abs(f));
    let inch = Math.round((Math.abs(f) - ft) * 12);
    if (inch >= 12) { ft += 1; inch = 0; }
    const num = n => (bn === false || typeof toBn !== 'function') ? String(n) : toBn(n);
    return (neg ? '−' : '') + num(ft) + "'" + num(inch) + '"';
  },

  /** বহুভুজের প্রতিটি বাহুর দৈর্ঘ্য (ফুটে) — লেবেল বসানোর জন্য */
  edgeLengths(pts, ftPerPx, closed) {
    const out = [];
    if (!Array.isArray(pts) || pts.length < 2) return out;
    const n = closed === false ? pts.length - 1 : pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push({
        from: i, to: (i + 1) % pts.length,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        px: this.dist(a, b),
        feet: this.dist(a, b) * (ftPerPx || 0)
      });
    }
    return out;
  },

  /** বহুভুজের কেন্দ্র (ক্ষেত্রফল-ভারিত) — ভেতরে লেবেল বসাতে */
  centroid(pts) {
    if (!Array.isArray(pts) || pts.length === 0) return { x: 0, y: 0 };
    if (pts.length < 3) {
      const n = pts.length;
      return { x: pts.reduce((s, p) => s + p.x, 0) / n,
               y: pts.reduce((s, p) => s + p.y, 0) / n };
    }
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const cr = p.x * q.y - q.x * p.y;
      a += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr;
    }
    if (Math.abs(a) < 1e-12) {          // অবক্ষয়িত — গড় ধরি
      const n = pts.length;
      return { x: pts.reduce((s, p) => s + p.x, 0) / n,
               y: pts.reduce((s, p) => s + p.y, 0) / n };
    }
    a *= 0.5;
    return { x: cx / (6 * a), y: cy / (6 * a) };
  },

  /* ---------------- স্কেল ---------------- */

  /**
   * দুই বিন্দুর দূরত্ব (পিক্সেলে)
   */
  dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); },

  /**
   * স্কেল-দণ্ড থেকে ক্যালিব্রেশন
   * @param {{x,y}} a  দণ্ডের এক প্রান্ত
   * @param {{x,y}} b  অন্য প্রান্ত
   * @param {number} realFeet  ওই দূরত্ব বাস্তবে কত ফুট
   * @returns {{ftPerPx:number, pxLength:number, realFeet:number}}
   */
  calibrate(a, b, realFeet) {
    const px = this.dist(a, b);
    const ft = Number(realFeet);
    if (!(px > 0)) throw new Error('স্কেলের দুই প্রান্ত একই জায়গায় — দুটি আলাদা বিন্দু দিন');
    if (!(ft > 0)) throw new Error('বাস্তব দৈর্ঘ্য শূন্যের বেশি হতে হবে');
    return { ftPerPx: ft / px, pxLength: px, realFeet: ft };
  },

  /**
   * নকশার স্কেল ও স্ক্যানের DPI থেকে ক্যালিব্রেশন (স্কেল-দণ্ড না থাকলে)
   * উদাহরণ: ১৬ ইঞ্চি = ১ মাইল, ৩০০ DPI
   *   ১ ইঞ্চিতে বাস্তবে ৫২৮০/১৬ = ৩৩০ ফুট
   *   ১ ইঞ্চিতে ছবিতে ৩০০ পিক্সেল  →  ফুট/পিক্সেল = ৩৩০/৩০০ = ১.১
   * @param {number} inchesOnMap   নকশায় কত ইঞ্চি
   * @param {number} realFeet      তা বাস্তবে কত ফুট
   * @param {number} dpi           স্ক্যানের DPI
   */
  fromMapScale(inchesOnMap, realFeet, dpi) {
    const i = Number(inchesOnMap), f = Number(realFeet), d = Number(dpi);
    if (!(i > 0) || !(f > 0) || !(d > 0)) {
      throw new Error('ইঞ্চি, ফুট ও DPI — তিনটিই শূন্যের বেশি হতে হবে');
    }
    return { ftPerPx: (f / i) / d, inchesOnMap: i, realFeet: f, dpi: d };
  },

  /* ---------------- ক্ষেত্রফল ---------------- */

  /** শোলেস সূত্রে বহুভুজের ক্ষেত্রফল (পিক্সেল², সর্বদা ধনাত্মক) */
  areaPx(pts) {
    if (!Array.isArray(pts) || pts.length < 3) return 0;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      s += p.x * q.y - q.x * p.y;
    }
    return Math.abs(s) / 2;
  },

  /** বহুভুজের পরিসীমা (পিক্সেল) */
  perimeterPx(pts) {
    if (!Array.isArray(pts) || pts.length < 2) return 0;
    let s = 0;
    for (let i = 0; i < pts.length; i++) s += this.dist(pts[i], pts[(i + 1) % pts.length]);
    return s;
  },

  /** পিক্সেল² → বর্গফুট */
  sqFt(pts, ftPerPx) {
    const f = Number(ftPerPx);
    if (!(f > 0)) throw new Error('আগে স্কেল ঠিক করুন');
    return this.areaPx(pts) * f * f;
  },

  /**
   * বর্গফুট → সব একক
   * কাঠা/বিঘা ব্যবহারকারীর সেটিং অনুযায়ী (LandMath থেকে) — প্রজেক্টের নিয়ম
   */
  units(sqft) {
    const s = Number(sqft) || 0;
    const satak = s / this.SQFT_PER_SATAK;
    let sqftPerKatha = 720;
    if (typeof LandMath !== 'undefined' && LandMath.kathaBasis) {
      const b = LandMath.kathaBasis();
      if (b && b.sqft > 0) sqftPerKatha = b.sqft;
    }
    return {
      sqft: s,
      satak,
      acre: satak / 100,
      katha: s / sqftPerKatha,
      bigha: s / (sqftPerKatha * 20),
      sqm: s * 0.09290304
    };
  },

  /* ---------------- বহুভুজ ক্লিপিং ---------------- */

  /**
   * সরলরেখার এক পাশের অংশ কেটে নেওয়া (Sutherland–Hodgman অর্ধ-তল ক্লিপ)
   * রেখা: বিন্দু `p0` দিয়ে যায়, দিক `n` (একক লম্ব ভেক্টর)।
   * `n·(P − p0) <= 0` পাশটি রাখা হয়।
   */
  clipHalfPlane(pts, p0, n) {
    if (!Array.isArray(pts) || pts.length < 3) return [];
    const side = p => n.x * (p.x - p0.x) + n.y * (p.y - p0.y);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length];
      const sa = side(A), sb = side(B);
      const inA = sa <= 0, inB = sb <= 0;
      if (inA) out.push(A);
      if (inA !== inB) {
        const t = sa / (sa - sb);            // ছেদবিন্দু
        out.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
      }
    }
    return out;
  },

  /**
   * নির্দিষ্ট দিকে সমান্তরাল রেখা সরিয়ে লক্ষ্য ক্ষেত্রফলের অংশ কাটা
   *
   * @param {Array} pts      মূল বহুভুজ (পিক্সেল)
   * @param {number} angleDeg কাটার রেখার লম্ব দিক (০° = পূর্ব, ৯০° = উত্তর)
   * @param {number} targetPxArea  কত পিক্সেল² কাটতে হবে
   * @returns {{piece:Array, rest:Array, offset:number, iterations:number, areaPx:number}}
   */
  cutByArea(pts, angleDeg, targetPxArea) {
    const total = this.areaPx(pts);
    if (total <= 0) throw new Error('বহুভুজের ক্ষেত্রফল শূন্য');
    const target = Number(targetPxArea);
    if (!(target > 0)) throw new Error('কাটার পরিমাণ শূন্যের বেশি হতে হবে');
    if (target >= total) throw new Error('কাটার পরিমাণ মোট জমির চেয়ে বেশি বা সমান');

    const r = angleDeg * Math.PI / 180;
    const n = { x: Math.cos(r), y: Math.sin(r) };

    // বহুভুজের সব বিন্দুকে n বরাবর প্রক্ষেপ করে সীমা বের করি
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) {
      const d = n.x * p.x + n.y * p.y;
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }

    // বাইসেকশন — offset বাড়ালে কাটা অংশ বাড়ে (একঘাতী)
    let a = lo, b = hi, mid = lo, piece = [], iter = 0;
    for (; iter < 60; iter++) {
      mid = (a + b) / 2;
      const p0 = { x: n.x * mid, y: n.y * mid };
      piece = this.clipHalfPlane(pts, p0, n);
      const got = this.areaPx(piece);
      if (Math.abs(got - target) < total * 1e-9) break;
      if (got < target) a = mid; else b = mid;
    }

    const p0 = { x: n.x * mid, y: n.y * mid };
    const rest = this.clipHalfPlane(pts, p0, { x: -n.x, y: -n.y });
    return { piece, rest, offset: mid, iterations: iter, areaPx: this.areaPx(piece) };
  },

  /**
   * শরিকদের মাঝে ভাগ — অনুপাত অনুযায়ী পরপর কেটে নেওয়া
   * @param {Array} pts
   * @param {number} angleDeg
   * @param {Array<number>} shares  অনুপাত (যেকোনো ধনাত্মক সংখ্যা; যোগফল ধরে ভাগ)
   * @returns {Array<{index, share, polygon, areaPx, ratio}>}
   */
  divide(pts, angleDeg, shares) {
    const list = (shares || []).map(Number).filter(v => v > 0);
    if (list.length < 2) throw new Error('অন্তত দুইজন শরিকের অংশ দিন');
    const sum = list.reduce((a, b) => a + b, 0);
    const total = this.areaPx(pts);

    const out = [];
    let remain = pts.slice();
    let remainArea = total;

    for (let i = 0; i < list.length - 1; i++) {
      const want = total * (list[i] / sum);
      if (want >= remainArea) {          // ভাসমান-বিন্দুর প্রান্তিক কেস
        out.push({ index: i, share: list[i], polygon: remain,
                   areaPx: remainArea, ratio: list[i] / sum });
        remain = []; remainArea = 0;
        break;
      }
      const c = this.cutByArea(remain, angleDeg, want);
      out.push({ index: i, share: list[i], polygon: c.piece,
                 areaPx: c.areaPx, ratio: list[i] / sum });
      remain = c.rest;
      remainArea = this.areaPx(remain);
    }
    if (remain.length >= 3) {
      const i = out.length;
      out.push({ index: i, share: list[i], polygon: remain,
                 areaPx: remainArea, ratio: list[i] / sum });
    }
    return out;
  },

  /**
   * বিন্দুটি বহুভুজের ভেতরে? (ray casting)
   * প্লটে ট্যাপ করে বাছাই করার জন্য দরকার।
   */
  pointInPolygon(pt, poly) {
    if (!Array.isArray(poly) || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      const hit = (a.y > pt.y) !== (b.y > pt.y) &&
                  pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x;
      if (hit) inside = !inside;
    }
    return inside;
  },

  /**
   * বৃত্তকে বহুভুজে রূপান্তর — ক্ষেত্রফল ও ভাগ করার জন্য
   *
   * ★ ক্ষেত্রফল-রক্ষী (area-preserving)
   *   সাধারণ অন্তর্লিখিত n-ভুজের ক্ষেত্রফল πr² এর চেয়ে কম — ৭২ বাহুতে
   *   ০.১২৭% কম। জমির হিসাবে ১০০ শতকে ০.১৩ শতক ভুল, যা এড়ানো যায়।
   *   তাই ব্যাসার্ধ সামান্য বাড়িয়ে নেওয়া হয়:
   *        k = √( (2π/n) ÷ sin(2π/n) )
   *   এতে বহুভুজের ক্ষেত্রফল **ঠিক πr²** হয়, আর ১৮০ বাহুতে ব্যাসার্ধ
   *   মাত্র ০.০১০২% বাড়ে — চোখে ধরা পড়ে না।
   */
  circleToPolygon(center, radiusPx, segments) {
    const n = Math.max(12, Math.min(720, segments || 180));
    const step = (Math.PI * 2) / n;
    const k = Math.sqrt(step / Math.sin(step));      // ক্ষেত্রফল-রক্ষী সংশোধন
    const r = radiusPx * k;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = i * step;
      out.push({ x: center.x + r * Math.cos(a),
                 y: center.y + r * Math.sin(a) });
    }
    return out;
  },

  /** বৃত্তের প্রকৃত ক্ষেত্রফল (পিক্সেল²) */
  circleAreaPx(radiusPx) {
    const r = Number(radiusPx) || 0;
    return Math.PI * r * r;
  },

  /**
   * ম্যানুয়াল ভাগ — যেকোনো রেখা টেনে প্লটকে দুই ভাগে কাটা
   * রেখাটি প্লটকে সত্যিই দুই ভাগ করছে কি না যাচাই করা হয়।
   * @returns {{a:Array, b:Array, areaA:number, areaB:number}}
   */
  sliceByLine(pts, p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-9)) throw new Error('রেখাটি অনেক ছোট — টেনে বড় করুন');

    // রেখার লম্ব ভেক্টর
    const n = { x: -dy / len, y: dx / len };
    const a = this.clipHalfPlane(pts, p1, n);
    const b = this.clipHalfPlane(pts, p1, { x: -n.x, y: -n.y });

    const aA = this.areaPx(a), aB = this.areaPx(b);
    const total = this.areaPx(pts);
    if (aA < total * 1e-6 || aB < total * 1e-6) {
      throw new Error('রেখাটি প্লটকে দুই ভাগে কাটছে না — প্লটের ভেতর দিয়ে টানুন');
    }
    return { a, b, areaA: aA, areaB: aB };
  },

  /* ---------------- প্লট ব্যবস্থাপনা ---------------- */

  /** নতুন প্লটের কাঠামো */
  newPlot(id) {
    return { id, dag: '', name: '', points: [], closed: false };
  },

  /** একটি প্লটের হিসাব */
  measure(plot, ftPerPx) {
    const pts = (plot && plot.points) || [];
    const px = this.areaPx(pts);
    const sqft = ftPerPx > 0 ? px * ftPerPx * ftPerPx : 0;
    return {
      points: pts.length,
      areaPx: px,
      perimeterFt: ftPerPx > 0 ? this.perimeterPx(pts) * ftPerPx : 0,
      ...this.units(sqft)
    };
  },

  /** সব প্লটের যোগফল */
  totals(plots, ftPerPx) {
    let sqft = 0;
    (plots || []).forEach(p => {
      if (p.points && p.points.length >= 3) {
        sqft += this.areaPx(p.points) * ftPerPx * ftPerPx;
      }
    });
    return { count: (plots || []).filter(p => p.points && p.points.length >= 3).length,
             ...this.units(sqft) };
  },

  /* ---------------- প্রজেক্ট সেভ / রিস্টোর ---------------- */

  VERSION: 1,

  /** প্রজেক্ট → JSON টেক্সট (ছবি বাদে — ছবি আলাদা রাখা হয়) */
  exportProject(state) {
    const s = state || {};
    return JSON.stringify({
      app: 'land-info-map-measure',
      version: this.VERSION,
      mapName: s.mapName || '',
      imageWidth: s.imageWidth || 0,
      imageHeight: s.imageHeight || 0,
      scale: s.scale || null,
      plots: (s.plots || []).map(p => ({
        id: p.id, dag: p.dag || '', name: p.name || '',
        closed: !!p.closed,
        points: (p.points || []).map(q => ({ x: +q.x.toFixed(2), y: +q.y.toFixed(2) }))
      }))
    }, null, 1);
  },

  /** JSON টেক্সট → প্রজেক্ট (যাচাইসহ) */
  importProject(text) {
    let d;
    try { d = JSON.parse(text); }
    catch (e) { throw new Error('ফাইলটি বৈধ প্রজেক্ট ফাইল নয়'); }
    if (!d || d.app !== 'land-info-map-measure') {
      throw new Error('এটি এই টুলের প্রজেক্ট ফাইল নয়');
    }
    if (Number(d.version) > this.VERSION) {
      throw new Error('ফাইলটি নতুন সংস্করণের — টুল হালনাগাদ করুন');
    }
    return {
      mapName: d.mapName || '',
      imageWidth: Number(d.imageWidth) || 0,
      imageHeight: Number(d.imageHeight) || 0,
      scale: d.scale && d.scale.ftPerPx > 0 ? d.scale : null,
      plots: (d.plots || []).map((p, i) => ({
        id: p.id != null ? p.id : i + 1,
        dag: p.dag || '', name: p.name || '',
        closed: !!p.closed,
        points: (p.points || [])
          .filter(q => isFinite(q.x) && isFinite(q.y))
          .map(q => ({ x: Number(q.x), y: Number(q.y) }))
      }))
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = MapMeasure;
