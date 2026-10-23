import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function switchRow(settings, key, title, subtitle = '') {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function spinRow(settings, key, title, min, max, subtitle = '') {
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.title = title;
    row.subtitle = subtitle;
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

// A combo for a string-enum key: shows `labels`, stores the matching `values`.
function comboRow(settings, key, title, values, labels) {
    const row = new Adw.ComboRow({title, model: Gtk.StringList.new(labels)});
    row.selected = Math.max(0, values.indexOf(settings.get_string(key)));
    row.connect('notify::selected', () => settings.set_string(key, values[row.selected]));
    settings.connect(`changed::${key}`, () => {
        row.selected = Math.max(0, values.indexOf(settings.get_string(key)));
    });
    return row;
}

function group(title, rows, description = '') {
    const g = new Adw.PreferencesGroup({title, description});
    for (const r of rows)
        g.add(r);
    return g;
}

export default class VigilPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const s = this.getSettings();
        window.set_default_size(560, 720);

        const general = new Adw.PreferencesPage({title: 'General', icon_name: 'utilities-system-monitor-symbolic'});
        general.add(group('Top bar', [
            switchRow(s, 'panel-show-cpu', 'CPU usage'),
            switchRow(s, 'panel-show-memory', 'Memory usage'),
            switchRow(s, 'panel-show-swap', 'Swap usage'),
            spinRow(s, 'memory-warning', 'Warning level (%)', 50, 100, 'The top bar turns orange when memory or swap passes this'),
            spinRow(s, 'refresh-interval', 'Update every (seconds)', 1, 30),
        ]));
        general.add(group('Process menu', [
            spinRow(s, 'menu-process-count', 'Processes listed', 3, 20),
            comboRow(s, 'process-sort', 'Sort by', ['cpu', 'memory'], ['CPU', 'Memory']),
            switchRow(s, 'confirm-kill', 'Confirm End and Kill', 'A second click within 3 seconds is needed'),
            switchRow(s, 'menu-show-verse', 'Show the verse in the menu'),
        ], 'Only your own processes are listed. Desktop essentials (GNOME Shell, audio, session services) can’t be paused or ended.'));
        window.add(general);

        const desktop = new Adw.PreferencesPage({title: 'Desktop', icon_name: 'user-desktop-symbolic'});
        desktop.add(group('Desktop card', [
            switchRow(s, 'desktop-widget', 'Show on the desktop'),
            comboRow(s, 'desktop-corner', 'Corner',
                ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
                ['Top left', 'Top right', 'Bottom left', 'Bottom right']),
            spinRow(s, 'desktop-margin-x', 'Horizontal margin', 0, 4000),
            spinRow(s, 'desktop-margin-y', 'Vertical margin', 0, 4000),
            switchRow(s, 'desktop-show-system', 'System information'),
            spinRow(s, 'desktop-process-count', 'Top processes', 0, 10),
            switchRow(s, 'desktop-show-verse', 'Verse of the day'),
        ], 'Drawn behind all windows on the primary monitor.'));
        window.add(desktop);

        const verse = new Adw.PreferencesPage({title: 'Verse', icon_name: 'accessories-dictionary-symbolic'});
        verse.add(group('Verse of the day', [
            comboRow(s, 'verse-source', 'Source', ['online', 'offline'],
                ['OurManna (online, falls back to bundled)', 'Bundled KJV verses only']),
        ], 'Fetched once a day and cached in ~/.cache/vigil.'));
        window.add(verse);
    }
}
