// System and process sampling straight from /proc. No St/Clutter here, so it stays testable.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const CLK_TCK = 100;
const PAGE_KB = 4;
const decoder = new TextDecoder();

// Processes the desktop can't live without: shown, but never offered pause/end/kill.
const PROTECTED = new Set([
    'gnome-shell', 'gnome-session-b', 'gnome-session-c', 'systemd', 'dbus-daemon', 'dbus-broker',
    'dbus-broker-lau', 'pipewire', 'pipewire-pulse', 'wireplumber', 'Xwayland', 'gnome-keyring-d',
    'mutter-x11-fram', 'ibus-daemon', 'gvfsd', 'evolution-sourc',
]);
const PROTECTED_PREFIX = ['gsd-', 'xdg-', 'at-spi', 'ibus-', 'gvfs'];

export function readText(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        return ok ? decoder.decode(bytes) : null;
    } catch {
        return null;
    }
}

// /proc/<pid>/stat: the name sits in parentheses and may contain spaces, so split after the last ')'.
export function readStat(pid) {
    const raw = readText(`/proc/${pid}/stat`);
    if (!raw)
        return null;
    const close = raw.lastIndexOf(')');
    const rest = raw.slice(close + 2).split(' ');
    return {
        pid,
        name: raw.slice(raw.indexOf('(') + 1, close),
        state: rest[0],
        ticks: Number(rest[11]) + Number(rest[12]),
        start: rest[19],
        rssKb: Number(rest[21]) * PAGE_KB,
    };
}

export function commandLine(pid) {
    const raw = readText(`/proc/${pid}/cmdline`);
    return raw ? raw.split('\0').filter(Boolean).join(' ') : '';
}

export function isProtected(proc, shellPid) {
    return proc.pid === shellPid || PROTECTED.has(proc.name) ||
        PROTECTED_PREFIX.some(p => proc.name.startsWith(p));
}

// Signals only the exact process that was listed: if the pid has since been reused, do nothing.
export function sendSignal(proc, signal) {
    const now = readStat(proc.pid);
    if (!now || now.start !== proc.start)
        return false;
    try {
        Gio.Subprocess.new(['kill', `-${signal}`, String(proc.pid)], Gio.SubprocessFlags.STDERR_SILENCE);
        return true;
    } catch {
        return false;
    }
}

function parseMeminfo() {
    const out = {};
    for (const line of (readText('/proc/meminfo') ?? '').split('\n')) {
        const m = line.match(/^(\w+):\s+(\d+)/);
        if (m)
            out[m[1]] = Number(m[2]);
    }
    return out;
}

export class SystemSampler {
    constructor() {
        this._cpu = null;
        this._net = null;
    }

    sample() {
        const now = GLib.get_monotonic_time() / 1e6;

        const fields = (readText('/proc/stat') ?? '').split('\n')[0].trim().split(/\s+/).slice(1, 9).map(Number);
        const idle = fields[3] + fields[4];
        const total = fields.reduce((a, b) => a + b, 0);
        let cpu = null;
        if (this._cpu && total > this._cpu.total)
            cpu = 100 * (1 - (idle - this._cpu.idle) / (total - this._cpu.total));
        this._cpu = {idle, total};

        const mem = parseMeminfo();
        const memTotal = mem.MemTotal * 1024;
        const memUsed = (mem.MemTotal - mem.MemAvailable) * 1024;
        const swapTotal = mem.SwapTotal * 1024;
        const swapUsed = (mem.SwapTotal - mem.SwapFree) * 1024;

        // Physical interfaces only: Docker bridges and veths would double-count container traffic.
        let rx = 0, tx = 0;
        for (const line of (readText('/proc/net/dev') ?? '').split('\n').slice(2)) {
            const [iface, data] = line.split(':');
            if (!data || /^(lo|docker|veth|br-|virbr)/.test(iface.trim()))
                continue;
            const f = data.trim().split(/\s+/).map(Number);
            rx += f[0];
            tx += f[8];
        }
        let rxRate = null, txRate = null;
        if (this._net && now > this._net.time) {
            rxRate = Math.max(0, (rx - this._net.rx) / (now - this._net.time));
            txRate = Math.max(0, (tx - this._net.tx) / (now - this._net.time));
        }
        this._net = {rx, tx, time: now};

        let diskSize = 0, diskUsed = 0;
        try {
            const info = Gio.File.new_for_path('/').query_filesystem_info('filesystem::size,filesystem::free', null);
            diskSize = info.get_attribute_uint64('filesystem::size');
            diskUsed = diskSize - info.get_attribute_uint64('filesystem::free');
        } catch {}

        return {
            cpu,
            memTotal, memUsed, memPercent: 100 * memUsed / memTotal,
            swapTotal, swapUsed, swapPercent: swapTotal ? 100 * swapUsed / swapTotal : 0,
            diskSize, diskUsed,
            rxRate, txRate,
            uptime: Number((readText('/proc/uptime') ?? '0').split(' ')[0]),
            memTotalKb: mem.MemTotal,
        };
    }
}

// The current user's processes, with CPU% measured since the previous sample.
export class ProcessSampler {
    constructor() {
        const creds = new Gio.Credentials();
        this._uid = creds.get_unix_user();
        this.shellPid = creds.get_unix_pid();
        this._prev = new Map();
        this._time = 0;
    }

    sample() {
        const now = GLib.get_monotonic_time() / 1e6;
        const dt = now - this._time;
        const next = new Map();
        const list = [];
        let iter;
        try {
            iter = Gio.File.new_for_path('/proc').enumerate_children('standard::name,unix::uid',
                Gio.FileQueryInfoFlags.NONE, null);
        } catch {
            return list;
        }
        let info;
        while ((info = iter.next_file(null))) {
            const pid = Number(info.get_name());
            if (!pid || info.get_attribute_uint32('unix::uid') !== this._uid)
                continue;
            const proc = readStat(pid);
            if (!proc)
                continue;
            const prev = this._prev.get(pid);
            proc.cpu = prev && prev.start === proc.start && dt > 0
                ? Math.max(0, (proc.ticks - prev.ticks) / CLK_TCK / dt * 100) : null;
            next.set(pid, proc);
            list.push(proc);
        }
        iter.close(null);
        this._prev = next;
        this._time = now;
        return list;
    }

    top(list, sort, count) {
        const key = sort === 'memory' ? p => p.rssKb : p => p.cpu ?? 0;
        return [...list].sort((a, b) => key(b) - key(a)).slice(0, count);
    }
}

export function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${bytes.toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

export function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60);
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m`;
}
