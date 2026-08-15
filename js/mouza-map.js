/* ==========================================================================
   mouza-map.js — সারাদেশের মৌজা ম্যাপ আর্কাইভ
   --------------------------------------------------------------------------
   ইউজারের নিজের সংগ্রহ — ১,৯৪,৩১৭টি ম্যাপ ফাইল, Google Drive এ রাখা।
   ইনডেক্স তৈরি ও যাচাইয়ের বিবরণ: data/mouza-map/README.md

   ★ দুই স্তরের ইনডেক্স (কেন এভাবে)
     tree.json         ০.১৪ MB — বিভাগ/জেলা/উপজেলা/জরিপ, ফাইল ছাড়া
     files/<id>.json   ১,০১২টি — যে জরিপ-ফোল্ডার খোলা হবে কেবল তারটাই আসে
     পুরো ইনডেক্স ৪৪ MB; একসাথে টানলে মোবাইলে অচল হতো।

   ★ ফাইল আনার একমাত্র পথ Apps Script প্রক্সি
     Drive ফাইলগুলো পাবলিক নয় (uc?export=view → ৪০৩, /preview → ৪০১)।
     প্রক্সিতে CORS `*`, তাই ব্রাউজার থেকে সরাসরি ডাকা যায় এবং বাইট
     base64 এ আসে — ফলে ক্যানভাসেও বসানো যাবে।

   ★ বড় ফাইল টুকরো টুকরো করে আসে (Code.gs এ start/len), ৩টি টুকরো একসাথে।
     এক অনুরোধে ১২ MB, সব মিলিয়ে ২০০ MB পর্যন্ত নামে। ইনডেক্সের `tooBig`
     ফ্ল্যাগটি পুরনো ৩৫ MB সীমার হিসাব — আর দেখা হয় না। ২০০ MB এর বড় মাত্র
     ১৮টি ফাইল (সবচেয়ে বড় ৯০৫ MB), টুলে ওগুলোর বোতাম নিষ্ক্রিয় থাকে।

   ★ উত্তরটা স্ট্রিম করে পড়া হয়, তাই কত বাইট এল তা চলতে চলতেই জানা যায়।
     প্রথম বাইট আসার আগে pct হিসেবে null যায় — UI তখন ডোরাকাটা বার দেখায়।

   DOM ছোঁয় না — Node এ টেস্ট করা যায়।
   ========================================================================== */

