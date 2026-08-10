/* ==========================================================================
   kmz-export.js — মৌজা ম্যাপ → Google Earth (KMZ) এক্সপোর্ট
   --------------------------------------------------------------------------
   স্ক্যান করা মৌজা ম্যাপের ছবিকে স্যাটেলাইট ছবির সাথে মিলিয়ে (ক্যালিব্রেট করে)
   একটি KMZ ফাইল বানায়, যা Google Earth এ খোলা যায়।

   ★ কোনো বাইরের লাইব্রেরি লাগে না
     KMZ আসলে ZIP — এখানে হাতেই ZIP লেখা হয়েছে (stored, কম্প্রেশন ছাড়া,
     যা ZIP মানে সম্পূর্ণ বৈধ) সাথে নিজস্ব CRC32।

   ★ কেন gx:LatLonQuad, LatLonBox নয়
     <LatLonBox> অক্ষ-সমান্তরাল আয়তক্ষেত্র (উত্তর/দক্ষিণ/পূর্ব/পশ্চিম + ঘূর্ণন)।
     স্ক্যান করা পুরনো মৌজা ম্যাপ প্রায়ই বাঁকা ও তির্যক (skew) থাকে — বাক্সে
     মেলে না। <gx:LatLonQuad> এ চারটি কোণা আলাদা করে বসানো যায়, তাই
     তির্যক ছবিও সঠিক জায়গায় বসে।

   ★ কোন মডেলে বসানো হয়
     ডিফল্ট **similarity** — স্কেল + ঘূর্ণন + সরণ। মৌজা নকশা কাগজে ছাপা,
     সে তির্যক হয় না; তাই এই মডেলই বাস্তবসম্মত।
     **affine** (তির্যকতাও ধরে) কেবল তখনই নেওয়া হয় যখন leave-one-out
     যাচাইয়ে সে না-দেখা বিন্দুতেও ১০%+ ভালো করে — অর্থাৎ স্ক্যানে সত্যিই
     টান-বিকৃতি আছে। নইলে সে ক্লিকের ভুলটুকুই তির্যকতায় শুষে নেয়:
     অবশিষ্ট ত্রুটি ০ দেখায়, অথচ বিন্দুর বাইরে ম্যাপ মিটার-মিটার সরে।

   ★ কোন সংখ্যাটা বিশ্বাস করবেন
     `rmse` = নিয়ন্ত্রণ বিন্দুতেই কত ভুল — বিন্দু কম হলে এটা **আপনাআপনি ০**।
     `looRmse` = না-দেখা বিন্দুতে কত ভুল — ম্যাপ কতটা মিলবে তার আসল মাপ।
     `dof ≤ 0` হলে rmse এর কোনো অর্থ নেই, তখন `exact: true` জানিয়ে দেয়।

   DOM ছোঁয় না — Node এ টেস্ট করা যায় (tests/kmz-test.js)।
   ========================================================================== */

