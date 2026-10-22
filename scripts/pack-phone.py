# Packs the iPhone GLB into the landing's compact format: int16 positions, int8 normals, float16 UVs, uint16 indices,
# PBR material params, and the embedded images. Usage: python3 -I pack.py in.glb out.bin
import json, struct, sys, array
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
    p = m['primitives'][0]; at = p['attributes']
    pos = view(at['POSITION']); nrm = view(at['NORMAL']); ind = view(p['indices'])
    q = array.array('h')
    for v in pos:
        for k in range(3): q.append(round((v[k] - lo[k]) / (hi[k] - lo[k]) * 65535) - 32768)
    nq = array.array('b')
    for v in nrm:
        for k in range(3): nq.append(max(-127, min(127, round(v[k] * 127))))
    rec = {'name': m.get('name'), 'mat': p.get('material', 0), 'n': len(pos), 'pos': put(q.tobytes()), 'nrm': put(nq.tobytes())}
    if 'TEXCOORD_0' in at:
        uv = view(at['TEXCOORD_0'])
        rec['uv'] = put(b''.join(struct.pack('<ee', *v) for v in uv))
    ii = array.array('H', [i[0] for i in ind])
    rec['ind'] = put(ii.tobytes()); rec['ni'] = len(ii)
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
imgs = []
for t in g['textures']:
    im = g['images'][t['source']]; v = g['bufferViews'][im['bufferView']]
    b = BIN[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
    imgs.append({'mime': im['mimeType'], 'off': put(b), 'len': len(b), 'name': t.get('name')})
head = json.dumps({'lo': lo, 'hi': hi, 'meshes': meshes, 'materials': mats, 'textures': imgs}, separators=(',', ':')).encode()
while (len(head) + 4) % 4: head += b' '
open(sys.argv[2], 'wb').write(struct.pack('<I', len(head)) + head + bytes(body))
print('meshes', len(meshes), 'bytes', 4 + len(head) + len(body))
