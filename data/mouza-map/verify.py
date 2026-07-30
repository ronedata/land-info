"""নতুন ইনডেক্সের আইডি দিয়ে সত্যিই ডাউনলোড হয় কি — যাচাই।
পুরনো ইনডেক্সের আইডিও পাশাপাশি পরীক্ষা করে পার্থক্য দেখানো হয়।"""
import io, sys, os, json, random, urllib.request, urllib.parse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'index-out')
UA = {'User-Agent': 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36'}
API = ('https://script.google.com/macros/s/AKfycbzlLhCx-_sL_TnV_wBOPicAYcwcqg3j'
       'TgawC_eysmTzVkvKZ6jl69h5I0JK3csRaL0j/exec')

def dl(fid):
    url = API + '?' + urllib.parse.urlencode({'action': 'download', 'fileId': fid})
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300)
        j = json.loads(r.read().decode('utf-8'))
        if j.get('success'):
            return True, '%.2f MB' % (len(j['data']['base64']) * 0.75 / 1048576), j['data']['fileName']
        return False, str(j.get('error'))[:70], ''
    except Exception as e:
        return False, str(e)[:70], ''

random.seed(7)
print('=== নতুন ইনডেক্স থেকে এলোমেলো ৬টি ফাইল ===\n')
ok = bad = 0
for fn in sorted(os.listdir(os.path.join(OUT, 'compat'))):
    dv = json.load(open(os.path.join(OUT, 'compat', fn), encoding='utf-8'))
    name = list(dv.keys())[0]
    # এলোমেলোভাবে একটি ছোট ফাইল বাছি
    cand = []
    for dt in dv[name]['districts']:
        for up in dt['upazilas']:
            for sv in up['survey_types']:
                for mz in sv['mouzas']:
                    if not mz.get('tooBig') and (mz.get('size') or 0) < 6 * 1048576:
                        cand.append((dt['name'], up['name'], sv['name'], mz))
    if not cand:
        print('  %-16s (ছোট ফাইল নেই)' % name); continue
    dt, up, sv, mz = random.choice(cand)
    good, info, real = dl(mz['id'])
    print('  %-16s %s / %s / %s' % (name, dt[:14], up[:16], sv))
    print('     %-34s %s  %s' % (mz['name'][:34], '✓' if good else '✗', info))
    if good:
        ok += 1
        if real != mz['name']:
            print('     ⚠ নাম মেলেনি: ইনডেক্সে "%s", Drive এ "%s"' % (mz['name'], real))
    else:
        bad += 1
    if ok + bad >= 6:
        break

print('\n=== পুরনো ইনডেক্সের আইডি (তুলনার জন্য) ===')
oldu = ('https://raw.githubusercontent.com/ronedata/map/HEAD/Data/'
        + urllib.parse.quote('সিলেট বিভাগ_full_data.json'))
old = json.loads(urllib.request.urlopen(urllib.request.Request(oldu, headers=UA), timeout=120)
                 .read().decode('utf-8'))
o = old['সিলেট বিভাগ']
found = None
for dt in o['districts']:
    for up in dt.get('upazilas', []):
        for sv in up.get('survey_types', []):
            for mz in sv.get('mouzas', []):
                if (mz.get('size') or 0) < 6 * 1048576:
                    found = mz; break
            if found: break
        if found: break
    if found: break
if found:
    g, i, _ = dl(found['id'])
    print('  %-34s %s  %s' % (found['name'][:34], '✓' if g else '✗', i))

print('\n' + '=' * 66)
print('নতুন ইনডেক্স: %d সফল · %d ব্যর্থ' % (ok, bad))
print('=' * 66)
