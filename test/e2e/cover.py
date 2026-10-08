# Browser test for cover photo upload: resized, location data removed, saved on the game, shown on the site.
# Run: python3 test/e2e/cover.py   (needs Pillow to make the test photo)
import json, subprocess, time, os, sys, signal, urllib.request, tempfile, io
from playwright.sync_api import sync_playwright, expect
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MOCK, WEB = 4014, 3116
GAME = '2026-10-16-football-varsity-eastfield'
procs = []

def start(cmd, env_extra, wait_url):
    p = subprocess.Popen(cmd, cwd=REPO, env={**os.environ, **env_extra}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    procs.append(p)
    for _ in range(60):
        try: urllib.request.urlopen(wait_url); return p
        except Exception: time.sleep(0.2)
    raise RuntimeError('did not start: ' + ' '.join(cmd))

def wait_until(cond, timeout=8.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if cond(): return True
        except Exception: pass
        time.sleep(0.1)
    return False

results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra and not cond else ''))
def mock(path): return json.load(urllib.request.urlopen(f'http://localhost:{MOCK}{path}'))
def row(): return next(r for r in mock('/__rows') if r['id'] == GAME)

# A 3000x2000 photo carrying GPS coordinates and a camera name in its EXIF data.
tmp = tempfile.mkdtemp()
photo = os.path.join(tmp, 'match.jpg')
img = Image.new('RGB', (3000, 2000), (20, 60, 140))
exif = Image.Exif()
exif[0x010F] = 'TestCamera'                         # Make
exif[0x8825] = {1: 'N', 2: (41.0, 18.0, 0.0), 3: 'E', 4: (69.0, 16.0, 0.0)}  # GPS (Tashkent)
img.save(photo, 'JPEG', exif=exif.tobytes())
with open(photo, 'rb') as f: raw = f.read()
assert b'TestCamera' in raw and Image.open(photo).getexif().get(0x8825)  # the original carries camera and GPS data

try:
    start(['node', 'test/mock-supabase.mjs'], {'MOCK_PORT': str(MOCK)}, f'http://localhost:{MOCK}/__log')
    start(['node', 'scripts/dev.mjs'], {'PORT': str(WEB), 'SUPABASE_URL': f'http://localhost:{MOCK}', 'SUPABASE_ANON_KEY': 'anon-key'}, f'http://localhost:{WEB}/')
    BASE = f'http://localhost:{WEB}'

    with sync_playwright() as p:
        b = p.chromium.launch()
        errors = []
        pg = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(BASE + '/admin/')
        pg.fill('#email', 'staff@test.org'); pg.fill('#password', 'secret')
        pg.click('[data-signin] button[type=submit]')
        expect(pg.locator('.adm-card').first).to_be_visible()
        pg.locator(f'.adm-card[data-id="{GAME}"] [data-act=edit]').click()
        check('game form has a photo upload with a consent reminder', pg.locator('#cover-file').count() == 1 and 'consent' in pg.locator('#cover-file-help').inner_text())

        pg.set_input_files('#cover-file', photo)
        expect(pg.locator('#cover-status')).to_contain_text('Photo uploaded')
        stored = mock('/__covers')
        check('one photo stored as JPEG', len(stored) == 1 and stored[0]['type'] == 'image/jpeg', stored)
        url = pg.input_value('#cover')
        check('cover address filled in', url.startswith(f'http://localhost:{MOCK}/storage/v1/object/public/covers/') and url.endswith('.jpg'), url)

        data = urllib.request.urlopen(url).read()
        up = Image.open(io.BytesIO(data))
        check('photo resized to 1600 px on the long side', up.size == (1600, 1067), up.size)
        check('camera and location data removed', b'TestCamera' not in data and not up.getexif().get(0x8825) and not up.getexif().get(0x010F))
        check('photo is much smaller than the original', len(data) < len(raw), (len(data), len(raw)))

        pg.click('[data-form] button[type=submit]')
        wait_until(lambda: row()['cover'] == url)
        check('saved on the game', row()['cover'] == url, row().get('cover'))

        pub = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
        pub.goto(BASE + '/schedule/')
        card = pub.locator('.card', has_text='Eastfield')
        expect(card.first).to_be_visible()
        wait_until(lambda: url in (pub.content()))
        check('public schedule card uses the photo', url in pub.content())

        # A non-image file is refused before anything is uploaded.
        txt = os.path.join(tmp, 'notes.txt')
        open(txt, 'w').write('hello')
        pg.locator(f'.adm-card[data-id="{GAME}"] [data-act=edit]').click()
        pg.set_input_files('#cover-file', txt)
        expect(pg.locator('#cover-status')).to_contain_text('Choose a photo')
        check('non-image file refused', len(mock('/__covers')) == 1)

        check('no page errors', not errors, errors)
        b.close()
finally:
    for pr in procs: pr.send_signal(signal.SIGTERM)

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
