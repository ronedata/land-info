"""
crawl-cache.jsonl থেকে দুই রকম ইনডেক্স বানায়।

★ আসল কাঠামো (ক্রল করে জানা গেল — পুরনো ইনডেক্সে ভুল ছিল):
     স্তর ২ বিভাগ · ৩ জেলা · ৪ উপজেলা · ৫ জরিপ · ৬–১০ আরও ভেতরে
   ফাইল থাকে স্তর ৪ থেকে ১০ পর্যন্ত — পুরনো ইনডেক্স কেবল স্তর ৫ ধরেছিল,
   তাই ৬৬,৫৬৫ ফাইল বাদ পড়ে গিয়েছিল।

আউটপুট
  compat/  ronedata/map এর পুরনো ফরম্যাট (৮ বিভাগ-ফাইল) — সাইটের কোড বদলাতে হবে না
  lean/    Land Info এর জন্য — tree.json (ছোট) + files/<id>.json (চাহিদামতো)

জরিপের নাম স্বাভাবিক করা হয় ("RS 1" → "RS"), নইলে ড্রপডাউনে ৭১টা বিকল্প আসত।
ফাইলের সাথে subPath (জরিপ ফোল্ডারের নিচের পথ) ও tooBig চিহ্ন রাখা হয়।
"""
import io, sys, os, json, re, collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'index-out')

# Apps Script প্রক্সির রেসপন্স সীমা ~৫০ MB; base64 ১.৩৩× বাড়ায়
PROXY_LIMIT = 35 * 1024 * 1024

