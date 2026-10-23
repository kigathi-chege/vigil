// Widget Framework for GNOME Shell: top-bar system monitor, process controls, verse of the day,
// and an optional desktop card.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {DesktopWidget} from './desktop.js';
import {
    ProcessSampler, SystemSampler, commandLine, formatBytes, isProtected, readStat, sendSignal,
} from './stats.js';
import {VerseProvider} from './verse.js';

const MONITOR_APPS = ['net.nokyan.Resources.desktop', 'org.gnome.SystemMonitor.desktop', 'gnome-system-monitor.desktop'];

function button(text, style = 'wf-button') {
    return new St.Button({label: text, style_class: style, can_focus: true, y_align: Clutter.ActorAlign.CENTER});
}

// One process in the menu. It stays bound to the process it was created for (pid + start time),
// so the list never shifts under the pointer and a button can never hit a different process.
const ProcessRow = GObject.registerClass(
class ProcessRow extends PopupMenu.PopupBaseMenuItem {
    _init(proc, indicator) {
        super._init({reactive: false, can_focus: false, style_class: 'wf-proc'});
        this._proc = proc;
        this._indicator = indicator;
        this._timeouts = new Set();

        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'wf-proc-text'});
        this._name = new St.Label({text: proc.name, style_class: 'wf-proc-name'});
        const cmd = commandLine(proc.pid).replace(/^\S*\//, '');
        this._cmd = new St.Label({text: cmd || proc.name, style_class: 'wf-proc-cmd'});
        this._cmd.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
        text.add_child(this._name);
        text.add_child(this._cmd);
        this.add_child(text);

        this._usage = new St.Label({style_class: 'wf-proc-usage', y_align: Clutter.ActorAlign.CENTER});
        this.add_child(this._usage);

        this._buttons = new St.BoxLayout({style_class: 'wf-proc-buttons'});
        if (isProtected(proc, indicator.processes.shellPid)) {
            this._buttons.add_child(new St.Label({text: 'system', style_class: 'wf-proc-locked', y_align: Clutter.ActorAlign.CENTER}));
        } else {
            this._pause = button('Pause');
            this._pause.connect('clicked', () => this._signal(this._proc.state === 'T' ? 'CONT' : 'STOP'));
            this._end = button('End');
            this._end.connect('clicked', () => this._confirm(this._end, 'End', 'TERM'));
            this._kill = button('Kill', 'wf-button wf-button-danger');
            this._kill.connect('clicked', () => this._confirm(this._kill, 'Kill', 'KILL'));
            for (const b of [this._pause, this._end, this._kill])
                this._buttons.add_child(b);
        }
        this.add_child(this._buttons);
        this.update(proc);
    }

    update(latest) {
        if (!latest) {
            this._usage.text = 'exited';
            this._buttons.visible = false;
            this.add_style_class_name('wf-proc-gone');
            return;
        }
        this._proc = {...this._proc, state: latest.state, cpu: latest.cpu, rssKb: latest.rssKb};
        const paused = latest.state === 'T';
        this._usage.text = `${paused ? 'paused  ' : ''}${latest.cpu === null ? '…' : `${latest.cpu.toFixed(0)}%`}  ${formatBytes(latest.rssKb * 1024)}`;
        if (this._pause)
            this._pause.label = paused ? 'Resume' : 'Pause';
    }

    _confirm(btn, label, signal) {
        if (!this._indicator.settings.get_boolean('confirm-kill') || btn._armed) {
            this._signal(signal);
            return;
        }
        btn._armed = true;
        btn.label = 'Sure?';
        btn.add_style_class_name('wf-button-armed');
        this._later(3000, () => {
            btn._armed = false;
            btn.label = label;
            btn.remove_style_class_name('wf-button-armed');
        });
    }

    _signal(signal) {
        if (!sendSignal(this._proc, signal)) {
            this.update(null);
            return;
        }
        // Show the new state (paused, resumed, gone) without waiting for the next tick.
        this._later(300, () => {
            const now = readStat(this._proc.pid);
            this.update(now && now.start === this._proc.start ? {...now, cpu: this._proc.cpu} : null);
        });
    }

    _later(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeouts.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._timeouts.add(id);
    }

    get pid() {
        return this._proc.pid;
    }

    destroy() {
        for (const id of this._timeouts)
            GLib.source_remove(id);
        this._timeouts.clear();
        super.destroy();
    }
});

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Widget Framework');
        this._extension = extension;
        this.settings = extension.getSettings();
        this.processes = new ProcessSampler();
        this._system = new SystemSampler();
        this._rows = [];
        this._sources = new Set();

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        box.add_child(new St.Icon({icon_name: 'utilities-system-monitor-symbolic', style_class: 'system-status-icon'}));
        this._label = new St.Label({text: '…', y_align: Clutter.ActorAlign.CENTER, style_class: 'wf-panel-label'});
        box.add_child(this._label);
        this.add_child(box);

        this._buildMenu();
        this.verse = new VerseProvider(extension.path, this.settings, () => this._showVerse());
        this._showVerse();

        this._settingsId = this.settings.connect('changed', (_s, key) => this._onSetting(key));
        this._syncDesktop();
        this._startTimer();
        this._tick();
    }

    _buildMenu() {
        this._summary = new St.Label({style_class: 'wf-summary'});
        const summaryItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        summaryItem.add_child(this._summary);
        this.menu.addMenuItem(summaryItem);

        const header = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false, style_class: 'wf-header'});
        header.add_child(new St.Label({text: 'Your processes', x_expand: true, style_class: 'wf-section-title', y_align: Clutter.ActorAlign.CENTER}));
        this._sortCpu = button('CPU', 'wf-button wf-toggle');
        this._sortMem = button('Memory', 'wf-button wf-toggle');
        this._sortCpu.connect('clicked', () => this.settings.set_string('process-sort', 'cpu'));
        this._sortMem.connect('clicked', () => this.settings.set_string('process-sort', 'memory'));
        const refresh = button('Refresh');
        refresh.connect('clicked', () => this._snapshot());
        for (const b of [this._sortCpu, this._sortMem, refresh])
            header.add_child(b);
        this.menu.addMenuItem(header);
        this._syncSortButtons();

        this._procSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._procSection);

        this._verseSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(this._verseSeparator);
        this._verseItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false, style_class: 'wf-verse'});
        const verseBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this._verseText = new St.Label({style_class: 'wf-verse-text'});
        this._verseText.clutter_text.line_wrap = true;
        this._verseText.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._verseText.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        const verseFooter = new St.BoxLayout();
        this._verseRef = new St.Label({style_class: 'wf-verse-ref', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        const copy = button('Copy');
        copy.connect('clicked', () => {
            const v = this.verse.verse;
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, `${v.text}\n— ${v.reference}`);
        });
        const another = button('Another verse');
        another.connect('clicked', () => this.verse.refresh(true));
        verseFooter.add_child(this._verseRef);
        verseFooter.add_child(copy);
        verseFooter.add_child(another);
        verseBox.add_child(this._verseText);
        verseBox.add_child(verseFooter);
        this._verseItem.add_child(verseBox);
        this.menu.addMenuItem(this._verseItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const app = MONITOR_APPS.map(id => Shell.AppSystem.get_default().lookup_app(id)).find(Boolean);
        if (app)
            this.menu.addAction(`Open ${app.get_name()}`, () => app.activate());
        this.menu.addAction('Settings', () => this._extension.openPreferences());

        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._snapshot();
            else
                this._clearRows();
        });
        this._syncVerseVisibility();
    }

    // Fresh process list, taken when the menu opens: two samples a moment apart, so CPU% is real.
    _snapshot() {
        this.processes.sample();
        this._clearRows();
        this._procSection.addMenuItem(new PopupMenu.PopupMenuItem('Measuring…', {reactive: false}));
        this._snapshotId = this._later(700, () => {
            this._snapshotId = null;
            this._procSection.removeAll();
            const list = this.processes.sample();
            const top = this.processes.top(list, this.settings.get_string('process-sort'),
                this.settings.get_uint('menu-process-count'));
            for (const proc of top) {
                const row = new ProcessRow(proc, this);
                this._rows.push(row);
                this._procSection.addMenuItem(row);
            }
        });
    }

    _clearRows() {
        if (this._snapshotId) {
            GLib.source_remove(this._snapshotId);
            this._sources.delete(this._snapshotId);
            this._snapshotId = null;
        }
        this._procSection.removeAll();
        this._rows = [];
    }

    _tick() {
        const s = this._system.sample();
        const parts = [];
        if (this.settings.get_boolean('panel-show-cpu'))
            parts.push(`${s.cpu === null ? '…' : s.cpu.toFixed(0)}%`);
        if (this.settings.get_boolean('panel-show-memory'))
            parts.push(`${s.memPercent.toFixed(0)}% RAM`);
        if (this.settings.get_boolean('panel-show-swap') && s.swapTotal)
            parts.push(`${s.swapPercent.toFixed(0)}% swap`);
        this._label.text = parts.join('  ');
        this._label.visible = parts.length > 0;

        // Orange when memory or swap is nearly full: the moment to open the menu and find the culprit.
        const limit = this.settings.get_uint('memory-warning');
        if (s.memPercent >= limit || (s.swapTotal && s.swapPercent >= limit))
            this._label.add_style_class_name('wf-warn');
        else
            this._label.remove_style_class_name('wf-warn');

        this._summary.text = [
            `CPU ${s.cpu === null ? '…' : `${s.cpu.toFixed(0)}%`}`,
            `Memory ${formatBytes(s.memUsed)} / ${formatBytes(s.memTotal)}`,
            s.swapTotal ? `Swap ${formatBytes(s.swapUsed)} / ${formatBytes(s.swapTotal)}` : 'Swap off',
        ].join('   ·   ');

        // Processes are scanned only while someone is looking at them.
        const deskCount = this._desktop && this.settings.get_boolean('desktop-show-system')
            ? this.settings.get_uint('desktop-process-count') : 0;
        let list = null;
        if (this.menu.isOpen && this._rows.length || deskCount)
            list = this.processes.sample();
        if (list && this.menu.isOpen) {
            const byPid = new Map(list.map(p => [p.pid, p]));
            for (const row of this._rows)
                row.update(byPid.get(row.pid) ?? null);
        }
        this._desktop?.updateSystem(s, deskCount && list ? this.processes.top(list, this.settings.get_string('process-sort'), deskCount) : []);

        this.verse.ensureToday();
    }

    _showVerse() {
        const v = this.verse.verse;
        this._verseText.text = v.text;
        this._verseRef.text = `— ${v.reference}${v.version ? ` (${v.version})` : ''}`;
        this._desktop?.updateVerse(v);
    }

    _onSetting(key) {
        if (key === 'refresh-interval')
            this._startTimer();
        else if (key === 'process-sort') {
            this._syncSortButtons();
            if (this.menu.isOpen)
                this._snapshot();
        } else if (key === 'menu-show-verse')
            this._syncVerseVisibility();
        else if (key === 'desktop-widget')
            this._syncDesktop();
        else if (key === 'verse-source')
            this.verse.refresh(false);
        this._tick();
        if (key.startsWith('desktop-'))
            this._showVerse();
    }

    _syncSortButtons() {
        const byMemory = this.settings.get_string('process-sort') === 'memory';
        this._sortCpu.checked = !byMemory;
        this._sortMem.checked = byMemory;
    }

    _syncVerseVisibility() {
        const show = this.settings.get_boolean('menu-show-verse');
        this._verseItem.visible = show;
        this._verseSeparator.visible = show;
    }

    _syncDesktop() {
        if (this.settings.get_boolean('desktop-widget') && !this._desktop) {
            this._desktop = new DesktopWidget(this.settings);
            if (this.verse)
                this._desktop.updateVerse(this.verse.verse);
        } else if (!this.settings.get_boolean('desktop-widget') && this._desktop) {
            this._desktop.destroy();
            this._desktop = null;
        }
    }

    _startTimer() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.settings.get_uint('refresh-interval'), () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _later(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._sources.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._sources.add(id);
        return id;
    }

    destroy() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = null;
        for (const id of this._sources)
            GLib.source_remove(id);
        this._sources.clear();
        this.settings.disconnect(this._settingsId);
        this.verse.destroy();
        this._desktop?.destroy();
        this._desktop = null;
        super.destroy();
    }
});

export default class WidgetFrameworkExtension extends Extension {
    enable() {
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
