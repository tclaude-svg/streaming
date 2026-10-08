# Browser test for the change history page and undo, against the mock database.
# Run: python3 test/e2e/history.py
import json, subprocess, time, os, sys, signal, urllib.request
from playwright.sync_api import sync_playwright, expect

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MOCK, WEB = 4012, 3114
GAME = '2026-10-10-football-jv-silk'
procs = []

def start(cmd, env_extra, wait_url):
    p = subprocess.Popen(cmd, cwd=REPO, env={**os.environ, **env_extra}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    procs.append(p)
    for _ in range(60):
        try: urllib.request.urlopen(wait_url); return p
        except Exception: time.sleep(0.2)
    raise RuntimeError('did not start: ' + ' '.join(cmd))

def wait_until(cond, timeout=6.0):
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
def row(): return next((r for r in mock('/__rows') if r['id'] == GAME), None)

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
            pg.on('dialog', lambda d: d.accept())
            pg.goto(BASE + '/admin/')
            pg.fill('#email', email); pg.fill('#password', 'secret')
            pg.click('[data-signin] button[type=submit]')
            expect(pg.locator('.adm-card').first).to_be_visible()
            return pg

        sco = new_page('scorer@test.org')
        check('scorer has no History button', sco.locator('[data-act=history]').count() == 0)
        card = sco.locator(f'.adm-card[data-id="{GAME}"]')
        card.locator('[data-act=golive]').click()
        for _ in range(3):
            sco.locator('.adm-card.is-live [data-act=score][data-side=home][data-delta="1"]').click()
        wait_until(lambda: row()['home_score'] == 3)

        adm = new_page('staff@test.org')
        adm.locator(f'.adm-card[data-id="{GAME}"] [data-act=edit]').click()
        adm.fill('#venue', 'Main gym')
        adm.click('[data-form] button[type=submit]')
        wait_until(lambda: row()['venue'] == 'Main gym')

        adm.click('[data-act=history]')
        expect(adm.locator('h1.page-title')).to_have_text('Change history')
        items = adm.locator('.adm-card')
        texts = [items.nth(i).inner_text() for i in range(items.count())]
        check('three entries: venue edit, score run, go-live', len(texts) == 3, texts)
        check('newest first: the venue edit, by the admin', 'Venue: Home field → Main gym' in texts[0] and 'staff@test.org' in texts[0], texts[0])
        check('score taps grouped into one entry', 'Score 0–0 → 3–0' in texts[1] and 'scorer@test.org' in texts[1], texts[1])
        check('go-live shows the status change', 'Status: Upcoming → Live' in texts[2], texts[2])

        # undo the venue change
        items.nth(0).locator('[data-act=undo]').click()
        wait_until(lambda: row()['venue'] == 'Home field')
        check('undo puts the venue back', row()['venue'] == 'Home field' and row()['home_score'] == 3, row())
        check('undo is itself recorded', wait_until(lambda: len(mock('/__history')) == 4))

        # undo the score run (later changes exist; the confirm warns and is accepted)
        score_item = adm.locator('.adm-card', has_text='Score 0–0 → 3–0')
        score_item.locator('[data-act=undo]').click()
        wait_until(lambda: row()['home_score'] == 0)
        check('undo restores the score', row()['home_score'] == 0, row())

        # delete, then undo the delete
        adm.click('[data-act=cancel]')
        adm.locator(f'.adm-card[data-id="{GAME}"] [data-act=edit]').click()
        adm.click('[data-act=delete]')
        wait_until(lambda: row() is None)
        adm.click('[data-act=history]')
        expect(adm.locator('.adm-card').first).to_contain_text('Deleted the game')
        adm.locator('.adm-card').first.locator('[data-act=undo]').click()
        wait_until(lambda: row() is not None)
        check('undo brings a deleted game back', row() is not None and row()['opponent'] == 'Silk Road Academy', row())
        adm.click('[data-act=cancel]')
        check('restored game is back in the list', adm.locator(f'.adm-card[data-id="{GAME}"]').count() == 1)

        check('no page errors', not errors, errors)
        b.close()
finally:
    for pr in procs: pr.send_signal(signal.SIGTERM)

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
