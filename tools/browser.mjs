// Persistent headless Chrome (hardware GPU when available) for fast iteration.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = Number(process.argv[2] || 9411);
const SW = process.argv.includes('--swiftshader');
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const userDir = path.join(os.tmpdir(), 'fc-chrome-profile' + (SW ? '-sw' : ''));
fs.mkdirSync(userDir, { recursive: true });

const args = [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--hide-scrollbars',
  '--mute-audio',
  '--window-size=1600,900',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-zero-copy',
  'about:blank',
];
if (SW) args.unshift('--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader');

const child = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
child.stderr.on('data', (d) => process.stdout.write('[chrome] ' + d.toString()));

async function wait() {
  for (let i = 0; i < 200; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      console.log('BROWSER READY ' + j.Browser);
      console.log('ENDPOINT http://127.0.0.1:' + PORT);
      return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log('BROWSER FAILED TO START');
  process.exit(1);
}
await wait();
setInterval(() => {}, 1 << 30);
process.on('SIGTERM', () => { child.kill(); process.exit(0); });
process.on('SIGINT', () => { child.kill(); process.exit(0); });
