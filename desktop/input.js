// Mouse and keyboard for Zelpophai Mini's Do mode (Windows only).
// A single hidden PowerShell process loads a tiny C# class that calls the
// Windows input API (SendInput / SetCursorPos). We keep it running so each
// action takes milliseconds instead of starting PowerShell every time.
// Coordinates are physical screen pixels (the helper is DPI aware).
const { spawn } = require('child_process');

const CS = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

public static class ZpInput {
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public HARDWAREINPUT hi; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion U; }

    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

    const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_EXTENDEDKEY = 0x1, KEYEVENTF_KEYUP = 0x2, KEYEVENTF_UNICODE = 0x4;
    const uint M_LEFTDOWN = 0x2, M_LEFTUP = 0x4, M_RIGHTDOWN = 0x8, M_RIGHTUP = 0x10, M_WHEEL = 0x800;

    static void Send(INPUT[] inputs) { SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))); }
    static INPUT Mouse(uint flags, uint data) { var i = new INPUT(); i.type = INPUT_MOUSE; i.U.mi.dwFlags = flags; i.U.mi.mouseData = data; return i; }
    static INPUT Key(ushort vk, bool up) {
        var i = new INPUT(); i.type = INPUT_KEYBOARD; i.U.ki.wVk = vk;
        uint f = up ? KEYEVENTF_KEYUP : 0;
        if (Extended.Contains(vk)) f |= KEYEVENTF_EXTENDEDKEY;
        i.U.ki.dwFlags = f; return i;
    }
    static INPUT Unicode(char c, bool up) {
        var i = new INPUT(); i.type = INPUT_KEYBOARD; i.U.ki.wScan = c;
        i.U.ki.dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0); return i;
    }

    static readonly HashSet<ushort> Extended = new HashSet<ushort> { 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x5B, 0x5C, 0xA3, 0xA5 };
    static readonly Dictionary<string, ushort> Names = new Dictionary<string, ushort> {
        {"ctrl",0xA2},{"control",0xA2},{"alt",0xA4},{"shift",0xA0},{"win",0x5B},{"windows",0x5B},{"cmd",0x5B},
        {"enter",0x0D},{"return",0x0D},{"tab",0x09},{"esc",0x1B},{"escape",0x1B},{"backspace",0x08},{"delete",0x2E},{"del",0x2E},
        {"insert",0x2D},{"space",0x20},{"up",0x26},{"down",0x28},{"left",0x25},{"right",0x27},{"home",0x24},{"end",0x23},
        {"pageup",0x21},{"pagedown",0x22},{"capslock",0x14},{"printscreen",0x2C},{"menu",0x5D},
        {"plus",0xBB},{"minus",0xBD},{"comma",0xBC},{"period",0xBE},{"dot",0xBE},{"slash",0xBF}
    };

    static ushort Vk(string name) {
        name = name.Trim().ToLowerInvariant();
        ushort v;
        if (Names.TryGetValue(name, out v)) return v;
        if (name.Length == 1) {
            char c = char.ToUpperInvariant(name[0]);
            if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) return (ushort)c;
        }
        if (name.Length >= 2 && name[0] == 'f') {
            int n; if (int.TryParse(name.Substring(1), out n) && n >= 1 && n <= 24) return (ushort)(0x70 + n - 1);
        }
        throw new ArgumentException("Unknown key: " + name);
    }

    public static void Move(int x, int y) { SetCursorPos(x, y); Thread.Sleep(40); }

    public static void Click(int x, int y, string button, bool dbl) {
        Move(x, y);
        bool right = button == "right";
        int times = dbl ? 2 : 1;
        for (int n = 0; n < times; n++) {
            Send(new[] { Mouse(right ? M_RIGHTDOWN : M_LEFTDOWN, 0), Mouse(right ? M_RIGHTUP : M_LEFTUP, 0) });
            Thread.Sleep(dbl ? 60 : 30);
        }
    }

    public static void Drag(int x, int y, int x2, int y2) {
        Move(x, y);
        Send(new[] { Mouse(M_LEFTDOWN, 0) });
        Thread.Sleep(80);
        for (int s = 1; s <= 12; s++) { SetCursorPos(x + (x2 - x) * s / 12, y + (y2 - y) * s / 12); Thread.Sleep(18); }
        Thread.Sleep(60);
        Send(new[] { Mouse(M_LEFTUP, 0) });
    }

    public static void Scroll(int x, int y, int amount) {
        Move(x, y);
        int steps = Math.Abs(amount);
        for (int s = 0; s < steps; s++) {
            Send(new[] { Mouse(M_WHEEL, unchecked((uint)((amount > 0 ? 1 : -1) * 120))) });
            Thread.Sleep(25);
        }
    }

    public static void TypeText(string text) {
        foreach (char c in text) {
            if (c == '\r') continue;
            if (c == '\n') { Send(new[] { Key(0x0D, false), Key(0x0D, true) }); }
            else if (c == '\t') { Send(new[] { Key(0x09, false), Key(0x09, true) }); }
            else { Send(new[] { Unicode(c, false), Unicode(c, true) }); }
            Thread.Sleep(6);
        }
    }

    public static void Keys(string combo) {
        var parts = combo.Split('+');
        var vks = new List<ushort>();
        foreach (var p in parts) if (p.Trim().Length > 0) vks.Add(Vk(p));
        if (vks.Count == 0) throw new ArgumentException("No keys");
        foreach (var v in vks) { Send(new[] { Key(v, false) }); Thread.Sleep(15); }
        for (int n = vks.Count - 1; n >= 0; n--) { Send(new[] { Key(vks[n], true) }); Thread.Sleep(15); }
    }
}
`;

const PS = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition $env:ZP_INPUT_CS -Language CSharp
try { [ZpInput]::SetProcessDPIAware() | Out-Null } catch { }
[Console]::Out.WriteLine('ready')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  try {
    $c = $line | ConvertFrom-Json
    switch ($c.op) {
      'move'   { [ZpInput]::Move([int]$c.x, [int]$c.y) }
      'click'  { [ZpInput]::Click([int]$c.x, [int]$c.y, [string]$c.button, [bool]$c.double) }
      'drag'   { [ZpInput]::Drag([int]$c.x, [int]$c.y, [int]$c.x2, [int]$c.y2) }
      'scroll' { [ZpInput]::Scroll([int]$c.x, [int]$c.y, [int]$c.amount) }
      'type'   { [ZpInput]::TypeText([string]$c.text) }
      'keys'   { [ZpInput]::Keys([string]$c.keys) }
      'ping'   { }
      default  { throw "unknown op" }
    }
    [Console]::Out.WriteLine('ok')
  } catch {
    [Console]::Out.WriteLine('err ' + ($_.Exception.Message -replace '[\\r\\n]+', ' '))
  }
}
`;

