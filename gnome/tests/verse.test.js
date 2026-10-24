// Verse rotation against the live OurManna API, with a throwaway cache dir:
//   XDG_CACHE_HOME=$(mktemp -d) gjs -m gnome/tests/verse.test.js
import GLib from 'gi://GLib';
import {VerseProvider} from '../vigil@kigathi-chege.github.io/verse.js';

const settings = {get_string: () => 'online'};
const extDir = GLib.build_filenamev([GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace('file://', ''))), 'vigil@kigathi-chege.github.io']);
const cacheFile = GLib.build_filenamev([GLib.get_user_cache_dir(), 'vigil', 'verse.json']);
const today = GLib.DateTime.new_now_local().format('%Y-%m-%d');
const loop = new GLib.MainLoop(null, false);
const wait = ms => new Promise(r => GLib.timeout_add(0, ms, () => { r(); return false; }));
const out = [];
const check = (name, ok) => { out.push(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) out.failed = true; };

(async () => {
    // Yesterday's verse cached under today's date by the old code (no fetchedAt): must re-check.
    GLib.mkdir_with_parents(GLib.path_get_dirname(cacheFile), 0o755);
    GLib.file_set_contents(cacheFile, JSON.stringify({text: 'stale', reference: 'Stale 1:1', date: today}));
    let p = new VerseProvider(extDir, settings, () => {});
    p.ensureToday();
    await wait(8000);
    check('stale same-day cache is re-checked', p.verse.reference !== 'Stale 1:1' && p.verse.fetchedAt > 0);
    const daily = p.verse.reference;

    // Fresh fetch: no further request for 4 hours.
    p._fetching = false;
    let fetched = false;
    const orig = p.refresh.bind(p);
    p.refresh = r => { fetched = true; return orig(r); };
    p.ensureToday();
    check('fresh verse is not re-fetched', !fetched);

    // "Another verse" sticks for the day, even after the re-check interval.
    p.refresh = orig;
    await p.refresh(true);
    p.verse.fetchedAt -= 5 * 3600;
    p.refresh = r => { fetched = true; return orig(r); };
    p.ensureToday();
    check('picked verse is kept', !fetched && p.verse.random === true);

    // Old fetch (over 4h): re-checked.
    p.refresh = orig;
    p.verse = {...p.verse, random: false, fetchedAt: p.verse.fetchedAt};
    p.refresh = r => { fetched = true; return orig(r); };
    p.ensureToday();
    check('daily verse re-checked after 4h', fetched);
    await wait(6000);
    p.destroy();
    print(`daily verse now: ${daily}\n${out.join('\n')}`);
    loop.quit();
})().catch(e => { print(`FAIL ${e}\n${e.stack}`); loop.quit(); });
loop.run();
