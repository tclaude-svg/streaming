import json, subprocess, time, os, sys, signal, urllib.request
from playwright.sync_api import sync_playwright, expect

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MOCK, WEB = 4010, 3112
procs = []
def start(cmd, env_extra, wait_url):
    env = {**os.environ, **env_extra}
    p = subprocess.Popen(cmd, cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    procs.append(p)
    for _ in range(60):
        try: urllib.request.urlopen(wait_url); return p
        except Exception: time.sleep(0.2)
    raise RuntimeError('did not start: ' + ' '.join(cmd))

results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra and not cond else ''))
def mock(path): return json.load(urllib.request.urlopen(f'http://localhost:{MOCK}{path}'))

try:
    start(['node', 'test/mock-supabase.mjs'], {'MOCK_PORT': str(MOCK)}, f'http://localhost:{MOCK}/__log')
    start(['node', 'scripts/dev.mjs'], {'PORT': str(WEB), 'SUPABASE_URL': f'http://localhost:{MOCK}', 'SUPABASE_ANON_KEY': 'anon-key'}, f'http://localhost:{WEB}/')
    BASE = f'http://localhost:{WEB}'
    cfg = json.load(urllib.request.urlopen(BASE + '/config.json'))
    check('build wrote database settings to config.json', cfg['supabase'] == {'url': f'http://localhost:{MOCK}', 'anonKey': 'anon-key'}, cfg)
    check('build read games from the database', any('/rest/v1/games' in e['path'] and e['method'] == 'GET' for e in mock('/__log')))

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'status of 404' not in m.text and '401' not in m.text and '400' not in m.text else None)

        # --- sign in
        page.goto(BASE + '/admin/')
        expect(page.locator('h1.page-title')).to_have_text('Staff sign-in')
        check('games are hidden until signed in', page.locator('.adm-card').count() == 0)
        page.fill('#email', 'staff@test.org'); page.fill('#password', 'wrong')
        page.click('button[type=submit]')
        expect(page.locator('.adm-error')).to_contain_text('Invalid login credentials')
        check('wrong password shows an error', True)
        page.fill('#email', 'staff@test.org'); page.fill('#password', 'secret')
        page.click('button[type=submit]')
        expect(page.locator('.adm-card').first).to_be_visible()
        check('signed in: games listed', page.locator('.adm-card').count() == 10, page.locator('.adm-card').count())
        check('shows who is signed in', 'staff@test.org' in page.locator('.adm-mode').inner_text())
        check('no download/reset buttons in database mode', page.locator('[data-act=download]').count() == 0)

        # --- create a game
        page.click('[data-act=new]')
        page.select_option('#team', 'football-jv')
        page.fill('#opponent', 'Mock Opp')
        page.fill('#start', '2026-10-22T15:00')
        page.click('button[type=submit]')
        expect(page.locator('.adm-card', has_text='Mock Opp')).to_have_count(1)
        rows = mock('/__rows')
        row = next((r for r in rows if r['opponent'] == 'Mock Opp'), None)
        check('row saved in the database with snake_case columns', row and row['id'] == '2026-10-22-football-jv-mock-opp' and row['home_score'] is None and row['stream_id'] is None, row)
        check('start stored as Tashkent time', row and row['start'] == '2026-10-22T15:00:00+05:00', row and row['start'])
        log = mock('/__log')
        posts = [e for e in log if e['method'] == 'POST' and e['path'].startswith('/rest/v1/games')]
        check('writes use the staff token, never the anon key', posts and all(e['auth'] == 'user' for e in posts), posts)

        # --- public site picks the game up with no rebuild
        pub = ctx.new_page()
        pub.on('pageerror', lambda e: errors.append(str(e)))
        pub.goto(BASE + '/schedule/')
        built = pub.locator('main').get_attribute('data-sig')
        expect(pub.locator('.card', has_text='Mock Opp')).to_have_count(1)
        check('schedule shows the new game without a rebuild', True)
        check('list signature updated after re-render', pub.locator('main').get_attribute('data-sig') != built)
        pub.click('.chip[data-group=sport][data-value=basketball]')
        check('filters still work after the list was re-rendered', pub.locator('.card[data-sport=football]:visible').count() == 0 and pub.locator('.card:visible').count() > 0)
        pub.click('.chip[data-group=sport][data-value=football]')
        check('filter shows the new football game', pub.locator('.card', has_text='Mock Opp').is_visible())

        # --- game page that was never built
        resp = pub.goto(BASE + '/game/2026-10-22-football-jv-mock-opp/')
        check('server answers 404 for the unbuilt page', resp.status == 404, resp.status)
        expect(pub.locator('h1.page-title')).to_have_text('Owls vs Mock Opp')
        check('fallback renders the game page', 'Mock Opp' in pub.title())
        check('countdown/placeholder video state shown', pub.locator('.video-wait').is_visible())
        with pub.expect_download() as dl:
            pub.click('a[data-ics]')
        ics = open(dl.value.path()).read()
        check('calendar file generated in the browser', dl.value.suggested_filename.endswith('.ics') and 'SUMMARY:Owls vs Mock Opp' in ics and 'DTSTART:20261022T100000Z' in ics, ics[:300])
        resp = pub.goto(BASE + '/game/does-not-exist/')
        expect(pub.locator('#nf h1')).to_have_text('Page not found')
        check('unknown game shows page not found', True)

        # --- go live from the admin, public pages follow
        page.locator('.adm-card', has_text='Mock Opp').locator('[data-act=golive]').click()
        live = page.locator('.adm-card.is-live')
        live.locator('[data-act=score][data-side=home][data-delta="1"]').click()
        page.wait_for_timeout(700)
        row = next(r for r in mock('/__rows') if r['opponent'] == 'Mock Opp')
        check('live status and score saved', (row['status'], row['home_score'], row['away_score']) == ('live', 1, 0), row)
        pub.goto(BASE + '/')
        expect(pub.locator('.hero-title')).to_contain_text('Mock Opp')
        expect(pub.locator('.hero .live-badge')).to_be_visible()
        check('home hero switches to Live now with the score', pub.locator('.hero-score').inner_text().replace('\n', '') == '1–0', pub.locator('.hero-score').inner_text())
        pub.goto(BASE + '/game/2026-10-22-football-jv-mock-opp/')
        expect(pub.locator('.scoreboard .sb-num').first).to_have_text('1')
        check('game page scoreboard shows the live score', True)

        # --- session handling
        page.reload()
        expect(page.locator('.adm-card').first).to_be_visible()
        check('session survives a reload', True)
        page.evaluate("""() => { const s = JSON.parse(sessionStorage.getItem('tis-owls-admin-session')); s.expires_at = Date.now() - 1000; sessionStorage.setItem('tis-owls-admin-session', JSON.stringify(s)); }""")
        page.reload()
        expect(page.locator('.adm-card').first).to_be_visible()
        page.locator('.adm-card.is-live [data-act=score][data-side=away][data-delta="1"]').click()
        page.wait_for_timeout(900)
        log = mock('/__log')
        check('expired token is refreshed automatically', any('grant_type=refresh_token' in e['path'] for e in log))
        row = next(r for r in mock('/__rows') if r['opponent'] == 'Mock Opp')
        check('the write after refresh succeeded', row['away_score'] == 1, row)

        page.evaluate("""() => { const s = JSON.parse(sessionStorage.getItem('tis-owls-admin-session')); s.access_token = 'tok-bad'; s.expires_at = Date.now() + 600000; sessionStorage.setItem('tis-owls-admin-session', JSON.stringify(s)); }""")
        page.reload()
        expect(page.locator('.adm-card').first).to_be_visible()
        page.locator('.adm-card.is-live [data-act=score][data-side=away][data-delta="1"]').click()
        expect(page.locator('h1.page-title')).to_have_text('Staff sign-in')
        check('a rejected token sends staff back to sign-in', True)
        page.fill('#email', 'staff@test.org'); page.fill('#password', 'secret')
        page.click('button[type=submit]')
        expect(page.locator('.adm-card').first).to_be_visible()
        page.click('[data-act=signout]')
        expect(page.locator('h1.page-title')).to_have_text('Staff sign-in')
        check('sign out returns to sign-in and clears the session', page.evaluate("sessionStorage.getItem('tis-owls-admin-session')") is None)

        # --- delete
        page.fill('#email', 'staff@test.org'); page.fill('#password', 'secret')
        page.click('button[type=submit]')
        expect(page.locator('.adm-card').first).to_be_visible()
        page.on('dialog', lambda d: d.accept())
        page.locator('.adm-card', has_text='Mock Opp').locator('[data-act=edit]').click()
        page.click('[data-act=delete]')
        expect(page.locator('.adm-card').first).to_be_visible()   # back on the list
        expect(page.locator('.adm-card', has_text='Mock Opp')).to_have_count(0)
        check('delete removes the row', not any(r['opponent'] == 'Mock Opp' for r in mock('/__rows')))
        anon_writes = [e for e in mock('/__log') if e['method'] in ('POST', 'DELETE', 'PATCH') and e['path'].startswith('/rest') and e['auth'] != 'user']
        check('no write was ever sent without a staff token', not anon_writes, anon_writes)
        check('no unexpected console or page errors', not errors, errors)
        b.close()
finally:
    for pr in procs: pr.send_signal(signal.SIGTERM)

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
