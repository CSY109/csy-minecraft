"""Import selected classic textures from Mojang's checksum-verified 1.12.2 client.

Only the small PNGs used by this game are embedded; no client code is copied.
The bundle works offline, including when opening index.html using file://.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()

manifest = json.loads(fetch(MANIFEST))
version_url = next(v['url'] for v in manifest['versions'] if v['id'] == '1.12.2')
version = json.loads(fetch(version_url))
client = version['downloads']['client']
print('Downloading classic client textures...', flush=True)
jar = fetch(client['url'])
assert hashlib.sha1(jar).hexdigest() == client['sha1'], 'Client checksum mismatch'

items = ['stick', 'coal', 'iron_ingot', 'gold_ingot', 'diamond', 'porkchop_raw',
         'porkchop_cooked', 'apple', 'string', 'arrow', 'bow_standby',
         'bow_pulling_0', 'bow_pulling_1', 'bow_pulling_2', 'spawn_egg', 'spawn_egg_overlay']
items += [m + '_' + t for m in ['wood', 'stone', 'iron', 'diamond'] for t in ['pickaxe', 'axe', 'shovel', 'sword']]
items += ['flint', 'flint_and_steel', 'bucket_empty', 'bucket_water', 'bucket_lava', 'gunpowder']
entities = {'pig': 'pig/pig', 'cow': 'cow/cow', 'sheep': 'sheep/sheep', 'sheep_fur': 'sheep/sheep_fur',
            'zombie': 'zombie/zombie', 'spider': 'spider/spider', 'creeper': 'creeper/creeper',
            'iron_golem': 'iron_golem', 'snow_golem': 'snowman', 'bed_red': 'bed/red'}
blocks = ['iron_block', 'gold_block', 'diamond_block', 'gold_ore', 'diamond_ore',
          'wool_colored_white', 'cobblestone_mossy', 'clay', 'obsidian', 'pumpkin_face_off',
          'pumpkin_side', 'pumpkin_top', 'crafting_table_top', 'crafting_table_side', 'crafting_table_front']
blocks += ['destroy_stage_' + str(i) for i in range(10)]
blocks += ['netherrack', 'soul_sand', 'nether_brick', 'glowstone', 'quartz_ore', 'magma', 'lava_still', 'portal']
blocks += ['torch_on', 'fire_layer_0']
bundle = {}
with zipfile.ZipFile(io.BytesIO(jar)) as archive:
    for key, relative in ([(i, 'items/' + i) for i in items]
                          + [('entity_' + k, 'entity/' + p) for k, p in entities.items()]
                          + [('block_' + b, 'blocks/' + b) for b in blocks]
                          + [('gui_icons', 'gui/icons'), ('gui_widgets', 'gui/widgets')]):
        png = archive.read('assets/minecraft/textures/' + relative + '.png')
        bundle[key] = 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')

out = ROOT / 'assets'
out.mkdir(exist_ok=True)
(out / 'classic-textures.js').write_text(
    "// Classic Minecraft 1.12.2 PNG artwork, © Mojang. Source recorded in classic-source.json.\n"
    "// Embedded for offline play; see tools/import-classic-textures.py to reproduce.\n"
    "const CLASSIC_TEXTURES = " + json.dumps(bundle, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
(out / 'classic-source.json').write_text(json.dumps({
    'version': '1.12.2', 'publisher': 'Mojang', 'manifest': MANIFEST,
    'versionManifest': version_url, 'client': client['url'], 'clientSha1': client['sha1'],
    'textures': list(bundle)
}, indent=2) + '\n', encoding='utf-8')
print(f'Imported {len(bundle)} textures ({(out / "classic-textures.js").stat().st_size:,} bytes).', flush=True)
