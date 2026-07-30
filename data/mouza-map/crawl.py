"""
ronedata/map এর Drive ট্রি নতুন করে ক্রল করে ইনডেক্স বানায়।

কেন দরকার: Data/*.json এর ফোল্ডার/ফাইল আইডি পুরনো হয়ে গেছে (Drive এ নতুন করে
আপলোড হয়েছে), তাই ডাউনলোড "আইটেম পাওয়া যায়নি" বলে ব্যর্থ হয়।

বৈশিষ্ট্য
  • পুনরারম্ভযোগ্য — crawl-cache.jsonl এ প্রতিটি ফোল্ডারের ফল লাইনে লাইনে জমা হয়,
    আবার চালালে যা হয়ে গেছে তা বাদ দিয়ে বাকিটা করে
  • সীমিত সমান্তরালতা (৫) + ব্যর্থ হলে ব্যাকঅফ দিয়ে পুনরায় চেষ্টা
  • যেকোনো গভীরতা ও যেকোনো স্তরে ফাইল থাকলেও ধরে
"""
import io, sys, os, json, time, threading, queue, urllib.request, urllib.parse, urllib.error

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'crawl-cache.jsonl')
API = ('https://script.google.com/macros/s/AKfycbzlLhCx-_sL_TnV_wBOPicAYcwcqg3j'
       'TgawC_eysmTzVkvKZ6jl69h5I0JK3csRaL0j/exec')
ROOT = '1T1GWNPpszx44Mj42u7tLXaP3ac3t4yRb'      # "মৌজা ম্যাপ ফাইল"
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36'}
WORKERS = 5
MAX_TRIES = 4

lock = threading.Lock()
done = {}            # folderId → node
cache_fh = None
stats = {'ok': 0, 'fail': 0, 'files': 0, 'skipped': 0}


def load_cache():
    if not os.path.exists(CACHE):
        return
    n = 0
    with open(CACHE, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                node = json.loads(line)
            except Exception:
                continue          # অসম্পূর্ণ শেষ লাইন — বাদ
            done[node['id']] = node
            n += 1
    print('ক্যাশ থেকে %s ফোল্ডার পাওয়া গেল' % format(n, ','))


def fetch(fid):
    url = API + '?' + urllib.parse.urlencode({'action': 'listChildren', 'folderId': fid})
    last = None
    for attempt in range(MAX_TRIES):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180)
            j = json.loads(r.read().decode('utf-8'))
            if j.get('success'):
                return j['data']
            last = j.get('error')
            # অনুমতি/আইডি সমস্যা হলে পুনরায় চেষ্টা করে লাভ নেই
            if 'খুঁজে পাওয়া যায়নি' in str(last):
                return None
        except Exception as e:
            last = str(e)[:120]
        time.sleep(2 * (attempt + 1))
    with lock:
        print('   ✗ %s → %s' % (fid[:14], str(last)[:90]))
    return None


def worker(q):
    while True:
        item = q.get()
        if item is None:
            q.task_done()
            return
        fid, path = item
        with lock:
            if fid in done:
                stats['skipped'] += 1
                node = done[fid]
            else:
                node = None
        if node is None:
            data = fetch(fid)
            if data is None:
                with lock:
                    stats['fail'] += 1
                q.task_done()
                continue
            node = {'id': data['id'], 'name': data['name'], 'path': path,
                    'folders': data.get('folders', []), 'files': data.get('files', [])}
            with lock:
                done[fid] = node
                cache_fh.write(json.dumps(node, ensure_ascii=False) + '\n')
                cache_fh.flush()
                stats['ok'] += 1
                stats['files'] += len(node['files'])
                tot = stats['ok'] + stats['skipped']
                if tot % 25 == 0 or len(node['files']) > 400:
                    print('  [%5d] %-52s  ফোল্ডার %3d · ফাইল %4d  (মোট ফাইল %s)'
                          % (tot, ' / '.join(path)[-52:], len(node['folders']),
                             len(node['files']), format(stats['files'], ',')))
        for sub in node['folders']:
            q.put((sub['id'], path + [sub['name']]))
        q.task_done()


def main():
    global cache_fh
    load_cache()
    cache_fh = open(CACHE, 'a', encoding='utf-8')

    q = queue.Queue()
    q.put((ROOT, []))
    threads = [threading.Thread(target=worker, args=(q,), daemon=True) for _ in range(WORKERS)]
    for t in threads:
        t.start()

    t0 = time.time()
    q.join()
    for _ in threads:
        q.put(None)

    mins = (time.time() - t0) / 60
    print('\n' + '=' * 70)
    print('ক্রল শেষ — %.1f মিনিট' % mins)
    print('  নতুন ফোল্ডার : %s' % format(stats['ok'], ','))
    print('  ক্যাশ থেকে   : %s' % format(stats['skipped'], ','))
    print('  ব্যর্থ        : %s' % format(stats['fail'], ','))
    print('  মোট ফাইল     : %s' % format(sum(len(n['files']) for n in done.values()), ','))
    print('  মোট ফোল্ডার  : %s' % format(len(done), ','))
    print('=' * 70)


if __name__ == '__main__':
    main()
