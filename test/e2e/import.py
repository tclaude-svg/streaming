# Browser test for importing fixtures from pasted spreadsheet rows and a CSV file, against the mock database.
# Run: python3 test/e2e/import.py
import json, subprocess, time, os, sys, signal, urllib.request, tempfile
from playwright.sync_api import sync_playwright, expect

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MOCK, WEB = 4013, 3115
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

# Pasted from a spreadsheet: tab-separated, header in a custom order, one bad row, one game already in the database.
PASTE = '\n'.join([
    'Date\tTime\tSport\tLevel\tOpponent\tVenue',
    '20/11/2026\t15:30\tVolleyball\tVarsity\tSilk Road Academy\tMain gym',
    '21/11/2026\t4pm\tBasketball\tJV\tNorthgate School\t',
    '22/11/2026\tafternoon\tTennis\tVarsity\tSomeone\t',
    '16/10/2026\t16:00\tFootball\tVarsity\tEastfield College\t',
])

try:
    start(['node', 'test/mock-supabase.mjs'], {'MOCK_PORT': str(MOCK)}, f'http://localhost:{MOCK}/__log')
    start(['node', 'scripts/dev.mjs'], {'PORT': str(WEB), 'SUPABASE_URL': f'http://localhost:{MOCK}', 'SUPABASE_ANON_KEY': 'anon-key'}, f'http://localhost:{WEB}/')
    BASE = f'http://localhost:{WEB}'

    with sync_playwright() as p:
        b = p.chromium.launch()
        errors = []
        def new_page(email):
            pg = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(BASE + '/admin/')
            pg.fill('#email', email); pg.fill('#password', 'secret')
            pg.click('[data-signin] button[type=submit]')
            expect(pg.locator('.adm-card').first).to_be_visible()
            return pg

        sco = new_page('scorer@test.org')
        check('scorers cannot import', sco.locator('[data-act=import]').count() == 0)

        adm = new_page('staff@test.org')
        adm.click('[data-act=import]')
        expect(adm.locator('h1.page-title')).to_have_text('Import fixtures')
        adm.fill('#import-text', PASTE)
        adm.click('[data-import] button[type=submit]')
        expect(adm.locator('[data-line]')).to_have_count(4)
        check('preview lists every row', True)
        check('two games are ready', '2 games are ready' in adm.locator('#import-summary').inner_text(), adm.locator('#import-summary').inner_text())
        bad = adm.locator('[data-line="4"]').inner_text()
        check('bad row explains what to fix', 'time not recognised' in bad and 'sport and level not recognised' in bad, bad)
        check('game already in the database is skipped', 'Already added' in adm.locator('[data-line="5"]').inner_text())
        check('ready row shows team, date and venue', 'Varsity Volleyball' in adm.locator('[data-line="2"]').inner_text() or 'Volleyball' in adm.locator('[data-line="2"]').inner_text())

        before = len(mock('/__rows'))
        adm.click('[data-act=import-add]')
        wait_until(lambda: len(mock('/__rows')) == before + 2)
        rows = {r['id']: r for r in mock('/__rows')}
        v = rows.get('2026-11-20-volleyball-varsity-silk-road-academy')
        bj = rows.get('2026-11-21-basketball-jv-northgate-school')
        check('two games added to the database', v is not None and bj is not None, list(rows)[-3:])
        check('times stored as Tashkent time', v and v['start'] == '2026-11-20T15:30:00+05:00' and bj and bj['start'] == '2026-11-21T16:00:00+05:00', (v or {}).get('start'))
        check('venue kept, blank venue becomes Home field', v and v['venue'] == 'Main gym' and bj and bj['venue'] == 'Home field')
        check('result message counts the games added', 'Added 2 games' in adm.locator('#adm-msg').inner_text(), adm.locator('#adm-msg').inner_text())
        check('add button is gone once everything is added', adm.locator('[data-act=import-add]').count() == 0)

        # Same sheet again: nothing new to add.
        adm.click('[data-import] button[type=submit]')
        expect(adm.locator('[data-line]')).to_have_count(4)
        check('re-importing the same rows adds nothing', '0 games are ready' in adm.locator('#import-summary').inner_text())

        # A CSV file is read and checked as soon as it is chosen.
        with tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False) as f:
            f.write('opponent,date,time,team\n"Lakeview Prep, B team",05/12/2026,17:00,Basketball Varsity\n')
            path = f.name
        adm.set_input_files('#import-file', path)
        expect(adm.locator('[data-line]')).to_have_count(1)
        check('CSV file with quoted names is understood', 'Lakeview Prep, B team' in adm.locator('[data-line="2"]').inner_text())
        adm.click('[data-act=import-add]')
        check('CSV game added', wait_until(lambda: any(r['opponent'] == 'Lakeview Prep, B team' for r in mock('/__rows'))))
        adm.click('[data-act=cancel]')
        check('imported games appear in the admin list', adm.locator('.adm-card', has_text='Silk Road Academy').count() >= 1)

        check('no page errors', not errors, errors)
        b.close()
finally:
    for pr in procs: pr.send_signal(signal.SIGTERM)

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