let proc = null;
let ready = null;
let buf = '';
const waiting = [];

function start() {
    if (process.platform !== 'win32') return Promise.reject(new Error('Controlling the PC only works on Windows.'));
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
        const encoded = Buffer.from(PS, 'utf16le').toString('base64');
        proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
            windowsHide: true, env: { ...process.env, ZP_INPUT_CS: CS },
        });
        let started = false;
        const fail = (err) => {
            const e = err instanceof Error ? err : new Error(String(err));
            if (!started) reject(e);
            while (waiting.length) waiting.shift().reject(e);
            proc = null; ready = null; buf = '';
        };
        const timer = setTimeout(() => { if (!started) { try { proc.kill(); } catch (e) {} fail(new Error('The input helper did not start.')); } }, 20000);
        proc.stdout.setEncoding('utf8');
        proc.stdout.on('data', (d) => {
            buf += d;
            let i;
            while ((i = buf.indexOf('\n')) !== -1) {
                const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
                if (!line) continue;
                if (!started) { if (line === 'ready') { started = true; clearTimeout(timer); resolve(); } continue; }
                const w = waiting.shift(); if (!w) continue;
                if (line === 'ok') w.resolve(); else w.reject(new Error(line.replace(/^err\s*/, '') || 'Action failed'));
            }
        });
        let errText = '';
        proc.stderr.on('data', (d) => { errText += d; });
        proc.on('error', fail);
        proc.on('exit', () => fail(new Error(errText.trim().slice(0, 300) || 'The input helper stopped.')));
    });
    return ready;
}

async function send(cmd) {
    await start();
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('The action timed out.')), 30000);
        waiting.push({ resolve: () => { clearTimeout(t); resolve(); }, reject: (e) => { clearTimeout(t); reject(e); } });
        proc.stdin.write(JSON.stringify(cmd) + '\n', 'utf8');
    });
}

function stop() {
    if (proc) { try { proc.kill(); } catch (e) {} }
    proc = null; ready = null;
}

module.exports = { start, send, stop };
