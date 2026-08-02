/* ==========================================================================
   kmz-source.js — KMZ টুলে ম্যাপ আনার দুটি পথ
   --------------------------------------------------------------------------
   ১. PDF → ছবি   (আর্কাইভের ৫২% ফাইল PDF)
   ২. আর্কাইভ থেকে সরাসরি বাছাই (বিভাগ → জেলা → উপজেলা → জরিপ → ফাইল)

   ⚠️ Drive এর লিংক কোথাও বানানো বা দেখানো হয় না — ফাইল কেবল
      MouzaMap.fetchBytes() (প্রক্সি) দিয়ে আসে। এটি ইউজারের স্পষ্ট নির্দেশ।

   pdf.js CDN থেকে আসে, কিন্তু **কেবল PDF দিলে তবেই** — অন্য সময় ৩১২ KB
   অকারণে নামে না।
   ========================================================================== */

const KmzSource = {

  /* pdf.js — Chart.js ও Bootstrap Icons যে CDN থেকে আসে, সেখান থেকেই */
  PDFJS: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  PDFJS_WORKER: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',

  /** রেন্ডার করা ছবির দীর্ঘতম বাহুর সীমা — খুব বড় হলে ব্রাউজার আটকে যায় */
  MAX_SIDE: 6000,
  DEFAULT_SIDE: 3000,

  _pdfPromise: null,

  /** pdf.js একবারই নামে, তারপর ক্যাশে থাকে */
  loadPdfJs() {
    if (this._pdfPromise) return this._pdfPromise;
    this._pdfPromise = new Promise((resolve, reject) => {
      if (typeof pdfjsLib !== 'undefined') { resolve(pdfjsLib); return; }
      const s = document.createElement('script');
      s.src = this.PDFJS;
      s.onload = () => {
        if (typeof pdfjsLib === 'undefined') {
          reject(new Error('pdf.js লোড হলো কিন্তু চালু হয়নি'));
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = this.PDFJS_WORKER;
        resolve(pdfjsLib);
      };
      s.onerror = () => {
        this._pdfPromise = null;
        reject(new Error('pdf.js নামানো গেল না — ইন্টারনেট সংযোগ দেখুন'));
      };
      document.head.appendChild(s);
    });
    return this._pdfPromise;
  },

  /**
   * PDF এর একটি পাতা ছবিতে রূপান্তর
   * @param {Uint8Array} bytes  PDF এর বাইট
   * @param {object} opt { page = 1, targetSide, onStage }
   * @returns {Promise<{img, bytes, width, height, pageCount, name}>}
   */
  async pdfToImage(bytes, opt) {
    const o = opt || {};
    const stage = (p, m) => { if (o.onStage) o.onStage(p, m); };

    stage(5, 'pdf.js প্রস্তুত হচ্ছে…');
    const lib = await this.loadPdfJs();

    stage(25, 'PDF পড়া হচ্ছে…');
    // pdf.js মূল বাফারটি নিজের কাজে নিয়ে নেয় (detach), তাই কপি পাঠাই
    const doc = await lib.getDocument({ data: bytes.slice() }).promise;
    const pageCount = doc.numPages;
    const pageNo = Math.max(1, Math.min(pageCount, o.page || 1));
    const page = await doc.getPage(pageNo);

    // কত বড় করে আঁকা হবে — দীর্ঘতম বাহু ধরে
    const base = page.getViewport({ scale: 1 });
    const target = Math.min(this.MAX_SIDE, Math.max(600, o.targetSide || this.DEFAULT_SIDE));
    const scale = target / Math.max(base.width, base.height);
    const vp = page.getViewport({ scale });

    stage(50, 'পাতা আঁকা হচ্ছে…');
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    // মৌজা ম্যাপ সাদা কাগজে — স্বচ্ছ পটভূমি সাদা করে দিই
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    stage(80, 'ছবিতে রূপান্তর হচ্ছে…');
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const img = await this.blobToImage(blob);

    stage(100, 'প্রস্তুত');
    return {
      img, bytes: outBytes,
      width: canvas.width, height: canvas.height,
      pageCount, page: pageNo
    };
  },

  /** Blob → <img> (লোড হওয়া পর্যন্ত অপেক্ষা করে) */
  blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ছবিটি পড়া গেল না')); };
      img.src = url;
    });
  },

  /**
   * যেকোনো ফাইলের বাইট → ছবি (ধরন বুঝে PDF বা সরাসরি ছবি)
   * @returns {Promise<{img, bytes, width, height, wasPdf, pageCount}>}
   */
  async toImage(bytes, mimeType, opt) {
    const mime = String(mimeType || '');
    if (mime === 'application/pdf' || this.looksLikePdf(bytes)) {
      const r = await this.pdfToImage(bytes, opt);
      return { ...r, wasPdf: true };
    }
    if (mime === 'image/tiff' || this.looksLikeTiff(bytes)) {
      throw new Error('TIFF ছবি ব্রাউজারে খোলা যায় না। JPG বা PDF ফাইল দিন।');
    }
    const blob = new Blob([bytes], { type: mime || 'image/jpeg' });
    const img = await this.blobToImage(blob);
    return { img, bytes, width: img.width, height: img.height, wasPdf: false, pageCount: 1 };
  },

  /** ফাইলের প্রথম বাইট দেখে ধরন চেনা (mimeType ভুল হতে পারে) */
  looksLikePdf(b) {
    return b && b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  },
  looksLikeTiff(b) {
    if (!b || b.length < 4) return false;
    return (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A && b[3] === 0x00) ||
           (b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2A);
  },

  /* ==================== আর্কাইভ থেকে বাছাই ==================== */

  cache: { tree: null, files: {} },

  async tree() {
    if (!this.cache.tree) this.cache.tree = await MouzaMap.loadTree();
    return this.cache.tree;
  },

  async filesOf(surveyId) {
    if (!this.cache.files[surveyId]) {
      this.cache.files[surveyId] = await MouzaMap.loadFiles(surveyId);
    }
    return this.cache.files[surveyId];
  },

  /** আর্কাইভের একটি ফাইল নামিয়ে ছবিতে রূপান্তর */
  async fromArchive(file, onStage) {
    const got = await MouzaMap.fetchBytes(file, onStage);
    const bytes = new Uint8Array(await got.blob.arrayBuffer());
    if (onStage) onStage(96, 'ছবি প্রস্তুত হচ্ছে…');
    const r = await this.toImage(bytes, got.mimeType, {
      onStage: (p, m) => { if (onStage) onStage(96 + p * 0.04, m); }
    });
    return { ...r, name: got.fileName };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = KmzSource;
