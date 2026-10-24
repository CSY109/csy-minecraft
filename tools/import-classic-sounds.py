"""Bundle selected, checksum-verified Mojang 1.12.2 sound assets for offline play."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import urllib.request

root = Path(__file__).resolve().parents[1]
def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()
source = json.loads((root / 'assets/classic-source.json').read_text())
version = json.loads(fetch(source['versionManifest']))
index_url = version['assetIndex']['url']
objects = json.loads(fetch(index_url))['objects']
prefixes = {}
for group in ['step', 'dig']:
    for material in ['gravel', 'sand', 'snow', 'wood', 'stone', 'grass', 'cloth']:
        prefixes[group + '_' + material] = group + '/' + material
prefixes.update({
    'water': 'liquid/water', 'lava': 'liquid/lava.', 'lavapop': 'liquid/lavapop',
    'splash': 'liquid/splash', 'swim': 'liquid/swim', 'portal_ambient': 'portal/portal',
    'portal_travel': 'portal/travel', 'portal_charge': 'portal/trigger',
    'flint': 'fire/ignite', 'fire': 'fire/fire', 'hurt': 'random/classic_hurt',
    'eat': 'random/eat', 'bow': 'random/bow.', 'arrow_hit': 'random/bowhit',
    'explode': 'random/explode', 'fizz': 'random/fizz', 'creeper': 'random/fuse',
    'glass': 'random/glass', 'craft': 'random/orb', 'golem': 'random/levelup',
    'attack': 'entity/player/attack/strong', 'sword': 'entity/player/attack/sweep',
    'drown': 'entity/player/hurt/drown', 'burn': 'entity/player/hurt/fire_hurt',
    'cave': 'ambient/cave/cave', 'pig': 'mob/pig/say', 'cow': 'mob/cow/say',
    'sheep': 'mob/sheep/say', 'zombie': 'mob/zombie/say', 'spider': 'mob/spider/say',
    'zombie_hurt': 'mob/zombie/hurt', 'cow_hurt': 'mob/cow/hurt',
})
sets = {}
for group, prefix in prefixes.items():
    matches = sorted(n for n in objects if n.startswith('minecraft/sounds/' + prefix) and n.endswith('.ogg'))[:2]
    assert matches, prefix
    sets[group] = matches
names = sorted({n for group in sets.values() for n in group})
def load(name):
    digest = objects[name]['hash']
    data = fetch('https://resources.download.minecraft.net/' + digest[:2] + '/' + digest)
    assert hashlib.sha1(data).hexdigest() == digest, name
    return name, 'data:audio/ogg;base64,' + base64.b64encode(data).decode('ascii')
print(f'Downloading {len(names)} classic sounds...', flush=True)
with ThreadPoolExecutor(max_workers=8) as pool:
    data = dict(pool.map(load, names))
bundle = {group: [data[n] for n in names] for group, names in sets.items()}
out = root / 'assets/classic-sounds.js'
out.write_text('// Minecraft 1.12.2 OGG audio, © Mojang. See classic-sound-source.json.\nconst CLASSIC_SOUNDS = ' + json.dumps(bundle, separators=(',', ':')) + ';\n', encoding='utf-8')
(root / 'assets/classic-sound-source.json').write_text(json.dumps({'assetIndex': index_url, 'version': '1.12.2', 'sounds': {n: objects[n]['hash'] for n in names}}, indent=2) + '\n')
print(f'Bundled {len(names)} clips in {len(bundle)} sound sets ({out.stat().st_size:,} bytes).', flush=True)