nodes = {}
with open(os.path.join(HERE, 'crawl-cache.jsonl'), encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            n = json.loads(line)
        except Exception:
            continue
        nodes[n['id']] = n
print('ক্যাশে ফোল্ডার: %s' % format(len(nodes), ','))

# ---- জরিপের নাম স্বাভাবিকীকরণ ----
CANON = ['BS_RS', 'RS_BS', 'CS_SA', 'SA_CS', 'SA_RS', 'RS_SA', 'DIYARA',
         'CITY', 'ROR', 'PETY', 'BS', 'RS', 'SA', 'CS']
BN = {'সিএস': 'CS', 'এসএ': 'SA', 'আরএস': 'RS', 'বিএস': 'BS'}

def canon_survey(name):
    s = name.strip()
    for bn, en in BN.items():
        if s.startswith(bn):
            return en
    u = re.sub(r'[\s\-+_]+', '_', s.upper()).strip('_')
    u = re.sub(r'_?\d+$', '', u)              # "RS 1" → "RS"
    for c in CANON:
        if u == c:
            return c
    for c in CANON:                            # "CS_NON SERIAL" → CS
        if u.startswith(c + '_') or u.startswith(c):
            return c
    return 'অন্যান্য'

def kid(fid):
    return nodes.get(fid)

def collect(folder, sub=''):
    """folder ও তার নিচের সব ফোল্ডারের ফাইল — subPath সহ"""
    out = []
    for f in folder.get('files', []):
        size = f.get('size') or 0
        out.append({
            'id': f['id'], 'name': f['name'], 'mimeType': f.get('mimeType'),
            'size': size, 'url': f.get('url'),
            **({'subPath': sub} if sub else {}),
            **({'tooBig': True} if size > PROXY_LIMIT else {})
        })
    for ch_ref in folder.get('folders', []):
        ch = kid(ch_ref['id'])
        if ch:
            out += collect(ch, (sub + ' / ' if sub else '') + ch_ref['name'])
        else:
            missing.append(ch_ref['name'])
    return out

missing = []
os.makedirs(os.path.join(OUT, 'compat'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'lean', 'files'), exist_ok=True)

root = next(n for n in nodes.values() if not n['path'])
bd = kid(next(f for f in root['folders'] if 'বাংলাদেশ' in f['name'])['id'])

tree = {'root': root['id'], 'bangladesh': bd['id'], 'divisions': []}
sv_stat, mime_stat, big = collections.Counter(), collections.Counter(), []
total = 0

for dv_ref in sorted(bd['folders'], key=lambda x: x['name']):
    dv = kid(dv_ref['id'])
    compat_d, lean_dv, dv_files = [], {'id': dv['id'], 'name': dv['name'], 'districts': []}, 0

    for dt_ref in sorted(dv['folders'], key=lambda x: x['name']):
        dt = kid(dt_ref['id'])
        compat_u, lean_dt = [], {'id': dt['id'], 'name': dt['name'], 'upazilas': []}

        for up_ref in sorted(dt['folders'], key=lambda x: x['name']):
            up = kid(up_ref['id'])
            compat_s, lean_up = [], {'id': up['id'], 'name': up['name'], 'surveys': []}

            # স্তর ৪ — উপজেলায় সরাসরি ফাইল (থানা ম্যাপ)
            direct = [dict(x) for x in collect({'files': up.get('files', []), 'folders': []})]
            groups = [(up['id'], 'থানা/সরাসরি', direct)] if direct else []

            # স্তর ৫+ — জরিপ ফোল্ডার ও তার ভেতরের সব
            for sv_ref in sorted(up['folders'], key=lambda x: x['name']):
                sv = kid(sv_ref['id'])
                if not sv:
                    missing.append(sv_ref['name']); continue
                fl = collect(sv)
                if fl:
                    groups.append((sv['id'], canon_survey(sv_ref['name']), fl, sv_ref['name']))

            for g in groups:
                gid, gname, fl = g[0], g[1], g[2]
                raw = g[3] if len(g) > 3 else gname
                compat_s.append({'id': gid, 'name': gname, 'rawName': raw,
                                 'type': 'folder', 'mouzas': fl})
                lean_up['surveys'].append({'id': gid, 'name': gname, 'rawName': raw,
                                           'count': len(fl)})
                json.dump(fl, open(os.path.join(OUT, 'lean', 'files', gid + '.json'),
                                   'w', encoding='utf-8'), ensure_ascii=False)
                sv_stat[gname] += 1
                dv_files += len(fl); total += len(fl)
                for x in fl:
                    mime_stat[x.get('mimeType')] += 1
                    if x.get('tooBig'):
                        big.append((x['size'], x['name']))

            if compat_s:
                compat_u.append({'id': up['id'], 'name': up['name'],
                                 'type': 'folder', 'survey_types': compat_s})
                lean_dt['upazilas'].append(lean_up)

        if compat_u:
            compat_d.append({'id': dt['id'], 'name': dt['name'], 'upazilas': compat_u})
            lean_dv['districts'].append(lean_dt)

    fn = os.path.join(OUT, 'compat', dv['name'] + '_full_data.json')
    json.dump({dv['name']: {'id': dv['id'], 'districts': compat_d}},
              open(fn, 'w', encoding='utf-8'), ensure_ascii=False)
    tree['divisions'].append(lean_dv)
    print('  %-16s জেলা %2d · ফাইল %7s · %5.1f MB'
          % (dv['name'], len(compat_d), format(dv_files, ','), os.path.getsize(fn) / 1048576))

json.dump(tree, open(os.path.join(OUT, 'lean', 'tree.json'), 'w', encoding='utf-8'),
          ensure_ascii=False)

compat_mb = sum(os.path.getsize(os.path.join(OUT, 'compat', f))
                for f in os.listdir(os.path.join(OUT, 'compat'))) / 1048576
shards = os.listdir(os.path.join(OUT, 'lean', 'files'))
shard_mb = sum(os.path.getsize(os.path.join(OUT, 'lean', 'files', f)) for f in shards) / 1048576

print('\n' + '=' * 72)
print('মোট ফাইল          : %s' % format(total, ','))
print('compat (৮ ফাইল)   : %.1f MB' % compat_mb)
print('lean/tree.json    : %.2f MB' % (os.path.getsize(os.path.join(OUT, 'lean', 'tree.json')) / 1048576))
print('lean/files/       : %s শার্ড · %.1f MB' % (format(len(shards), ','), shard_mb))
print('ক্রল হয়নি         : %s' % format(len(missing), ','))
print('=' * 72)
print('\n=== জরিপের ধরন (স্বাভাবিক করার পর) ===')
for k, v in sv_stat.most_common():
    print('  %-14s %5d ফোল্ডার' % (k, v))
print('\n=== ফাইলের ধরন ===')
for k, v in mime_stat.most_common(8):
    print('  %-40s %8s' % (k, format(v, ',')))
print('\nপ্রক্সিতে চলবে না (>৩৫ MB): %s টি' % format(len(big), ','))
