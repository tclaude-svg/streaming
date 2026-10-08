# Browser test for staff roles, takedowns, automatic replays, the staff page and account setup,
# against the mock database (test/mock-supabase.mjs). Run: python3 test/e2e/roles.py
import json, subprocess, time, os, sys, signal, urllib.request
from playwright.sync_api import sync_playwright, expect

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MOCK, WEB = 4011, 3113
STREAM = 'dQw4w9WgXcQ'
GAME = '2026-10-09-football-varsity-riverside'
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
def row(): return next(r for r in mock('/__rows') if r['id'] == GAME)

def sign_in(page, email):
    page.goto(BASE + '/admin/')
    page.fill('#email', email); page.fill('#password', 'secret')
    page.click('[data-signin] button[type=submit]')

try:
    start(['node', 'test/mock-supabase.mjs'], {'MOCK_PORT': str(MOCK)}, f'http://localhost:{MOCK}/__log')
    start(['node', 'scripts/dev.mjs'], {'PORT': str(WEB), 'SUPABASE_URL': f'http://localhost:{MOCK}', 'SUPABASE_ANON_KEY': 'anon-key'}, f'http://localhost:{WEB}/')
    BASE = f'http://localhost:{WEB}'

    with sync_playwright() as p:
        b = p.chromium.launch()
        errors = []
        def new_page():
            ctx = b.new_context(viewport={'width': 390, 'height': 844})
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and not any(c in m.text for c in ('404', '401', '400', '403', '500')) else None)
            pg.on('dialog', lambda d: d.accept())
            return pg

        # --- admin adds a stream link to a scheduled game
        adm = new_page()
        sign_in(adm, 'staff@test.org')
        expect(adm.locator('.adm-card').first).to_be_visible()
        check('admin sees the role in the header', 'Admin' in adm.locator('.adm-modeline').inner_text())
        check('admin sees Add game and Staff', adm.locator('[data-act=new]').count() == 1 and adm.locator('[data-act=staff]').count() == 1)
        adm.locator(f'.adm-card[data-id="{GAME}"] [data-act=edit]').click()
        adm.fill('#stream', f'https://youtu.be/{STREAM}')
        adm.click('[data-form] button[type=submit]')
        wait_until(lambda: row()['stream_id'] == STREAM)
        check('editing an existing game updates it (no duplicate)', row()['stream_id'] == STREAM and len(mock('/__rows')) == 10)
        check('existing games save with an update, not an insert', any(e['method'] == 'PATCH' and GAME in e['path'] for e in mock('/__log')))

        # --- scorer runs the game
        sco = new_page()
        sign_in(sco, 'scorer@test.org')
        expect(sco.locator('.adm-card').first).to_be_visible()
        check('scorer sees the scorer note', 'scorer' in sco.locator('.adm-note').first.inner_text().lower())
        check('scorer has no Add game, Edit, Hide or Staff buttons',
              sco.locator('[data-act=new], [data-act=edit], [data-act=hide], [data-act=staff]').count() == 0)
        sco.locator(f'.adm-card[data-id="{GAME}"] [data-act=golive]').click()
        sco.locator('.adm-card.is-live [data-act=score][data-side=home][data-delta="1"]').click()
        wait_until(lambda: row()['home_score'] == 1)
        check('scorer goes live and scores', (row()['status'], row()['home_score']) == ('live', 1), row())
        sco.locator('.adm-card.is-live [data-act=end]').click()
        wait_until(lambda: row()['status'] == 'final')
        check('ending the game uses the stream as the replay', row()['replay_id'] == STREAM, row())
        check('scorer is told the replay was set', 'replay' in sco.locator('#adm-msg').inner_text().lower())
        pub = new_page()
        pub.goto(BASE + f'/game/{GAME}/')
        expect(pub.locator('iframe')).to_have_count(1)
        check('public game page plays the replay', STREAM in (pub.locator('iframe').get_attribute('src') or ''))

        # --- takedown
        adm.reload()
        expect(adm.locator('.adm-card').first).to_be_visible()
        adm.locator(f'.adm-card[data-id="{GAME}"] [data-act=hide]').click()
        wait_until(lambda: row()['hidden'] is True)
        check('admin hides the game', row()['hidden'] is True)
        check('hidden game is marked in the admin', 'Hidden' in adm.locator(f'.adm-card[data-id="{GAME}"]').inner_text())
        pub.goto(BASE + '/replays/')
        expect(pub.locator('main')).to_be_visible()
        wait_until(lambda: pub.locator('.card', has_text='Riverside').count() == 0)
        check('public replays no longer show the hidden game', pub.locator('.card', has_text='Riverside').count() == 0)
        sco.reload()
        expect(sco.locator('.adm-card').first).to_be_visible()
        check('scorer still sees the hidden game in the admin', sco.locator(f'.adm-card[data-id="{GAME}"]').count() == 1)
        adm.locator(f'.adm-card[data-id="{GAME}"] [data-act=show]').click()
        wait_until(lambda: row()['hidden'] is False)
        check('admin shows it again', row()['hidden'] is False)

        # --- staff page
        adm.click('[data-act=staff]')
        expect(adm.locator('h1.page-title')).to_have_text('Staff')
        check('staff page lists both staff', adm.locator('.adm-card').count() == 2)
        mine = adm.locator('.adm-card', has_text='staff@test.org')
        check('own row has no role or remove buttons', mine.locator('button').count() == 0)
        adm.fill('#staff-email', 'not-an-email')
        adm.click('[data-staff-add] button[type=submit]')
        check('bad email is refused in the form', 'full email' in adm.locator('.adm-error').inner_text())
        adm.fill('#staff-email', 'Coach@Test.org')
        adm.select_option('#staff-role', 'scorer')
        adm.click('[data-staff-add] button[type=submit]')
        wait_until(lambda: 'coach@test.org' in mock('/__staff'))
        check('admin adds a scorer (email lowercased)', mock('/__staff').get('coach@test.org') == 'scorer', mock('/__staff'))
        adm.locator('.adm-card', has_text='coach@test.org').locator('[data-act=staff-role]').click()
        wait_until(lambda: mock('/__staff').get('coach@test.org') == 'admin')
        check('admin promotes them to admin', mock('/__staff').get('coach@test.org') == 'admin')
        adm.locator('.adm-card', has_text='coach@test.org').locator('[data-act=staff-remove]').click()
        wait_until(lambda: 'coach@test.org' not in mock('/__staff'))
        check('admin removes them', 'coach@test.org' not in mock('/__staff'))

        # --- account setup
        new = new_page()
        new.goto(BASE + '/admin/')
        new.click('[data-act=to-setup]')
        new.fill('#email', 'nobody@test.org'); new.fill('#password', 'longenough')
        new.click('[data-setup] button[type=submit]')
        expect(new.locator('.adm-error')).to_contain_text('not on the staff list')
        check('setup refuses an email that is not on the list', True)
        new.fill('#email', 'scorer@test.org'); new.fill('#password', 'short')
        new.click('[data-setup] button[type=submit]')
        check('setup asks for 8+ character passwords', '8 characters' in new.locator('.adm-error').inner_text())
        new.fill('#email', 'Scorer@test.org'); new.fill('#password', 'longenough')
        new.click('[data-setup] button[type=submit]')
        expect(new.locator('h1.page-title')).to_have_text('Staff sign-in')
        check('setup for a listed email asks to confirm by email', 'confirmation' in new.locator('.adm-msg').inner_text() and 'scorer@test.org' in mock('/__signups'))

        # --- signed in but not staff
        out = new_page()
        sign_in(out, 'outsider@test.org')
        expect(out.locator('.adm-error')).to_contain_text('not on the staff list')
        check('non-staff account sees a clear message and no games', out.locator('.adm-card').count() == 0)

        check('no unexpected console or page errors', not errors, errors)
        b.close()
finally:
    for pr in procs: pr.send_signal(signal.SIGTERM)

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
