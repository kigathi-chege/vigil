// The desktop card: the Conky look (rounded translucent cards), drawn by GNOME Shell itself,
// so it works on Wayland. It sits in the background layer, below every window.
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {formatBytes, formatUptime} from './stats.js';

function label(text, style) {
    const l = new St.Label({text, style_class: style});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}

function row(name, value) {
    const box = new St.BoxLayout({style_class: 'wf-row'});
    box.add_child(label(name, 'wf-key'));
    const v = label(value, 'wf-value');
    v.x_expand = true;
    v.x_align = Clutter.ActorAlign.END;
    box.add_child(v);
    return box;
}

export const DesktopWidget = GObject.registerClass(
class DesktopWidget extends St.BoxLayout {
    _init(settings) {
        super._init({orientation: Clutter.Orientation.VERTICAL, style_class: 'wf-desktop', reactive: false});
        this._settings = settings;

        this._system = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'wf-card'});
        this._verse = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'wf-card'});
        this._verseText = new St.Label({style_class: 'wf-verse-text'});
        this._verseText.clutter_text.line_wrap = true;
        this._verseText.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._verseText.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._verseRef = new St.Label({style_class: 'wf-verse-ref', x_align: Clutter.ActorAlign.END});
        this._verse.add_child(this._verseText);
        this._verse.add_child(this._verseRef);
        this.add_child(this._system);
        this.add_child(this._verse);

        Main.layoutManager._backgroundGroup.add_child(this);
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._place());
        this._workareaId = global.display.connect('workareas-changed', () => this._place());
        this._settingsId = settings.connect('changed', (_s, key) => {
            if (key.startsWith('desktop-'))
                this._place();
        });
    }

    updateSystem(s, procs) {
        this._system.visible = this._settings.get_boolean('desktop-show-system');
        if (!this._system.visible)
            return;
        this._system.destroy_all_children();
        this._system.add_child(label('System', 'wf-title'));
        const rows = [
            ['CPU', s.cpu === null ? '…' : `${s.cpu.toFixed(0)}%`],
            ['Memory', `${formatBytes(s.memUsed)} / ${formatBytes(s.memTotal)}  ${s.memPercent.toFixed(0)}%`],
            ['Swap', s.swapTotal ? `${formatBytes(s.swapUsed)} / ${formatBytes(s.swapTotal)}  ${s.swapPercent.toFixed(0)}%` : 'off'],
            ['Disk /', `${formatBytes(s.diskUsed)} / ${formatBytes(s.diskSize)}`],
            ['Network', s.rxRate === null ? '…' : `↓ ${formatBytes(s.rxRate)}/s  ↑ ${formatBytes(s.txRate)}/s`],
            ['Uptime', formatUptime(s.uptime)],
        ];
        for (const [k, v] of rows)
            this._system.add_child(row(k, v));
        if (procs.length) {
            this._system.add_child(label('Top processes', 'wf-subtitle'));
            for (const p of procs)
                this._system.add_child(row(p.name, `${(p.cpu ?? 0).toFixed(0)}%  ${formatBytes(p.rssKb * 1024)}`));
        }
        this._place();
    }

    updateVerse(verse) {
        this._verse.visible = this._settings.get_boolean('desktop-show-verse');
        this._verseText.text = verse.text;
        this._verseRef.text = `— ${verse.reference}${verse.version ? ` (${verse.version})` : ''}`;
        this._place();
    }

    _place() {
        const monitor = Main.layoutManager.primaryIndex;
        if (monitor < 0)
            return;
        const area = Main.layoutManager.getWorkAreaForMonitor(monitor);
        const corner = this._settings.get_string('desktop-corner');
        const mx = this._settings.get_int('desktop-margin-x');
        const my = this._settings.get_int('desktop-margin-y');
        const [, w] = this.get_preferred_width(-1);
        const [, h] = this.get_preferred_height(w);
        const x = corner.endsWith('right') ? area.x + area.width - w - mx : area.x + mx;
        const y = corner.startsWith('bottom') ? area.y + area.height - h - my : area.y + my;
        if (this.x !== x || this.y !== y)
            this.set_position(Math.round(x), Math.round(y));
    }

    destroy() {
        Main.layoutManager.disconnect(this._monitorsId);
        global.display.disconnect(this._workareaId);
        this._settings.disconnect(this._settingsId);
        super.destroy();
    }
});
