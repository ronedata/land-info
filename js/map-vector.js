/* ==========================================================================
   js/map-vector.js — স্ক্যান করা নকশা থেকে ভেক্টর রেখা

   ★ কেন দরকার
     GroundOverlay একটাই টেক্সচার — জুম করলে ঝাপসা হয়, আর বড় ছবি
     Google Earth আঁকতেই পারে না (লাল X)। রেখাগুলো ভেক্টর হলে যত খুশি
     জুম করা যায়, ফাইলও ছোট, আর প্রতিটি রেখা আলাদা বস্তু।

   ★ ধাপ
     ১. থ্রেশহোল্ড  — কোন পিক্সেল কালি, কোনটা কাগজ
     ২. ফুটকি সরানো — স্ক্যানের ময়লা ও ছাপার বিন্দু বাদ
     ৩. থিনিং       — Zhang–Suen; মোটা রেখা ১ পিক্সেল চওড়া কঙ্কালে নামে
     ৪. ট্রেসিং     — কঙ্কাল হেঁটে পলিলাইন; মোড় ও শাখায় ভাগ হয়
     ৫. সরলীকরণ     — Douglas–Peucker; বিন্দু কমে, আকৃতি থাকে
     ৬. ভূ-রূপান্তর — solveTransform এর toGeo দিয়ে অক্ষাংশ/দ্রাঘিমাংশ

   ★ কেন কঙ্কাল, কেবল কনট্যুর নয়
     কনট্যুর ট্রেস করলে প্রতিটি রেখার **দুই পাশ** আলাদা করে আসে — একটা
     রেখা হয়ে যায় লম্বা সরু বদ্ধ লুপ, বিন্দু দ্বিগুণ, আর জুম করলে
     ফাঁপা দেখায়। কঙ্কাল নিলে রেখার **মাঝ বরাবর** একটাই পথ পাওয়া যায়।

   ★ DOM লাগে না — Node এ টেস্ট করা যায়
   ========================================================================== */

