# Opens the single-file preview (npm run demo) in a real browser and walks through it.
import os, sys, json, subprocess
from playwright.sync_api import sync_playwright, expect

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FILE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'dist/demo.html')
if len(sys.argv) <= 1: subprocess.run(['node', 'demo/build.mjs'], cwd=REPO, check=True)

results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra and not cond else ''))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'fonts' not in m.text and 'ERR_' not in m.text else None)
    page.on('dialog', lambda d: d.accept())
    page.goto('file://' + FILE)

    expect(page.locator('.hero-title')).to_contain_text('Owls')
    check('home renders with the next game and countdown', page.locator('[data-countdown]').count() == 1 and 'next game' in page.locator('.hero-kicker').inner_text().lower())
    check('rails show upcoming games and replays', page.locator('.rail .card').count() >= 4)

    # navigation without a server
    page.click('.topnav a[href="/schedule/"]') if page.locator('.topnav').is_visible() else page.click('.tabbar a[href="/schedule/"]')
    expect(page.locator('h1.page-title')).to_have_text('Live & Schedule')
    check('hash route updated', page.evaluate('location.hash') == '#/schedule/')
    n_all = page.locator('.grid .card:visible').count()
    page.click('.chip[data-group=sport][data-value=basketball]')
    n_b = page.locator('.grid .card:visible').count()
    check('sport filter narrows the list', 0 < n_b < n_all, (n_b, n_all))
    page.click('.chip[data-group=level][data-value=jv]')
    check('level filter combines', page.locator('.grid .card:visible').count() <= n_b)

    # a game page with the stand-in player
    page.click('.tabbar a[href="/replays/"]')
    expect(page.locator('h1.page-title')).to_have_text('Replays')
    check('filters do not leak from Schedule into Replays', page.locator('.chip[data-group=sport][aria-pressed=true]').inner_text() == 'All')
    page.locator('.grid .card a').first.click()
    expect(page.locator('.scoreboard')).to_be_visible()
    check('game page shows score banner', page.locator('.sb-num').count() == 2)
    check('replay-wait state when no replay link', page.locator('.video-wait').is_visible())
    with page.expect_download() as dl:
        page.click('a[data-ics]')
    check('add to calendar produces an .ics file', dl.value.suggested_filename.endswith('.ics') and 'BEGIN:VCALENDAR' in open(dl.value.path()).read())

    # tour: watch live
    page.click('.demo-fab')
    expect(page.locator('.demo-panel')).to_be_visible()
    check('tour lists the journeys', page.locator('.demo-panel a[href="/replays/"]').count() == 1)
    page.click('[data-demo=watch]')
    expect(page.locator('.hero .live-badge')).to_be_visible()
    check('watch live: hero shows Live now with 2-1', page.locator('.hero-score').inner_text().replace('\n', '') == '2–1')
    page.click('.hero-actions a')
    expect(page.locator('.scoreboard')).to_be_visible()
    check('live game page shows the stand-in player, not YouTube', page.locator('.demo-player').is_visible() and page.locator('iframe').count() == 0)
    check('live badge on the scoreboard', page.locator('.scoreboard .live-badge').count() == 1)

    # admin changes the public site
    page.click('.demo-fab'); page.click('a[href="/admin/"]')
    expect(page.locator('h1.page-title')).to_have_text('Game admin')
    live = page.locator('.adm-card.is-live')
    check('admin sees the live game started from the tour', live.count() == 1)
    live.locator('[data-act=score][data-side=home][data-delta="1"]').click()
    page.wait_for_timeout(700)
    page.click('[data-act=new]')
    page.select_option('#team', 'volleyball-varsity')
    page.fill('#opponent', 'Preview Prep'); page.fill('#start', '2026-12-01T16:00')
    page.click('button[type=submit]')
    expect(page.locator('.adm-card', has_text='Preview Prep')).to_have_count(1)
    page.click('.tabbar a[href="/schedule/"]')
    expect(page.locator('.card', has_text='Preview Prep')).to_have_count(1)
    check('a game added in admin appears on the public schedule', True)
    page.goto('file://' + FILE + '#/')
    expect(page.locator('.hero-score')).to_be_visible()
    check('score changed in admin shows on the home hero', page.locator('.hero-score').inner_text().replace('\n', '') == '3–1', page.locator('.hero-score').inner_text())

    # end game and reset
    page.click('.demo-fab'); page.click('[data-demo=end]')
    expect(page.locator('h1.page-title')).to_have_text('Replays')
    check('ending the game moves it to replays with its score', page.locator('.card-score', has_text='3').count() >= 1)
    page.click('.demo-fab'); page.click('[data-demo=reset]')
    expect(page.locator('.demo-msg')).to_have_text('Demo data reset.')
    page.click('.tabbar a[href="/schedule/"]')
    check('reset removes the added game', page.locator('.card', has_text='Preview Prep').count() == 0)
    page.goto('file://' + FILE + '#/nope/')
    check('unknown address shows page not found', 'Page not found' in page.locator('h1.page-title').inner_text())
    check('no console or page errors', not errors, errors)
    b.close()

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
