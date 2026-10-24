// Verse of the day from OurManna, cached for the day, with bundled KJV verses for offline use.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

const API = 'https://beta.ourmanna.com/api/v1/get?format=json';
// OurManna's day doesn't follow your timezone (in Kenya it turns over hours after midnight), so a verse
// fetched just after local midnight can be yesterday's. Re-check this often during the day.
const RECHECK_SECONDS = 4 * 3600;
const decoder = new TextDecoder();

function today() {
    return GLib.DateTime.new_now_local().format('%Y-%m-%d');
}

export class VerseProvider {
    constructor(extensionPath, settings, onChange) {
        this._settings = settings;
        this._onChange = onChange;
        this._cacheFile = GLib.build_filenamev([GLib.get_user_cache_dir(), 'vigil', 'verse.json']);
        this._session = new Soup.Session({timeout: 10});
        this._cancellable = new Gio.Cancellable();
        try {
            const [, bytes] = GLib.file_get_contents(GLib.build_filenamev([extensionPath, 'verses.json']));
            this._fallback = JSON.parse(decoder.decode(bytes));
        } catch {
            this._fallback = [{text: 'The LORD is my shepherd; I shall not want.', reference: 'Psalm 23:1', version: 'KJV'}];
        }
        this.verse = this._readCache() ?? this._pickFallback();
    }

    destroy() {
        this._cancellable.cancel();
        this._session.abort();
    }

    // Called on every tick: fetches a few times a day at most, so it is cheap to call often.
    ensureToday() {
        const now = GLib.get_monotonic_time() / 1e6;
        if (this._fetching || now - (this._failedAt ?? -Infinity) <= 900)
            return;
        const newDay = this.verse.date !== today();
        // A verse you picked with "Another verse" stays until tomorrow.
        const recheck = !this.verse.random && this._settings.get_string('verse-source') === 'online' &&
            GLib.get_real_time() / 1e6 - (this.verse.fetchedAt ?? 0) > RECHECK_SECONDS;
        if (newDay || recheck)
            this.refresh(false);
    }

    async refresh(random) {
        if (this._settings.get_string('verse-source') === 'offline') {
            if (random || this.verse.date !== today())
                this._set(this._pickFallback(), random);
            return;
        }
        this._fetching = true;
        try {
            const msg = Soup.Message.new('GET', random ? `${API}&order=random` : API);
            const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, this._cancellable);
            if (msg.get_status() !== Soup.Status.OK)
                throw new Error(`HTTP ${msg.get_status()}`);
            const details = JSON.parse(decoder.decode(bytes.get_data())).verse.details;
            this._set({text: details.text, reference: details.reference, version: details.version}, random);
        } catch (e) {
            if (this._cancellable.is_cancelled())
                return;
            // Offline: show a bundled verse (not cached) and try the API again in 15 minutes.
            this._failedAt = GLib.get_monotonic_time() / 1e6;
            if (random || this.verse.date !== today()) {
                this.verse = this._pickFallback();
                this._onChange();
            }
        } finally {
            this._fetching = false;
        }
    }

    _set(verse, random = false) {
        this.verse = {...verse, date: today(), fetchedAt: Math.floor(GLib.get_real_time() / 1e6), random};
        try {
            GLib.mkdir_with_parents(GLib.path_get_dirname(this._cacheFile), 0o755);
            GLib.file_set_contents(this._cacheFile, JSON.stringify(this.verse));
        } catch {}
        this._onChange();
    }

    _pickFallback() {
        const verse = this._fallback[Math.floor(Math.random() * this._fallback.length)];
        return {...verse, date: ''};
    }

    _readCache() {
        try {
            const [, bytes] = GLib.file_get_contents(this._cacheFile);
            const verse = JSON.parse(decoder.decode(bytes));
            return verse.text && verse.reference ? verse : null;
        } catch {
            return null;
        }
    }
}
