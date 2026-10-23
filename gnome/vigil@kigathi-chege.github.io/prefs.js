import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
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

// A color picker (with transparency) for a key holding a CSS color string.
function colorRow(settings, key, title) {
    const row = new Adw.ActionRow({title});
    const button = new Gtk.ColorDialogButton({dialog: new Gtk.ColorDialog({with_alpha: true}), valign: Gtk.Align.CENTER});
    const load = () => {
        const rgba = new Gdk.RGBA();
        if (rgba.parse(settings.get_string(key)))
            button.rgba = rgba;
    };
    load();
    button.connect('notify::rgba', () => {
        const css = button.rgba.to_string();
        if (css !== settings.get_string(key))
            settings.set_string(key, css);
    });
    settings.connect(`changed::${key}`, load);
    row.add_suffix(button);
    row.activatable_widget = button;
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
            spinRow(s, 'refresh-interval', 'Update every (seconds)', 1, 30),
        ]));
        const reset = new Gtk.Button({label: 'Reset colors', valign: Gtk.Align.CENTER, css_classes: ['flat']});
        reset.connect('clicked', () => ['color-normal', 'color-warning', 'color-danger'].forEach(k => s.reset(k)));
        const status = group('Status colors', [
            spinRow(s, 'warning-level', 'Warning at (%)', 10, 100),
            spinRow(s, 'danger-level', 'Danger at (%)', 10, 100),
            switchRow(s, 'alert-memory', 'Memory counts'),
            switchRow(s, 'alert-swap', 'Swap counts'),
            switchRow(s, 'alert-cpu', 'CPU counts', 'Averaged over about 10 seconds, so short bursts don’t trigger it'),
            colorRow(s, 'color-normal', 'Normal'),
            colorRow(s, 'color-warning', 'Warning'),
            colorRow(s, 'color-danger', 'Danger'),
        ], 'The top bar always has a background: the worst of the metrics that count picks the color.');
        status.header_suffix = reset;
        general.add(status);
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
