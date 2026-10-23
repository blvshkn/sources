# Packs the iPhone GLB into the landing's compact format (v2), gzipped (phone3d.ts inflates it with DecompressionStream).
# Geometry is shaped for gzip: duplicate vertices welded, triangles sorted along a Morton curve, vertices renumbered in
# first-use order, then 13-bit positions, octahedral 8-bit normals, 12-bit UVs and indices stored as zigzag deltas split
# into byte planes. 13 bits over the phone's 163 mm is 0.02 mm, far under a pixel at hero size.
# Parts the hero never shows (the back, camera bump, port, screws, speaker grilles) and textures nothing kept uses are
# left out, and so is the screen texture (the screen shows the app instead). Usage: python3 -I pack-phone.py in.glb out.pack
import json, struct, sys, array, gzip
import numpy as np
PB, UB = 13, 12
HIDDEN = ('Back_', 'USB_', 'Screws', 'Side_Panel_Speakers', 'Holes')
src = open(sys.argv[1], 'rb').read()
L = struct.unpack('<I', src[12:16])[0]
g = json.loads(src[20:20 + L])
binstart = 20 + L + 8
BIN = src[binstart:]
def view(ai):
    a = g['accessors'][ai]; v = g['bufferViews'][a['bufferView']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    comp = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    size = struct.calcsize(comp)
    stride = v.get('byteStride', size * n)
    out = []
    for i in range(a['count']):
        out.append(struct.unpack_from('<' + comp * n, BIN, off + i * stride))
    return out
lo = [1e9] * 3; hi = [-1e9] * 3
for m in g['meshes']:
    a = g['accessors'][m['primitives'][0]['attributes']['POSITION']]
    lo = [min(x, y) for x, y in zip(lo, a['min'])]; hi = [max(x, y) for x, y in zip(hi, a['max'])]
body = bytearray()
def put(b):
    while len(body) % 4: body.append(0)
    o = len(body); body.extend(b); return o
meshes = []
for m in g['meshes']:
    if (m.get('name') or '').startswith(HIDDEN): continue
    if g['accessors'][m['primitives'][0]['attributes']['POSITION']]['count'] == 0: continue
    p = m['primitives'][0]; at = p['attributes']
    pos = view(at['POSITION']); nrm = view(at['NORMAL']); ind = view(p['indices'])
    uvs = view(at['TEXCOORD_0']) if 'TEXCOORD_0' in at else None
    # Triangles facing away (normals pointing back past 60 degrees) never show: the hero turns phones 30 degrees at most
    tri = [tuple(ind[i + k][0] for k in range(3)) for i in range(0, len(ind), 3)]
    tri = [f for f in tri if max(nrm[v][2] for v in f) > -0.5]
    if not tri: continue
    rec = {'name': m.get('name'), 'mat': p.get('material', 0)}
    mt = g['materials'][p.get('material', 0)]
    textured = 'normalTexture' in mt or 'occlusionTexture' in mt or 'emissiveTexture' in mt or 'baseColorTexture' in mt.get('pbrMetallicRoughness', {})
    # UVs only where a texture reads them (the screen keeps its own: the phones behind show their screens through it)
    want_uv = uvs is not None and (textured or m.get('name') == 'Front_Screen')
    P = np.array(pos, np.float64); N = np.array(nrm, np.float64); U = np.array(uvs, np.float64) if want_uv else np.zeros((len(pos), 0))
    qp = np.round((P - lo) / (np.array(hi) - lo) * ((1 << PB) - 1)).astype(np.int64)
    N /= np.abs(N).sum(1, keepdims=True) + 1e-12
    ox, oy = N[:, 0].copy(), N[:, 1].copy(); back = N[:, 2] < 0
    sx = np.where(N[:, 0] >= 0, 1, -1); sy = np.where(N[:, 1] >= 0, 1, -1)
    ox[back] = (1 - np.abs(N[back, 1])) * sx[back]; oy[back] = (1 - np.abs(N[back, 0])) * sy[back]
    qn = np.stack([np.round(ox * 127), np.round(oy * 127)], 1).astype(np.int64)
    if want_uv:
        ulo = U.min(0); uhi = U.max(0); ur = np.where(uhi > ulo, uhi - ulo, 1)
        qu = np.round((U - ulo) / ur * ((1 << UB) - 1)).astype(np.int64)
        rec['ulo'] = ulo.tolist(); rec['uhi'] = (ulo + ur).tolist()
    else:
        qu = np.zeros((len(pos), 0), np.int64)
    # Weld vertices that quantize to the same thing, then sort triangles spatially and renumber by first use
    key = np.concatenate([qp, qn, qu], 1)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    t = inv.ravel()[np.array(tri, np.int64)]
    t = t[(t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])]
    c = (qp[first][t].sum(1) // 3) >> max(0, PB - 10)
    def spread(x):
        x = x & 0x3ff; x = (x | (x << 16)) & 0x30000ff; x = (x | (x << 8)) & 0x300f00f
        x = (x | (x << 4)) & 0x30c30c3; return (x | (x << 2)) & 0x9249249
    t = t[np.argsort(spread(c[:, 0]) | (spread(c[:, 1]) << 1) | (spread(c[:, 2]) << 2), kind='stable')]
    flat = t.ravel(); order = []; seen = {}
    for v in flat.tolist():
        if v not in seen: seen[v] = len(order); order.append(v)
    ind = np.array([seen[v] for v in flat.tolist()], np.int64)
    src = first[np.array(order)]
    def zplanes(col):  # zigzag deltas, low bytes then high bytes
        d = np.diff(col, prepend=0)
        assert np.abs(d).max(initial=0) < 32768
        z = ((d << 1) ^ (d >> 63)).astype(np.uint16)
        return (z & 255).astype(np.uint8).tobytes() + (z >> 8).astype(np.uint8).tobytes()
    rec['n'] = len(order)
    rec['pos'] = put(b''.join(zplanes(qp[src][:, k]) for k in range(3)))
    rec['nrm'] = put(qn[src].astype(np.int8)[:, 0].tobytes() + qn[src].astype(np.int8)[:, 1].tobytes())
    if want_uv: rec['uv'] = put(b''.join(zplanes(qu[src][:, k]) for k in range(2)))
    rec['ind'] = put(zplanes(ind)); rec['ni'] = len(ind)
    meshes.append(rec)
mats = []
for m in g['materials']:
    pb = m.get('pbrMetallicRoughness', {}); ex = m.get('extensions', {})
    o = {'name': m['name'], 'c': pb.get('baseColorFactor', [1, 1, 1, 1]), 'm': pb.get('metallicFactor', 1), 'r': pb.get('roughnessFactor', 1)}
    if 'baseColorTexture' in pb: o['map'] = pb['baseColorTexture']['index']
    if 'normalTexture' in m: o['nmap'] = m['normalTexture']['index']; o['ns'] = m['normalTexture'].get('scale', 1)
    if 'occlusionTexture' in m: o['ao'] = m['occlusionTexture']['index']
    if 'emissiveFactor' in m: o['e'] = m['emissiveFactor']
    if 'emissiveTexture' in m: o['emap'] = m['emissiveTexture']['index']
    if m.get('alphaMode') == 'BLEND': o['blend'] = 1
    if m.get('doubleSided'): o['ds'] = 1
    if 'KHR_materials_ior' in ex: o['ior'] = ex['KHR_materials_ior']['ior']
    if 'KHR_materials_clearcoat' in ex: o['cc'] = [ex['KHR_materials_clearcoat'].get('clearcoatFactor', 0), ex['KHR_materials_clearcoat'].get('clearcoatRoughnessFactor', 0)]
    if 'KHR_materials_iridescence' in ex:
        x = ex['KHR_materials_iridescence']; o['ir'] = [x.get('iridescenceFactor', 0), x.get('iridescenceIor', 1.3), x.get('iridescenceThicknessMaximum', 400)]
    if 'KHR_materials_anisotropy' in ex: o['an'] = ex['KHR_materials_anisotropy'].get('anisotropyStrength', 0)
    mats.append(o)
for o in mats:
    if o['name'].startswith('BASE_Grey'): o.pop('nmap', None); o.pop('ns', None)
used = set()
for r in meshes:
    o = mats[r['mat']]
    o.pop('emap', None) if o['name'] == 'COLOUR_Black_Screen' else None
    for k in ('map', 'nmap', 'ao', 'emap'):
        if k in o: used.add(o[k])
imgs = []
for ti, t in enumerate(g['textures']):
    if ti not in used:
        imgs.append({'mime': 'image/png', 'off': 0, 'len': 0, 'skip': 1}); continue
    im = g['images'][t['source']]; v = g['bufferViews'][im['bufferView']]
    b = BIN[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
    if 'noise_N' in (t.get('name') or ''):
        import io
        from PIL import Image
        im2 = Image.open(io.BytesIO(b)).convert('RGB'); im2 = im2.resize((128, 128), Image.LANCZOS)
        buf = io.BytesIO(); im2.save(buf, 'JPEG', quality=88, optimize=True); b = buf.getvalue(); im = dict(im, mimeType='image/jpeg')
    imgs.append({'mime': im['mimeType'], 'off': put(b), 'len': len(b), 'name': t.get('name')})
head = json.dumps({'v': 2, 'pb': PB, 'ub': UB, 'lo': lo, 'hi': hi, 'meshes': meshes, 'materials': mats, 'textures': imgs}, separators=(',', ':')).encode()
while (len(head) + 4) % 4: head += b' '
raw = struct.pack('<I', len(head)) + head + bytes(body)
open(sys.argv[2], 'wb').write(gzip.compress(raw, 9))
print('raw', len(raw))
print('meshes', len(meshes), 'bytes', 4 + len(head) + len(body))