const MapVector = {

  /** কালি চেনার সীমা — kmz-fx এর DEFAULT_THRESHOLD এর সাথে এক রাখা হয়েছে */
  DEFAULT_THRESHOLD: 205,

  /** এর চেয়ে বড় ছবিতে ভেক্টর করা হয় না — ছোট করে নিতে হয় (গতি) */
  VECTOR_MAX_SIDE: 2048,

  /** উপলব্ধ উজ্জ্বলতা — kmz-fx.luma এর অনুরূপ */
  luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; },

  /* ==================== ১. থ্রেশহোল্ড ==================== */

  /**
   * RGBA বাইট → বাইনারি মাস্ক (১ = কালি, ০ = কাগজ)
   *
   * স্বচ্ছ পিক্সেল কাগজ ধরা হয় — ব্যাকগ্রাউন্ড মোছা ছবি সরাসরি চলে।
   *
   * @param {Uint8ClampedArray|Uint8Array} data  RGBA, দৈর্ঘ্য = w×h×4
   * @param {number} w
   * @param {number} h
   * @param {{threshold?:number}} [opts]
   * @returns {Uint8Array} দৈর্ঘ্য w×h
   */
  toMask(data, w, h, opts) {
    const W = Number(w) | 0, H = Number(h) | 0;
    if (!(W > 0) || !(H > 0)) throw new Error('ছবির প্রস্থ ও উচ্চতা লাগবে');
    if (!data || data.length < W * H * 4) throw new Error('RGBA ডেটা ছোট পড়ে গেছে');
    const o = opts || {};
    const th = Math.max(0, Math.min(255,
      o.threshold == null ? this.DEFAULT_THRESHOLD : Number(o.threshold)));

    const mask = new Uint8Array(W * H);
    for (let i = 0, p = 0; p < W * H; p++, i += 4) {
      // স্বচ্ছ হলে কাগজ — নইলে মোছা পটভূমিও কালি ধরা পড়ত
      if (data[i + 3] < 128) continue;
      if (Math.round(this.luma(data[i], data[i + 1], data[i + 2])) < th) mask[p] = 1;
    }
    return mask;
  },

  /* ==================== ২. ফুটকি সরানো ==================== */

  /**
   * ছোট বিচ্ছিন্ন দাগ বাদ — স্ক্যানের ময়লা, ছাপার ফুটকি, অক্ষরের বিন্দু
   *
   * ৮-প্রতিবেশী যুক্ত অংশ গুনে minArea এর ছোট হলে মুছে দেয়।
   * স্ট্যাক দিয়ে flood fill — রিকার্শনে বড় ছবিতে স্ট্যাক উপচে যায়।
   *
   * @returns {{removed:number, kept:number}}
   */
  despeckle(mask, w, h, minArea) {
    const W = w | 0, H = h | 0;
    const min = Math.max(1, Number(minArea) || 1);
    if (min <= 1) return { removed: 0, kept: 0 };

    const seen = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    // ★ কেবল min সংখ্যক পিক্সেল মনে রাখলেই চলে — এতে পৌঁছে গেলে অংশটা
    //   রাখা হবেই, তাই আর মনে রাখার দরকার নেই। নইলে পুরো নকশার একটাই
    //   বড় অংশে লক্ষ লক্ষ সূচক জমে স্মৃতি খেয়ে ফেলত।
    const list = new Int32Array(min);
    let removed = 0, kept = 0;

    for (let s = 0; s < W * H; s++) {
      if (!mask[s] || seen[s]) continue;
      let sp = 0, n = 0;
      stack[sp++] = s; seen[s] = 1;
      while (sp > 0) {
        const p = stack[--sp];
        if (n < min) list[n] = p;
        n++;
        const x = p % W, y = (p / W) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if ((dx | dy) === 0 || nx < 0 || nx >= W) continue;
            const q = ny * W + nx;
            if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
          }
        }
      }
      if (n < min) {
        for (let i = 0; i < n; i++) mask[list[i]] = 0;
        removed++;
      } else {
        kept++;
      }
    }
    return { removed, kept };
  },

  /* ==================== ৩. থিনিং (Zhang–Suen) ==================== */

  /**
   * রেখা ১ পিক্সেল চওড়া কঙ্কালে নামানো
   *
   * Zhang–Suen: প্রতি চক্রে দুই উপ-ধাপ, প্রতিটিতে শর্ত মিলে গেলে
   * সীমানার পিক্সেল বাদ। রেখা ছিঁড়বে না — সংযোগ-সংখ্যা (A) দেখে
   * নিশ্চিত করা হয়।
   *
   * @returns {{iterations:number, removed:number}}
   */
  thin(mask, w, h, maxIter) {
    const W = w | 0, H = h | 0;
    const lim = Math.max(1, Number(maxIter) || 60);
    const kill = [];
    let iterations = 0, removed = 0;

    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : mask[y * W + x];

    for (let it = 0; it < lim; it++) {
      let changedAny = false;
      for (let step = 0; step < 2; step++) {
        kill.length = 0;
        for (let y = 1; y < H - 1; y++) {
          for (let x = 1; x < W - 1; x++) {
            if (!mask[y * W + x]) continue;
            // ঘড়ির কাঁটার ক্রমে আট প্রতিবেশী: P2 উপরে থেকে শুরু
            const p2 = at(x, y - 1),     p3 = at(x + 1, y - 1);
            const p4 = at(x + 1, y),     p5 = at(x + 1, y + 1);
            const p6 = at(x, y + 1),     p7 = at(x - 1, y + 1);
            const p8 = at(x - 1, y),     p9 = at(x - 1, y - 1);

            const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (B < 2 || B > 6) continue;

            // A = ০→১ পরিবর্তনের সংখ্যা; ১ না হলে কাটলে রেখা ছিঁড়বে
            let A = 0;
            const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
            for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) A++;
            if (A !== 1) continue;

            if (step === 0) {
              if (p2 * p4 * p6 !== 0) continue;
              if (p4 * p6 * p8 !== 0) continue;
            } else {
              if (p2 * p4 * p8 !== 0) continue;
              if (p2 * p6 * p8 !== 0) continue;
            }
            kill.push(y * W + x);
          }
        }
        for (let i = 0; i < kill.length; i++) mask[kill[i]] = 0;
        removed += kill.length;
        if (kill.length) changedAny = true;
      }
      iterations = it + 1;
      if (!changedAny) break;
    }
    return { iterations, removed };
  },

  /* ==================== ৪. কঙ্কাল → পলিলাইন ==================== */

  /** কোনো পিক্সেলের ৮-প্রতিবেশীর সূচক (কালি হলে) */
  _neighbors(mask, W, H, p, out) {
    out.length = 0;
    const x = p % W, y = (p / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if ((dx | dy) === 0 || nx < 0 || nx >= W) continue;
        const q = ny * W + nx;
        if (mask[q]) out.push(q);
      }
    }
    return out;
  },

  /**
   * কঙ্কাল হেঁটে পলিলাইন বের করা
   *
   * প্রান্তবিন্দু (১ প্রতিবেশী) ও শাখাবিন্দু (৩+ প্রতিবেশী) থেকে শুরু
   * করে সরল অংশ ধরে হাঁটা হয়। যা বাকি থাকে সেগুলো বদ্ধ লুপ — তাদের
   * যেকোনো জায়গা থেকে শুরু।
   *
   * @returns {Array<Array<{x:number,y:number}>>}
   */
  tracePaths(mask, w, h, opts) {
    const W = w | 0, H = h | 0;
    const o = opts || {};
    const minLen = Math.max(2, Number(o.minPoints) || 2);
    const used = new Uint8Array(W * H);     // ব্যবহৃত *পিক্সেল* নয়, ধার
    const deg = new Uint8Array(W * H);
    const nb = [];
    const paths = [];

    const ends = [];
    for (let p = 0; p < W * H; p++) {
      if (!mask[p]) continue;
      const d = this._neighbors(mask, W, H, p, nb).length;
      deg[p] = d;
      if (d === 1 || d >= 3) ends.push(p);
    }

    // ধার চিহ্নিত করতে "কোন জোড়া ব্যবহার হয়েছে" — ছোট Set যথেষ্ট
    const edge = new Set();
    const key = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;

    const walk = start => {
      this._neighbors(mask, W, H, start, nb);
      const first = nb.slice();
      for (const nx of first) {
        if (edge.has(key(start, nx))) continue;
        const pts = [{ x: start % W, y: (start / W) | 0 }];
        let prev = start, cur = nx;
        edge.add(key(prev, cur));
        for (;;) {
          pts.push({ x: cur % W, y: (cur / W) | 0 });
          if (deg[cur] !== 2) break;                 // প্রান্ত বা শাখা — থামো
          this._neighbors(mask, W, H, cur, nb);
          let next = -1;
          for (const q of nb) if (q !== prev) { next = q; break; }
          if (next < 0 || edge.has(key(cur, next))) break;
          edge.add(key(cur, next));
          prev = cur; cur = next;
        }
        if (pts.length >= minLen) paths.push(pts);
      }
    };

    for (const s of ends) walk(s);

    // যা বাকি — সব বিন্দুর ডিগ্রি ২, অর্থাৎ বদ্ধ লুপ
    for (let p = 0; p < W * H; p++) {
      if (!mask[p] || deg[p] !== 2) continue;
      this._neighbors(mask, W, H, p, nb);
      let fresh = false;
      for (const q of nb) if (!edge.has(key(p, q))) { fresh = true; break; }
      if (fresh) walk(p);
    }

    return paths;
  },

  /* ==================== ৫. সরলীকরণ ==================== */

  /** বিন্দু থেকে রেখাংশের লম্ব দূরত্ব */
  _perpDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d2 = dx * dx + dy * dy;
    if (d2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / d2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  },

  /**
   * Douglas–Peucker — আকৃতি রেখে বিন্দু কমানো
   *
   * রিকার্শন নয়, স্ট্যাক — লম্বা পথে কল-স্ট্যাক উপচে যেতে পারে।
   *
   * @param {Array<{x,y}>} pts
   * @param {number} tol  সহনীয় সর্বোচ্চ বিচ্যুতি (পিক্সেলে)
   */
  simplify(pts, tol) {
    if (!Array.isArray(pts) || pts.length < 3) return (pts || []).slice();
    const t = Math.max(0, Number(tol) || 0);
    if (t === 0) return pts.slice();

    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let far = -1, fd = t;
      for (let i = a + 1; i < b; i++) {
        const d = this._perpDist(pts[i], pts[a], pts[b]);
        if (d > fd) { fd = d; far = i; }
      }
      if (far > 0) {
        keep[far] = 1;
        stack.push([a, far], [far, b]);
      }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
    return out;
  },

  /* ==================== ৬. ভূ-রূপান্তর ==================== */

  /**
   * পিক্সেল পথ → ভূ-স্থানাঙ্ক
   *
   * @param {Array<Array<{x,y}>>} paths  মাস্ক-স্থানের বিন্দু
   * @param {function(number,number):{lat,lng}} toGeo  solveTransform এর
   * @param {number} [scale=1]  মাস্ক ছোট করা হলে মূল পিক্সেলে ফেরানোর গুণক
   */
  toGeoPaths(paths, toGeo, scale) {
    if (typeof toGeo !== 'function') throw new Error('toGeo ফাংশন লাগবে');
    const s = Number(scale) > 0 ? Number(scale) : 1;
    return (paths || []).map(pts =>
      pts.map(p => toGeo(p.x * s, p.y * s)));
  },

  /* ==================== সব একসাথে ==================== */

  /**
   * RGBA ছবি → সরলীকৃত পিক্সেল-পথ
   *
   * @param {Uint8ClampedArray|Uint8Array} data
   * @param {number} w
   * @param {number} h
   * @param {object} [opts]
   *   threshold  : কালি চেনার সীমা (ডিফল্ট ২০৫)
   *   minSpeck   : এর ছোট বিচ্ছিন্ন দাগ বাদ (ডিফল্ট ১২ পিক্সেল)
   *   tolerance  : সরলীকরণের সহনশীলতা (ডিফল্ট ১.২ পিক্সেল)
   *   minPoints  : এর কম বিন্দুর পথ বাদ (ডিফল্ট ৩)
   * @returns {{paths, stats}}
   */
  vectorize(data, w, h, opts) {
    const o = opts || {};
    const t0 = Date.now();
    const mask = this.toMask(data, w, h, o);

    let ink = 0;
    for (let i = 0; i < mask.length; i++) ink += mask[i];

    const sp = this.despeckle(mask, w, h, o.minSpeck == null ? 12 : o.minSpeck);
    const th = this.thin(mask, w, h, o.maxIter);
    const raw = this.tracePaths(mask, w, h, { minPoints: o.minPoints || 3 });

    const tol = o.tolerance == null ? 1.2 : Number(o.tolerance);
    const paths = [];
    let before = 0, after = 0;
    for (const p of raw) {
      before += p.length;
      const s = this.simplify(p, tol);
      // ★ minPoints কেবল **কাঁচা** পথে খাটে (tracePaths এ) — সরলীকরণের
      //   পরে নয়। সোজা রেখা ঠিকভাবে ২ বিন্দুতে নামে; সেটাই কাঙ্ক্ষিত ফল,
      //   বাদ দেওয়ার কারণ নয়।
      if (s.length >= 2) { paths.push(s); after += s.length; }
    }

    return {
      paths,
      stats: {
        inkPixels: ink,
        specksRemoved: sp.removed,
        thinIterations: th.iterations,
        rawPaths: raw.length,
        paths: paths.length,
        pointsBefore: before,
        pointsAfter: after,
        ms: Date.now() - t0
      }
    };
  },

  /** ছবি ছোট করতে হবে কি না — গতি ও স্মৃতির জন্য */
  vectorFit(w, h, maxSide) {
    const W = Number(w), H = Number(h);
    if (!(W > 0) || !(H > 0)) throw new Error('ছবির প্রস্থ ও উচ্চতা লাগবে');
    const cap = Number(maxSide) > 0 ? Number(maxSide) : this.VECTOR_MAX_SIDE;
    const big = Math.max(W, H);
    if (big <= cap) return { resized: false, scale: 1, width: Math.round(W), height: Math.round(H) };
    const k = cap / big;
    return { resized: true, scale: k,
             width: Math.max(1, Math.round(W * k)),
             height: Math.max(1, Math.round(H * k)) };
  }
};

/* Node এ টেস্টের জন্য */
if (typeof module !== 'undefined' && module.exports) module.exports = MapVector;