const KmzExport = {

  /* ==================== ১. CRC32 (ZIP এর বাধ্যতামূলক অংশ) ==================== */

  _crcTable: null,

  crcTable() {
    if (this._crcTable) return this._crcTable;
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    this._crcTable = t;
    return t;
  },

  /** বাইট-অ্যারের CRC32 (unsigned) */
  crc32(bytes) {
    const t = this.crcTable();
    let c = -1;
    for (let i = 0; i < bytes.length; i++) c = (c >>> 8) ^ t[(c ^ bytes[i]) & 0xFF];
    return (c ^ -1) >>> 0;
  },

  /* ==================== ২. ZIP লেখক (stored) ==================== */

  /** ছোট বাইট-বাফার লেখক — little endian */
  _writer() {
    const parts = [];
    let len = 0;
    return {
      u16(v) { parts.push(Uint8Array.from([v & 255, (v >>> 8) & 255])); len += 2; },
      u32(v) {
        parts.push(Uint8Array.from([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]));
        len += 4;
      },
      raw(b) { parts.push(b); len += b.length; },
      get length() { return len; },
      done() {
        const out = new Uint8Array(len);
        let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
      }
    };
  },

  /** UTF-8 বাইটে রূপান্তর (ব্রাউজার ও Node দুটোতেই চলে) */
  utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    return Uint8Array.from(Buffer.from(str, 'utf8'));      // Node fallback
  },

  /**
   * ZIP আর্কাইভ বানায় — কম্প্রেশন ছাড়া (method 0 = stored)
   * @param {Array<{name:string, data:Uint8Array}>} files
   * @returns {Uint8Array}
   */
  zip(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('ZIP এ অন্তত একটি ফাইল লাগবে');
    }
    const out = this._writer();
    const central = [];

    for (const f of files) {
      if (!f || !f.name || !f.data) throw new Error('ফাইলের নাম ও ডেটা দুটোই লাগবে');
      const nameBytes = this.utf8(f.name);
      const crc = this.crc32(f.data);
      const offset = out.length;

      out.u32(0x04034b50);                       // local file header signature
      out.u16(20);                               // version needed
      out.u16(0x0800);                           // flag: নাম UTF-8
      out.u16(0);                                // method 0 = stored
      out.u16(0); out.u16(0);                    // সময় ও তারিখ (০ — নির্ধারক ফল)
      out.u32(crc);
      out.u32(f.data.length);                    // compressed size
      out.u32(f.data.length);                    // uncompressed size
      out.u16(nameBytes.length);
      out.u16(0);                                // extra field length
      out.raw(nameBytes);
      out.raw(f.data);

      central.push({ nameBytes, crc, size: f.data.length, offset });
    }

    const cdStart = out.length;
    for (const c of central) {
      out.u32(0x02014b50);                       // central directory signature
      out.u16(20); out.u16(20);                  // version made by / needed
      out.u16(0x0800); out.u16(0);               // flag / method
      out.u16(0); out.u16(0);                    // সময় / তারিখ
      out.u32(c.crc); out.u32(c.size); out.u32(c.size);
      out.u16(c.nameBytes.length);
      out.u16(0); out.u16(0);                    // extra / comment
      out.u16(0); out.u16(0); out.u32(0);        // disk / attrs
      out.u32(c.offset);
      out.raw(c.nameBytes);
    }
    const cdSize = out.length - cdStart;

    out.u32(0x06054b50);                         // end of central directory
    out.u16(0); out.u16(0);
    out.u16(central.length); out.u16(central.length);
    out.u32(cdSize); out.u32(cdStart);
    out.u16(0);                                  // comment length

    return out.done();
  },

  /* ==================== ৩. ভূ-স্থানাঙ্কের গণিত ==================== */

  /**
   * এক ডিগ্রি অক্ষাংশ কত মিটার (উপবৃত্তাকার পৃথিবীর সূত্র)
   * উৎস: WGS-84 এর প্রচলিত সন্নিকট সূত্র
   */
  metersPerDegLat(lat) {
    const r = lat * Math.PI / 180;
    return 111132.92 - 559.82 * Math.cos(2 * r) + 1.175 * Math.cos(4 * r)
           - 0.0023 * Math.cos(6 * r);
  },

  /** এক ডিগ্রি দ্রাঘিমাংশ কত মিটার (অক্ষাংশভেদে বদলায়) */
  metersPerDegLng(lat) {
    const r = lat * Math.PI / 180;
    return 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r) + 0.118 * Math.cos(5 * r);
  },

  /**
   * নিয়ন্ত্রণ বিন্দু থেকে পিক্সেল → ভূ-স্থানাঙ্ক রূপান্তর বের করে
   *
   * মডেল (স্থানীয় সমতল মিটার কাঠামোয়, ছবির y নিচমুখী বলে উল্টানো):
   *     E = a·px + b·(−py) + c        (পূর্বমুখী মিটার)
   *     N = d·px + e·(−py) + f        (উত্তরমুখী মিটার)
   *
   * ডিফল্ট similarity (a=e, b=−d) — স্কেল, ঘূর্ণন, সরণ; তির্যকতা নয়।
   * affine কেবল তখনই, যখন leave-one-out যাচাইয়ে সে স্পষ্ট ভালো করে।
   *
   * @param {Array<{px:number, py:number, lat:number, lng:number}>} pts
   * @param {{model?: 'auto'|'similarity'|'affine'}} [opts]
   * @returns {{mode, toGeo, residuals, rmse, maxError, looRmse, dof, exact,
   *            shearDeg, aspect, scale, rotationDeg}}
   */
  solveTransform(pts, opts) {
    if (!Array.isArray(pts) || pts.length < 2) {
      throw new Error('অন্তত ২টি নিয়ন্ত্রণ বিন্দু দিতে হবে');
    }
    for (const p of pts) {
      if (!isFinite(p.px) || !isFinite(p.py) || !isFinite(p.lat) || !isFinite(p.lng)) {
        throw new Error('নিয়ন্ত্রণ বিন্দুতে অবৈধ সংখ্যা আছে');
      }
      if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
        throw new Error('অক্ষাংশ/দ্রাঘিমাংশ সীমার বাইরে');
      }
    }

    // স্থানীয় সমতল কাঠামোর কেন্দ্র
    const latRef = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lngRef = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    const mLat = this.metersPerDegLat(latRef);
    const mLng = this.metersPerDegLng(latRef);

    const toM = p => ({ E: (p.lng - lngRef) * mLng, N: (p.lat - latRef) * mLat });
    const P = pts.map(p => ({ x: p.px, y: -p.py, ...toM(p) }));   // y উল্টানো

    /* ── মডেল বাছাই ───────────────────────────────────────────────
       ডিফল্ট similarity। কারণ মৌজা নকশা কাগজে ছাপা — সে **তির্যক হয় না**।
       ৩ বিন্দুতে affine নিলে ক্লিকের সামান্য ভুলটুকুও তির্যকতা ও অসম
       স্কেলে শুষে নেয়, অবশিষ্ট ত্রুটি ০ দেখায়, অথচ নিয়ন্ত্রণ বিন্দুর
       বাইরে ম্যাপ মিটার-মিটার সরে যায় (জুম করলে যা চোখে পড়ে)।
       affine তখনই নেওয়া হয় যখন সে **না-দেখা বিন্দুতেও** স্পষ্ট ভালো —
       অর্থাৎ স্ক্যানে সত্যিই টান-বিকৃতি আছে।                        */
    const want = (opts && opts.model) || 'auto';
    const simP = this._fitSimilarity(P, -1);
    if (!simP) throw new Error('দুটি নিয়ন্ত্রণ বিন্দু একই পিক্সেলে বসেছে');
    const affP = P.length >= 3 ? this._fitAffine(P, -1) : null;

    let prm, mode, looSim = null, looAff = null;
    if (want === 'similarity') {
      prm = simP; mode = 'similarity';
    } else if (want === 'affine') {
      if (!affP) throw new Error('নিয়ন্ত্রণ বিন্দুগুলো এক সরলরেখায় — ভিন্ন জায়গায় বসান');
      prm = affP; mode = 'affine';
    } else {
      looSim = this._looError(P, i => this._fitSimilarity(P, i));
      looAff = affP ? this._looError(P, i => this._fitAffine(P, i)) : Infinity;
      // ★ ১০% এর বেশি ভালো না হলে বাড়তি স্বাধীনতা দেওয়া হবে না —
      //   সামান্য উন্নতি প্রায় সবসময়ই ক্লিকের ভুল শুষে নেওয়ার ফল
      if (isFinite(looAff) && looAff < looSim * 0.9) { prm = affP; mode = 'affine'; }
      else { prm = simP; mode = 'similarity'; }
    }
    const { a, b, c, d, e, f } = prm;

    const toGeo = (px, py) => {
      const x = px, y = -py;
      const E = a * x + b * y + c;
      const N = d * x + e * y + f;
      return { lng: lngRef + E / mLng, lat: latRef + N / mLat };
    };

    // প্রতিটি নিয়ন্ত্রণ বিন্দুর অবশিষ্ট ত্রুটি (মিটারে)
    const residuals = pts.map((p, i) => {
      const g = toGeo(p.px, p.py);
      const dE = (g.lng - p.lng) * mLng;
      const dN = (g.lat - p.lat) * mLat;
      return { index: i, meters: Math.hypot(dE, dN) };
    });
    const rmse = Math.sqrt(residuals.reduce((s, r) => s + r.meters * r.meters, 0) / residuals.length);
    const maxError = residuals.reduce((m, r) => Math.max(m, r.meters), 0);

    // মানব-পাঠযোগ্য স্কেল ও ঘূর্ণন (a,d থেকে)
    const scale = Math.hypot(a, d);                       // মিটার প্রতি পিক্সেল
    const rotationDeg = Math.atan2(d, a) * 180 / Math.PI;

    /* ── কতটা বিশ্বাস করা যায় ──────────────────────────────────────
       dof = পর্যবেক্ষণ − অজানা। ০ বা তার কম হলে ফিট বিন্দুগুলোর ভেতর
       দিয়ে **বাধ্য হয়ে** যায়, তাই rmse ০ আসে — সেটা নিখুঁত হওয়ার
       প্রমাণ নয়, কেবল যাচাই করার মতো কিছু বাকি নেই তার প্রমাণ।    */
    const nParam = mode === 'affine' ? 6 : 4;
    const dof = 2 * pts.length - nParam;
    const dist = this._distortion(prm);

    // চূড়ান্ত মডেলের leave-one-out ত্রুটি — না-দেখা বিন্দুতে কত ভুল
    const looRmse = this._looError(P, i =>
      mode === 'affine' ? this._fitAffine(P, i) : this._fitSimilarity(P, i));

    return { mode, toGeo, residuals, rmse, maxError, scale, rotationDeg,
             // ★ rmse নয় — এটাই বিশ্বাসযোগ্য সংখ্যা (না-দেখা বিন্দুতে ত্রুটি)
             looRmse: isFinite(looRmse) ? looRmse : null,
             looSim: isFinite(looSim) ? looSim : null,
             looAff: isFinite(looAff) ? looAff : null,
             dof, exact: dof <= 0,
             shearDeg: dist.shearDeg, aspect: dist.aspect,
             params: { a, b, c, d, e, f }, latRef, lngRef };
  },

  /**
   * similarity ফিট — স্কেল + ঘূর্ণন + সরণ (৪ প্যারামিটার), least-squares
   *
   * জটিল সংখ্যায় লিখলে: (E + iN) = w·(x + iy) + t, যেখানে w = s·e^{iθ}।
   * কেন্দ্রে সরিয়ে নিলে t বাদ যায়, আর w = Σ z̄·ζ / Σ|z|²।
   * তির্যকতা বা অসম স্কেল এতে **থাকতেই পারে না** — কাগজের নকশার জন্য
   * ঠিক এটাই দরকার।
   *
   * @param {Array} P      {x, y, E, N} — কেন্দ্রীকৃত মিটার কাঠামোয়
   * @param {number} skip  যে সূচকটি বাদ দিতে হবে (−১ হলে কিছুই না)
   */
  _fitSimilarity(P, skip) {
    let n = 0, mx = 0, my = 0, mE = 0, mN = 0;
    for (let i = 0; i < P.length; i++) {
      if (i === skip) continue;
      n++; mx += P[i].x; my += P[i].y; mE += P[i].E; mN += P[i].N;
    }
    if (n < 2) return null;
    mx /= n; my /= n; mE /= n; mN /= n;

    let re = 0, im = 0, den = 0;
    for (let i = 0; i < P.length; i++) {
      if (i === skip) continue;
      const x = P[i].x - mx, y = P[i].y - my;
      const E = P[i].E - mE, N = P[i].N - mN;
      re += E * x + N * y;
      im += N * x - E * y;
      den += x * x + y * y;
    }
    if (den < 1e-12) return null;            // সব বিন্দু কার্যত এক জায়গায়

    const a = re / den, d = im / den;
    return { a: a, b: -d, c: mE - (a * mx - d * my),
             d: d, e: a,  f: mN - (d * mx + a * my) };
  },

  /** পূর্ণ affine ফিট — ৬ প্যারামিটার, least-squares */
  _fitAffine(P, skip) {
    let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, n = 0;
    let sxE = 0, syE = 0, sE = 0, sxN = 0, syN = 0, sN = 0;
    for (let i = 0; i < P.length; i++) {
      if (i === skip) continue;
      const p = P[i];
      n++;
      sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y;
      sx += p.x; sy += p.y;
      sxE += p.x * p.E; syE += p.y * p.E; sE += p.E;
      sxN += p.x * p.N; syN += p.y * p.N; sN += p.N;
    }
    if (n < 3) return null;
    const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
    const s1 = this._solve3(M, [sxE, syE, sE]);
    const s2 = this._solve3(M, [sxN, syN, sN]);
    if (!s1 || !s2) return null;             // বিন্দুগুলো এক সরলরেখায়
    return { a: s1[0], b: s1[1], c: s1[2], d: s2[0], e: s2[1], f: s2[2] };
  },

  /**
   * Leave-one-out যাচাই — **যে বিন্দুটা ফিটে ছিল না** সেখানে কত ভুল হয়।
   *
   * এটাই আসল প্রশ্ন: নিয়ন্ত্রণ বিন্দুর *বাইরে* ম্যাপ কতটা মিলবে।
   * সাধারণ অবশিষ্ট ত্রুটি (rmse) এই প্রশ্নের উত্তর দেয় না — ৩ বিন্দুতে
   * affine এর ৬টি অজানা আর ৬টি সমীকরণ, তাই ত্রুটি *সবসময়* ০ আসে,
   * ম্যাপ যতই বাঁকা বসুক।
   *
   * @returns {number} মিটারে RMS, ফিট না হলে Infinity
   */
  _looError(P, fit) {
    let s = 0, n = 0;
    for (let i = 0; i < P.length; i++) {
      const p = fit(i);
      if (!p) return Infinity;
      const dE = (p.a * P[i].x + p.b * P[i].y + p.c) - P[i].E;
      const dN = (p.d * P[i].x + p.e * P[i].y + p.f) - P[i].N;
      s += dE * dE + dN * dN;
      n++;
    }
    return n ? Math.sqrt(s / n) : Infinity;
  },

  /** রূপান্তরে কতটা তির্যকতা ও অসম স্কেল ঢুকেছে */
  _distortion(p) {
    const c1 = Math.hypot(p.a, p.d), c2 = Math.hypot(p.b, p.e);
    if (!(c1 > 0) || !(c2 > 0)) return { shearDeg: 0, aspect: 1 };
    const cosang = (p.a * p.b + p.d * p.e) / (c1 * c2);
    const ang = Math.acos(Math.max(-1, Math.min(1, cosang))) * 180 / Math.PI;
    return { shearDeg: 90 - ang, aspect: c2 / c1 };
  },

  /** ৩×৩ রৈখিক সমীকরণ (Gaussian elimination + আংশিক পিভটিং) */
  _solve3(M, v) {
    const A = [[M[0][0], M[0][1], M[0][2], v[0]],
               [M[1][0], M[1][1], M[1][2], v[1]],
               [M[2][0], M[2][1], M[2][2], v[2]]];
    for (let i = 0; i < 3; i++) {
      let piv = i;
      for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      if (Math.abs(A[piv][i]) < 1e-12) return null;        // অনন্য সমাধান নেই
      [A[i], A[piv]] = [A[piv], A[i]];
      for (let r = 0; r < 3; r++) {
        if (r === i) continue;
        const k = A[r][i] / A[i][i];
        for (let cIdx = i; cIdx < 4; cIdx++) A[r][cIdx] -= k * A[i][cIdx];
      }
    }
    return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
  },

  /**
   * ছবির চার কোণার ভূ-স্থানাঙ্ক — gx:LatLonQuad এর ক্রমে
   * ক্রম: নিচ-বাম → নিচ-ডান → উপর-ডান → উপর-বাম (ঘড়ির উল্টো দিকে)
   */
  imageCorners(transform, width, height) {
    if (!(width > 0) || !(height > 0)) throw new Error('ছবির প্রস্থ ও উচ্চতা লাগবে');
    return [
      transform.toGeo(0, height),
      transform.toGeo(width, height),
      transform.toGeo(width, 0),
      transform.toGeo(0, 0)
    ];
  },

  /* ==================== ৪. KML ==================== */

  /** XML এ নিরাপদ করা */
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  },

  /**
   * GroundOverlay সহ KML
   * @param {string} name       ম্যাপের নাম
   * @param {string} imgName    ZIP এর ভেতরে ছবির নাম
   * @param {Array}  corners    imageCorners() এর ফল
   * @param {object} opts       { opacity: 0–1, description }
   */
  buildKml(name, imgName, corners, opts) {
    const o = opts || {};
    const hasImg = !!imgName;
    const paths = Array.isArray(o.vectorPaths) ? o.vectorPaths : null;
    if (!hasImg && !(paths && paths.length)) {
      throw new Error('ছবি অথবা ভেক্টর রেখা — অন্তত একটি লাগবে');
    }
    if (hasImg && (!Array.isArray(corners) || corners.length !== 4)) {
      throw new Error('চারটি কোণা লাগবে');
    }

    let body = '';

    if (hasImg) {
      const alpha = Math.round(Math.min(1, Math.max(0, o.opacity == null ? 0.78 : o.opacity)) * 255);
      const color = alpha.toString(16).padStart(2, '0') + 'ffffff';   // aabbggrr
      const coords = corners
        .map(p => `${p.lng.toFixed(10)},${p.lat.toFixed(10)},0`)
        .join(' ');
      body += `
    <GroundOverlay>
      <name>${this.esc(name)}</name>
      <description>${this.esc(o.description || 'Land Info — মৌজা ম্যাপ')}</description>
      <color>${color}</color>
      <drawOrder>1</drawOrder>
      <Icon><href>${this.esc(imgName)}</href></Icon>
      <gx:LatLonQuad><coordinates>${coords}</coordinates></gx:LatLonQuad>
    </GroundOverlay>`;
    }

    if (paths && paths.length) {
      // ★ হাজারো Placemark দিলে Google Earth হামাগুড়ি দেয়। সব রেখা এক
      //   Placemark এর <MultiGeometry> তে রাখলে অনেক দ্রুত, ফাইলও ছোট।
      const segs = [];
      for (const p of paths) {
        if (!Array.isArray(p) || p.length < 2) continue;
        // ★ ৭ দশমিক ≈ ১ সেন্টিমিটার — নকশার জন্য যথেষ্ট, আর ১০ দশমিকের
        //   চেয়ে ফাইল প্রায় এক-তৃতীয়াংশ ছোট
        const c = p.map(g => `${g.lng.toFixed(7)},${g.lat.toFixed(7)},0`).join(' ');
        segs.push(`<LineString><tessellate>1</tessellate><coordinates>${c}</coordinates></LineString>`);
      }
      if (!segs.length && !hasImg) throw new Error('আঁকার মতো কোনো রেখা পাওয়া যায়নি');
      if (segs.length) {
        body += `
    <Placemark>
      <name>${this.esc(o.lineName || 'মৌজার রেখা')}</name>
      <styleUrl>#li-line</styleUrl>
      <MultiGeometry>${segs.join('')}</MultiGeometry>
    </Placemark>`;
      }
    }

    const style = paths && paths.length
      ? `
    <Style id="li-line">
      <LineStyle>
        <color>${this.kmlColor(o.lineColor || '#ff0000', o.lineOpacity)}</color>
        <width>${Number(o.lineWidth) > 0 ? Number(o.lineWidth) : 1.4}</width>
      </LineStyle>
    </Style>`
      : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>${this.esc(name)}</name>
    <open>1</open>${style}${body}
  </Document>
</kml>`;
  },

  /**
   * '#rrggbb' → KML এর `aabbggrr`
   * ★ KML এ রঙের ক্রম উল্টো (নীল আগে, লাল শেষে) — এটা ভুল করা খুব সহজ
   */
  kmlColor(hex, opacity) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    const rgb = m ? m[1].toLowerCase() : 'ff0000';
    const a = Math.round(Math.min(1, Math.max(0,
      opacity == null ? 1 : Number(opacity))) * 255);
    return a.toString(16).padStart(2, '0')
      + rgb.slice(4, 6) + rgb.slice(2, 4) + rgb.slice(0, 2);
  },

  /* ==================== ৫. পূর্ণ KMZ ==================== */

  /**
   * সব একসাথে — KMZ বাইট ফেরত দেয়
   * @param {object} o { imageBytes, imageName, width, height, points, name, opacity }
   * @returns {{ bytes:Uint8Array, transform, corners, kml }}
   */
  build(o) {
    const hasImg = !!(o && o.imageBytes && o.imageBytes.length);
    const paths = o && Array.isArray(o.vectorPaths) ? o.vectorPaths : null;
    if (!hasImg && !(paths && paths.length)) {
      throw new Error('ম্যাপের ছবি অথবা ভেক্টর রেখা লাগবে');
    }
    const imgName = hasImg ? this.safeName(o.imageName || 'map.jpg') : null;
    const t = this.solveTransform(o.points);
    // ছবি না থাকলে চার কোণার দরকার নেই — ভেক্টরে নিজের স্থানাঙ্ক আছে
    const corners = hasImg ? this.imageCorners(t, o.width, o.height) : null;
    const kml = this.buildKml(o.name || 'মৌজা ম্যাপ', imgName, corners, {
      opacity: o.opacity, description: o.description,
      vectorPaths: paths, lineColor: o.lineColor, lineWidth: o.lineWidth,
      lineOpacity: o.lineOpacity, lineName: o.lineName
    });
    const files = [{ name: 'doc.kml', data: this.utf8(kml) }];
    if (hasImg) files.push({ name: imgName, data: o.imageBytes });
    const bytes = this.zip(files);
    return { bytes, transform: t, corners, kml };
  },

  /**
   * ZIP এর ভেতরে নিরাপদ ফাইলনাম
   * KML এর <href> এ বাংলা নাম দিলে কিছু রিডারে ভাঙে, তাই ASCII তে নামানো হয়।
   * বাংলা নাম পুরোটা বাদ পড়লে "map" ব্যবহার হয় — `RS-__.jpg` জাতীয়
   * কুৎসিত নাম যাতে না হয়।
   */
  safeName(n) {
    const base = String(n == null ? '' : n).split(/[\\/]/).pop() || '';
    // চেনা ছবির এক্সটেনশন থাকলে সেটাই, নইলে .jpg
    // (PDF থেকে রূপান্তরিত হলে ডেটা JPEG, তাই "x.pdf" → "x.jpg", "x.pdf.jpg" নয়)
    const ext = (base.match(/\.(jpe?g|png|gif|tiff?)$/i) || [])[0] || '.jpg';
    const stem = base
      .replace(/\.[A-Za-z0-9]{1,5}$/, '')    // যেকোনো এক্সটেনশন বাদ
      .replace(/[^A-Za-z0-9._-]+/g, '_')     // অ-ASCII ও ফাঁকা → এক আন্ডারস্কোর
      .replace(/_+/g, '_')                   // পরপর একাধিক → একটি
      .replace(/^[_.-]+|[_.-]+$/g, '');      // দুই প্রান্তের বিভাজক বাদ
    return (stem ? stem.slice(0, 60) : 'map') + ext.toLowerCase();
  },

  /**
   * Google Earth এর GroundOverlay একটাই টেক্সচার হিসেবে আঁকে। ছবি বড় হলে
   * সে টেক্সচার বানাতে না পেরে **লাল X** এঁকে দেয় — জ্যামিতি ঠিক থাকলেও।
   *
   * পুরনো গ্রাফিক্সে OpenGL এর নিশ্চিত সীমা ২০৪৮, আধুনিকে ৮১৯২–১৬৩৮৪।
   * ৪০৯৬ সব জায়গায় নিরাপদ, আর মৌজা নকশার জন্য যথেষ্ট বিস্তারিত —
   * ১ মাইল চওড়া মৌজায় এতে প্রতি পিক্সেল প্রায় ৪০ সেন্টিমিটার।
   */
  EARTH_MAX_SIDE: 4096,

  /**
   * রপ্তানির আগে ছবি ছোট করতে হবে কি না
   *
   * ★ ছোট করলেও নকশার **ভূ-সীমানা বদলায় না** — চার কোণা মূল পিক্সেল
   *   মাপ থেকেই হিসাব হয়, কারণ নিয়ন্ত্রণ বিন্দুগুলো ওই মাপেই বসানো।
   *   কেবল রাস্টারের রেজোলিউশন কমে।
   *
   * @param {number} w  মূল প্রস্থ (পিক্সেল)
   * @param {number} h  মূল উচ্চতা (পিক্সেল)
   * @param {number} [maxSide=EARTH_MAX_SIDE]
   * @returns {{resized:boolean, scale:number, width:number, height:number}}
   */
  earthFit(w, h, maxSide) {
    const W = Number(w), H = Number(h);
    if (!(W > 0) || !(H > 0)) throw new Error('ছবির প্রস্থ ও উচ্চতা লাগবে');
    const cap = Number(maxSide) > 0 ? Number(maxSide) : this.EARTH_MAX_SIDE;
    const big = Math.max(W, H);
    if (big <= cap) return { resized: false, scale: 1, width: Math.round(W), height: Math.round(H) };
    const scale = cap / big;
    return {
      resized: true,
      scale: scale,
      // ★ round নয়, floor+1 নয় — max() দিয়ে অন্তত ১ পিক্সেল রাখা হয়,
      //   নইলে খুব লম্বাটে ছবিতে ছোট দিকটা ০ হয়ে ক্যানভাস ভাঙে
      width: Math.max(1, Math.round(W * scale)),
      height: Math.max(1, Math.round(H * scale))
    };
  },

  /** ক্যালিব্রেশন কতটা ভালো — ব্যবহারকারীকে বোঝানোর জন্য */
  quality(rmse) {
    if (!isFinite(rmse)) return { level: 'unknown', label: 'অজানা' };
    if (rmse < 2)  return { level: 'great', label: 'চমৎকার' };
    if (rmse < 8)  return { level: 'good',  label: 'ভালো' };
    if (rmse < 25) return { level: 'ok',    label: 'মোটামুটি' };
    return { level: 'bad', label: 'দুর্বল — বিন্দু আবার বসান' };
  }
};

/* Node এ টেস্টের জন্য */
if (typeof module !== 'undefined' && module.exports) module.exports = KmzExport;