const MouzaMap = {

  /* ---------------- কনফিগ — হোস্টিং বদলালে কেবল এখানেই বদলাবে ---------------- */

  /** ইনডেক্সের ভিত্তি পথ (আপেক্ষিক রাখলে যেখানেই হোস্ট হোক চলবে) */
  BASE: 'data/mouza-map/',

  /** ফাইল আনার প্রক্সি — ronedata/map এর Apps Script */
  PROXY: 'https://script.google.com/macros/s/AKfycbzlLhCx-_sL_TnV_wBOPicAYcwc'
       + 'qg3jTgawC_eysmTzVkvKZ6jl69h5I0JK3csRaL0j/exec',

  /** এক অনুরোধে সর্বোচ্চ কত বাইট আনা যায় (base64 এ ১.৩৩× বাড়ে) */
  PROXY_LIMIT: 35 * 1024 * 1024,

  /** এর চেয়ে বড় হলে টুকরো টুকরো করে আনা হয় */
  CHUNK: 12 * 1024 * 1024,

  /** কয়টি টুকরো একসাথে — বেশি দিলে দ্রুত, কিন্তু সার্ভার ধীর হয় */
  PARALLEL: 3,

  /** সব মিলিয়ে যতটা নামানো যায় — এর বড় ফাইল ব্রাউজারে জোড়া দেওয়া যায় না।
      ১,৯৪,৩১৭টির মধ্যে মাত্র ১৮টি এর চেয়ে বড় (সবচেয়ে বড় ৯০৫ MB)। */
  MAX_SIZE: 200 * 1024 * 1024,

  /** সাময়িক গোলমালে কতবার চেষ্টা করবে।
      Google এর কনটেন্ট সার্ভার এলোমেলোভাবে ৪০৪ দেয় ("এই মুহূর্তে ফাইলটি খোলা
      গেল না")। মাপা হয়েছে: ফাইলের আকার বা কোন ফাইল — কিছুর সাথেই সম্পর্ক নেই,
      প্রতি চেষ্টায় সফলতা ~৩০%। ব্যর্থতাটা সাথে সাথে ফেরে (ফাইল নামে না), তাই
      বেশিবার চেষ্টা করা সস্তা — ১২ বারে সফলতার সম্ভাবনা ~৯৯%। */
  RETRIES: 12,

  cache: { tree: null, files: {} },

  /* ---------------- পিওর হেল্পার ---------------- */

  /** বাইটকে পড়ার মতো বাংলা লেখায় */
  formatSize(bytes) {
    const b = Number(bytes) || 0;
    const bn = x => (typeof toBn === 'function' ? toBn(x) : String(x));
    if (b >= 1073741824) return bn((b / 1073741824).toFixed(2)) + ' GB';
    if (b >= 1048576) return bn((b / 1048576).toFixed(1)) + ' MB';
    if (b >= 1024) return bn(Math.round(b / 1024)) + ' KB';
    return bn(b) + ' বাইট';
  },

  /**
   * ফাইলটি নামানো যাবে কি না।
   *
   * আগে সীমা ছিল ৩৫ MB — কারণ পুরো ফাইল এক অনুরোধে আনতে হতো। এখন Code.gs
   * start/len দিয়ে টুকরো পাঠাতে পারে, তাই সীমা MAX_SIZE। ইনডেক্সের `tooBig`
   * ফ্ল্যাগটি সেই পুরনো ৩৫ MB হিসাবের, তাই আর দেখা হয় না।
   */
  canProxy(file) {
    if (!file) return false;
    return (Number(file.size) || 0) <= this.MAX_SIZE;
  },

  /** ফাইলটি এক অনুরোধে আসবে, নাকি টুকরো করে আনতে হবে */
  needsChunks(file) {
    return (Number(file && file.size) || 0) > this.CHUNK;
  },

  /** mimeType থেকে আইকন ও ধরনের নাম */
  fileKind(mime) {
    const m = String(mime || '');
    if (m === 'application/pdf') return { icon: 'bi-file-earmark-pdf', label: 'PDF' };
    if (m === 'image/tiff') return { icon: 'bi-file-earmark-image', label: 'TIFF' };
    if (m.startsWith('image/')) return { icon: 'bi-file-earmark-image', label: 'ছবি' };
    if (m.startsWith('text/')) return { icon: 'bi-file-earmark-text', label: 'টেক্সট' };
    return { icon: 'bi-file-earmark', label: 'অন্যান্য' };
  },

  /** ব্রাউজারে ছবি হিসেবে ক্যানভাসে বসানো যাবে কি (TIFF যাবে না) */
  canRenderInBrowser(mime) {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(mime || ''));
  },

  /**
   * ফাইল আনার একমাত্র ঠিকানা — প্রক্সি।
   *
   * ⚠️ Drive এর লিংক বানানো বা দেখানোর কোনো ফাংশন এখানে রাখা হয়নি (ইউজারের
   *    নির্দেশ: "Drive এর link সবাইকে দেখানো যাবে না")। ইনডেক্সের JSON থেকেও
   *    `url` ফিল্ড মুছে ফেলা হয়েছে। নতুন কোড লেখার সময় Drive লিংক তৈরি করা
   *    যাবে না — ব্যবহারকারী কেবল প্রক্সির মধ্য দিয়েই ফাইল পাবেন।
   */
  proxyUrl(fileId) {
    return this.PROXY + '?action=download&fileId=' + encodeURIComponent(fileId);
  },

  /**
   * ট্রি থেকে জায়গা খোঁজে — বিভাগ/জেলা/উপজেলার নাম মিলিয়ে।
   * ১,৯৪,৩১৭ ফাইলের নাম একসাথে খোঁজা সম্ভব নয় (৪৪ MB লাগত), তাই
   * জায়গা ধরে খোঁজা হয়; ফোল্ডার খোলার পর ফাইলের নাম ছেঁকে দেখা যায়।
   * @returns {Array<{division, district, upazila, surveys, total}>}
   */
  searchPlaces(tree, query, limit = 40) {
    const q = String(query || '').trim().toLowerCase();
    if (!tree || q.length < 2) return [];
    const out = [];
    for (const dv of tree.divisions || []) {
      for (const dt of dv.districts || []) {
        for (const up of dt.upazilas || []) {
          const hay = (dv.name + ' ' + dt.name + ' ' + up.name).toLowerCase();
          if (hay.indexOf(q) === -1) continue;
          out.push({
            division: dv, district: dt, upazila: up,
            surveys: up.surveys || [],
            total: (up.surveys || []).reduce((a, s) => a + (s.count || 0), 0)
          });
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  },

  /** ফোল্ডারের ফাইল তালিকা ছাঁকে (নাম বা উপ-পথ মিলিয়ে) */
  filterFiles(files, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return files || [];
    return (files || []).filter(f =>
      String(f.name || '').toLowerCase().indexOf(q) !== -1 ||
      String(f.subPath || '').toLowerCase().indexOf(q) !== -1);
  },

  /** ট্রির সারসংক্ষেপ — কয়টি বিভাগ/জেলা/উপজেলা/ফাইল */
  summary(tree) {
    let dt = 0, up = 0, sv = 0, files = 0;
    for (const d of (tree && tree.divisions) || []) {
      dt += (d.districts || []).length;
      for (const t of d.districts || []) {
        up += (t.upazilas || []).length;
        for (const u of t.upazilas || []) {
          sv += (u.surveys || []).length;
          files += (u.surveys || []).reduce((a, s) => a + (s.count || 0), 0);
        }
      }
    }
    return { divisions: ((tree && tree.divisions) || []).length,
             districts: dt, upazilas: up, surveys: sv, files };
  },

  /* ---------------- নেটওয়ার্ক ---------------- */

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  /**
   * অপেক্ষা দ্বিগুণ করে কয়েকবার চেষ্টা করে আনে।
   *
   * ★ softClientError — ৪xx কেও সাময়িক ধরে আবার চেষ্টা করে।
   *   প্রক্সির জন্য এটি লাগে: Apps Script এর `/exec` সরাসরি ফাইল দেয় না,
   *   `script.googleusercontent.com` এ রিডাইরেক্ট করে — আর ওই সাময়িক লিংক
   *   প্রায়ই ৪০৪ দেয়, আবার চেষ্টা করলে কাজ করে। কোন ফাইল বা কত বড়, তার
   *   সাথে সম্পর্ক নেই — একই ফাইল একবার ব্যর্থ, পরেরবার সফল হয়।
   *   ফাইল সত্যিই না থাকলে প্রক্সি ৪০৪ নয়, ২০০ সহ {success:false} পাঠায় —
   *   তাই আসল "নেই" আর সাময়িক ৪০৪ গুলিয়ে যায় না।
   *   ইনডেক্স আনার সময় এটি বন্ধ: সেখানে ৪০৪ মানে ফাইলটি সত্যিই নেই।
   *
   * ★ expectJson — কোটা শেষ হলে বা এরর হলে Google ২০০ স্ট্যাটাসেই HTML পাঠায়।
   *   তখন res.json() ইংরেজি SyntaxError ছোঁড়ে, যা ব্যবহারকারীর পর্দায় যেত।
   *
   * ★ bust — প্রতিবার আলাদা প্যারামিটার, যাতে ব্যর্থ উত্তরটা ক্যাশ থেকে ফিরে না আসে।
   *
   * @param {string} url
   * @param {{onRetry?:function, softClientError?:boolean, expectJson?:boolean, bust?:boolean, tries?:number}} [opts]
   * @returns {Promise<Response>}
   */
  async fetchRetry(url, opts) {
    const o = opts || {};
    const tries = o.tries || this.RETRIES;
    let last;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(o.bust ? url + '&_=' + Date.now() + '_' + i : url);
        if (res.ok) {
          const ct = String((res.headers && res.headers.get('content-type')) || '');
          if (o.expectJson && ct.indexOf('json') === -1) {
            last = new Error('সার্ভার সঠিক উত্তর দেয়নি');
          } else {
            return res;
          }
        } else if (res.status >= 400 && res.status < 500 && !o.softClientError) {
          throw new Error('পাওয়া যায়নি (' + res.status + ')');
        } else {
          last = new Error('সার্ভার সাড়া দিচ্ছে না (' + res.status + ')');
        }
      } catch (e) {
        last = e;
        if (/পাওয়া যায়নি/.test(e.message)) throw e;   // স্থায়ী ভুল — আর চেষ্টা নয়
      }
      if (i < tries - 1) {
        /* অপেক্ষা দ্বিগুণ হয়, তবে ৪ সেকেন্ডেই থেমে যায় — ৮ বার চেষ্টাতেও
           মোট অপেক্ষা ~২০ সেকেন্ডের বেশি নয় */
        const wait = Math.min(2500, 400 * Math.pow(2, i));
        if (o.onRetry) o.onRetry(i + 2, wait);
        await this.sleep(wait);
      }
    }
    throw last || new Error('আনা যায়নি');
  },

  async loadTree() {
    if (this.cache.tree) return this.cache.tree;
    const res = await this.fetchRetry(this.BASE + 'tree.json');
    this.cache.tree = await res.json();
    return this.cache.tree;
  },

  async loadFiles(surveyId) {
    if (this.cache.files[surveyId]) return this.cache.files[surveyId];
    const res = await this.fetchRetry(this.BASE + 'files/' + surveyId + '.json');
    const list = await res.json();
    this.cache.files[surveyId] = list;
    return list;
  },

  /** base64 → বাইট */
  decode(b64) {
    const bin = atob(b64 || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  },

  /**
   * উত্তরটা এক টানে না নিয়ে স্ট্রিম করে পড়ে — ফলে কত বাইট এল তা চলতে চলতেই
   * জানা যায় (res.text() দিলে সব আসার আগে কিছুই জানা যেত না)।
   */
  async readStream(res, onBytes) {
    if (!res.body || !res.body.getReader) return res.text();   // পুরনো ব্রাউজার
    const reader = res.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      parts.push(step.value);
      got += step.value.length;
      if (onBytes) onBytes(got);
    }
    const all = new Uint8Array(got);
    let at = 0;
    for (let i = 0; i < parts.length; i++) { all.set(parts[i], at); at += parts[i].length; }
    return new TextDecoder().decode(all);
  },

  /**
   * প্রক্সি থেকে পুরো ফাইল বা একটি টুকরো আনে।
   * start/len না দিলে পুরো ফাইল (পুরনো আচরণ)।
   * @returns {Promise<{fileName,mimeType,size,base64,start?,len?,eof?}>}
   */
  async getPart(fileId, start, len, onRetry, onBytes) {
    let url = this.proxyUrl(fileId);
    if (len != null) url += '&start=' + start + '&len=' + len;
    const res = await this.fetchRetry(url, {
      softClientError: true, expectJson: true, bust: true, onRetry: onRetry
    });
    const text = await this.readStream(res, onBytes);
    let j;
    try { j = JSON.parse(text); }
    catch (e) { throw new Error('সার্ভার সঠিক উত্তর দেয়নি'); }
    if (!j.success || !j.data || j.data.base64 === undefined) {
      throw new Error(j.error || 'প্রক্সি থেকে সঠিক উত্তর আসেনি');
    }
    return j.data;
  },

  /**
   * প্রক্সি দিয়ে ফাইলের বাইট আনে।
   *
   * ছোট ফাইল এক অনুরোধেই; CHUNK এর বড় হলে টুকরো টুকরো করে, ৩টি একসাথে।
   * Apps Script প্রথমে পুরো ফাইল পড়ে base64 এ রূপান্তর করে তারপর পাঠাতে শুরু
   * করে — তাই প্রথম বাইট আসতে দেরি হয়; ততক্ষণ pct হিসেবে null যায়, অর্থাৎ
   * "কতদূর জানি না, তবে কাজ চলছে"।
   *
   * @param {object} file
   * @param {function(?number, string)} onStage (পার্সেন্ট বা null, বার্তা)
   * @returns {Promise<{blob:Blob, fileName:string, mimeType:string}>}
   */
  async fetchBytes(file, onStage) {
    const self = this;
    const stage = function (p, m) { if (onStage) onStage(p, m); };
    const bn = function (x) { return (typeof toBn === 'function' ? toBn(x) : String(x)); };

    if (!this.canProxy(file)) {
      throw new Error('ফাইলটি ' + this.formatSize(this.MAX_SIZE)
        + ' এর চেয়ে বড়, তাই এখান থেকে নামানো যাবে না।');
    }
    const retryMsg = function (n) {
      stage(null, 'সার্ভার সাড়া দেয়নি — আবার চেষ্টা করছি (' + bn(n) + ')…');
    };
    const PREP = 'ম্যাপ প্রস্তুত করা হচ্ছে…';
    const total = Number(file.size) || 0;
    let name = file.name, mime = file.mimeType;

    /* base64 এ বাইট ১.৩৩× বাড়ে — নামানো বাইটকে সেই হিসাবে ফিরিয়ে দেখানো হয় */
    const show = function (done, of) {
      stage(of ? Math.min(96, Math.round(done / of * 96)) : null,
        'নামানো হচ্ছে — ' + self.formatSize(done) + ' / ' + self.formatSize(of));
    };

    if (!this.needsChunks(file)) {
      stage(null, PREP);
      const d = await this.getPart(file.id, null, null, retryMsg, function (got) {
        show(Math.min(total, Math.floor(got / 4 * 3)), total);
      });
      stage(97, 'ফাইল প্রস্তুত হচ্ছে…');
      name = d.fileName || name; mime = d.mimeType || mime;
      return {
        blob: new Blob([this.decode(d.base64)], { type: mime || 'application/octet-stream' }),
        fileName: name, mimeType: mime
      };
    }

    /* টুকরোগুলো Blob হিসেবে জমে — ব্রাউজার দরকারে ডিস্কে রাখে, তাই ২০০ MB
       ফাইলেও মেমরি টেকে */
    const parts = [], doneBytes = [];
    let real = total;
    const tick = function () {
      let sum = 0;
      for (let i = 0; i < doneBytes.length; i++) sum += doneBytes[i] || 0;
      show(sum, real);
    };

    /* প্রথম টুকরোটি একা — এতে জানা যায় সার্ভার টুকরো বোঝে কি না, আর ফাইলের
       আসল আকার কত (ইনডেক্সের আকার বাসি হতে পারে) */
    stage(null, PREP);
    const head = await this.getPart(file.id, 0, this.CHUNK, retryMsg, function (got) {
      doneBytes[0] = Math.min(self.CHUNK, Math.floor(got / 4 * 3)); tick();
    });
    name = head.fileName || name; mime = head.mimeType || mime;
    if (head.size) real = head.size;
    parts[0] = this.decode(head.base64);
    doneBytes[0] = parts[0].length;
    tick();

    /* len ফেরত না এলে পুরনো Code.gs চলছে — সে পুরো ফাইলটাই পাঠিয়ে দিয়েছে */
    if (head.len !== undefined && !head.eof) {
      const jobs = [];
      for (let s = parts[0].length; s < real; s += this.CHUNK) jobs.push(s);
      let next = 0;
      const worker = async function () {
        for (;;) {
          const i = next++;
          if (i >= jobs.length) return;
          const slot = i + 1;
          const d = await self.getPart(file.id, jobs[i], self.CHUNK, retryMsg, function (got) {
            doneBytes[slot] = Math.min(self.CHUNK, Math.floor(got / 4 * 3)); tick();
          });
          parts[slot] = self.decode(d.base64);
          doneBytes[slot] = parts[slot].length;
          tick();
        }
      };
      const runners = [];
      const n = Math.min(this.PARALLEL, jobs.length);
      for (let i = 0; i < n; i++) runners.push(worker());
      await Promise.all(runners);
    }

    stage(98, 'জোড়া দেওয়া হচ্ছে…');
    return {
      blob: new Blob(parts.filter(Boolean), { type: mime || 'application/octet-stream' }),
      fileName: name, mimeType: mime
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = MouzaMap;
