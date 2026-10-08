import json, subprocess, time, os, sys, signal, urllib.request
from playwright.sync_api import sync_playwright, expect

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 3111
env = {**os.environ, 'PORT': str(PORT)}
env.pop('SUPABASE_ANON_KEY', None); env['SUPABASE_URL'] = 'off'  # preview mode even though site.config.json names the database
srv = subprocess.Popen(['node', 'scripts/dev.mjs'], cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
for _ in range(50):
    try: urllib.request.urlopen(f'http://localhost:{PORT}/'); break
    except Exception: time.sleep(0.2)

BASE = f'http://localhost:{PORT}'

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

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, timezone_id='America/New_York')
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        dialogs = []
        page.on('dialog', lambda d: (dialogs.append(d.message), d.accept()))

        page.goto(BASE + '/admin/')
        expect(page.locator('h1.page-title')).to_have_text('Game admin')
        check('preview mode label shown', page.locator('.adm-mode').inner_text() == 'Preview mode')
        check('admin page is noindex', page.locator('meta[name=robots]').get_attribute('content').startswith('noindex'))
        check('existing sample games listed', page.locator('.adm-card').count() == 10, page.locator('.adm-card').count())

        # --- validation
        page.click('[data-act=new]')
        check('no photo upload without the database', page.locator('#cover-file').count() == 0)
        page.click('button[type=submit]')
        check('empty opponent rejected', page.locator('#opponent-err').is_visible())
        check('empty start rejected', page.locator('#start-err').is_visible())
        check('focus moves to first invalid field', page.evaluate("document.activeElement.id") == 'opponent', page.evaluate("document.activeElement.id"))
        page.fill('#opponent', 'Test Opponent')
        page.fill('#start', '2026-10-20T17:30')
        page.fill('#stream', 'not a youtube link')
        page.click('button[type=submit]')
        check('bad youtube link rejected', page.locator('#stream-err').is_visible())
        check('typed values kept after an error', page.input_value('#opponent') == 'Test Opponent' and page.input_value('#start') == '2026-10-20T17:30')

        # --- create (the five-minute journey: add, paste link, go live)
        page.select_option('#team', 'basketball-varsity')
        page.fill('#stream', 'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share')
        page.click('button[type=submit]')
        card = page.locator('.adm-card', has_text='Test Opponent')
        check('new game appears in upcoming', card.count() == 1)
        check('shows Tashkent time, not browser time (browser is New York)', '17:30' in card.inner_text(), card.inner_text())
        saved = json.loads(page.evaluate("localStorage.getItem('tis-owls-admin-draft-v1')"))
        g = next(x for x in saved if x['opponent'] == 'Test Opponent')
        check('id is readable', g['id'] == '2026-10-20-basketball-varsity-test-opponent', g['id'])
        check('start stored with +05:00', g['start'] == '2026-10-20T17:30:00+05:00', g['start'])
        check('stream id extracted', g['streamId'] == 'dQw4w9WgXcQ', g['streamId'])

        # --- go live + score
        card.locator('[data-act=golive]').click()
        live = page.locator('.adm-card.is-live')
        check('game is now live with score controls', live.count() == 1 and live.locator('[data-out=home]').inner_text() == '0')
        live.locator('[data-act=score][data-side=home][data-delta="1"]').click()
        live.locator('[data-act=score][data-side=home][data-delta="1"]').click()
        live.locator('[data-act=score][data-side=away][data-delta="1"]').click()
        live.locator('[data-act=score][data-side=away][data-delta="-1"]').click()
        live.locator('[data-act=score][data-side=away][data-delta="-1"]').click()
        check('score cannot go below zero', live.locator('[data-out=away]').inner_text() == '0')
        live.locator('[data-act=score][data-side=away][data-delta="1"]').click()
        wait_until(lambda: next(x for x in json.loads(page.evaluate("localStorage.getItem('tis-owls-admin-draft-v1')")) if x['opponent'] == 'Test Opponent')['awayScore'] == 1)
        saved = json.loads(page.evaluate("localStorage.getItem('tis-owls-admin-draft-v1')"))
        g = next(x for x in saved if x['opponent'] == 'Test Opponent')
        check('debounced score saved (2-1, live)', (g['homeScore'], g['awayScore'], g['status']) == (2, 1, 'live'), g)
        check('saved message shown', page.locator('#adm-msg').inner_text() == 'Saved')

        # --- end game, add replay
        live.locator('[data-act=end]').click()
        fin = page.locator('.adm-card', has_text='Test Opponent')
        check('ended game shows final score', '2–1' in fin.inner_text().replace('\n', ''), fin.inner_text())
        check('ending a streamed game uses the stream as the replay', 'No replay link yet' not in fin.inner_text() and 'replay' in page.locator('#adm-msg').inner_text().lower())
        fin.locator('[data-act=edit]').click()
        check('edit form is prefilled with a clean stream link', page.input_value('#stream') == 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
        page.fill('#replay', 'https://youtu.be/aaaaaaaaaaa')
        page.click('button[type=submit]')
        saved = json.loads(page.evaluate("localStorage.getItem('tis-owls-admin-draft-v1')"))
        g = next(x for x in saved if x['opponent'] == 'Test Opponent')
        check('replay saved and id unchanged', g['replayId'] == 'aaaaaaaaaaa' and g['id'] == '2026-10-20-basketball-varsity-test-opponent')

        # --- persistence + export
        page.reload()
        expect(page.locator('.adm-card', has_text='Test Opponent')).to_have_count(1)
        check('draft survives reload', True)
        with page.expect_download() as dl:
            page.click('[data-act=download]')
        path = dl.value.path()
        doc = json.load(open(path))
        check('downloaded file is games.json shape', dl.value.suggested_filename == 'games.json' and 'games' in doc and len(doc['games']) == 11)
        check('downloaded games are sorted by start', [x['start'] for x in doc['games']] == sorted([x['start'] for x in doc['games']]))

        # --- delete + reset
        page.locator('.adm-card', has_text='Test Opponent').locator('[data-act=edit]').click()
        page.click('[data-act=delete]')
        expect(page.locator('.adm-card').first).to_be_visible()   # back on the list
        check('delete asked for confirmation', any('Delete this game' in d for d in dialogs), dialogs)
        check('deleted game is gone', page.locator('.adm-card', has_text='Test Opponent').count() == 0)
        stored = json.loads(page.evaluate("localStorage.getItem('tis-owls-admin-draft-v1')"))
        check('deleted game is gone from the saved draft', all(x['opponent'] != 'Test Opponent' for x in stored) and len(stored) == 10)
        # a second game, then reset brings the site data back
        page.click('[data-act=new]'); page.fill('#opponent', 'Throwaway'); page.fill('#start', '2026-11-01T10:00'); page.click('button[type=submit]')
        expect(page.locator('.adm-card', has_text='Throwaway')).to_have_count(1)
        page.click('[data-act=reset]')
        expect(page.locator('.adm-card')).to_have_count(10)
        check('reset asked for confirmation', any('Discard the changes' in d for d in dialogs))
        check('reset restored the site data', page.locator('.adm-card', has_text='Throwaway').count() == 0 and page.evaluate("localStorage.getItem('tis-owls-admin-draft-v1')") is None)
        check('no console or page errors', not errors, errors)
        b.close()
finally:
    srv.send_signal(signal.SIGTERM)

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
