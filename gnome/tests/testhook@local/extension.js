import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
Gio._promisify(Shell.Screenshot.prototype, 'screenshot');
const OUT = GLib.getenv('WF_TEST_OUT');
const UUID = 'widget-framework@kigathi-chege.github.io';
const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { r(); return GLib.SOURCE_REMOVE; }));
async function shot(name) {
    const stream = Gio.File.new_for_path(`${OUT}/${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
    await new Shell.Screenshot().screenshot(false, stream);
    stream.close(null);
}
export default class T extends Extension {
    enable() { this.run().catch(e => console.log('TESTHOOK FAIL ' + e + '\n' + e.stack)); }
    async run() {
        console.log('TESTHOOK start');
        const r = {};
        await wait(5000);
        Main.overview.hide();
        await wait(1500);
        const ext = Main.extensionManager.lookup(UUID);
        r.state = ext?.state; r.error = String(ext?.error ?? '');
        const ind = Main.panel.statusArea[UUID];
        r.label = ind?._label.text;
        await shot('desktop');
        ind.menu.open();
        await wait(2500);
        r.rows = ind._rows.map(x => x._name.text + ' | ' + x._usage.text + ' | ' + x._cmd.text.slice(0, 50));
        r.verse = ind._verseText.text + ' ' + ind._verseRef.text;
        await shot('menu');
        ind.menu.close();
        Main.extensionManager.disableExtension(UUID);
        await wait(500);
        r.afterDisable = Main.extensionManager.lookup(UUID).state + ' indicator=' + !!Main.panel.statusArea[UUID];
        Main.extensionManager.enableExtension(UUID);
        await wait(1500);
        r.afterEnable = Main.extensionManager.lookup(UUID).state + ' err=' + Main.extensionManager.lookup(UUID).error;
        GLib.file_set_contents(`${OUT}/result.json`, JSON.stringify(r, null, 2));
        console.log('TESTHOOK done');
    }
    disable() {}
}
