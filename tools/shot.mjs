// Screenshot an already-running headless Chrome (see tools/browser.mjs).
// usage: node tools/shot.mjs <url> <out.png> [--w 1600] [--h 900] [--wait expr] [--settle 2500] [--eval file.js] [--port 9411]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const W = Number(opt('w', 1600));
const H = Number(opt('h', 900));
const DPR = Number(opt('dpr', 1));
const PORT = Number(opt('port', 9411));
const WAIT_EXPR = opt('wait', 'window.__FC_READY__ === true');
const TIMEOUT = Number(opt('timeout', 30000));
const SETTLE = Number(opt('settle', 2500));
const EVAL_FILE = opt('eval', null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const lines = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const a = (msg.params.args || []).map((x) => x.value ?? x.description ?? x.type).join(' ');
      lines.push(`[${msg.params.type}] ${a}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      lines.push(`[exception] ${d.text} ${d.exception?.description || ''}`);
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level !== 'verbose') {
      lines.push(`[log:${msg.params.entry.level}] ${msg.params.entry.text}`);
    }
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  return {
    ready, lines,
    send(method, params = {}) {
      const mid = ++id;
      return new Promise((resolve, reject) => {
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params }));
        setTimeout(() => {
          if (pending.has(mid)) { pending.delete(mid); reject(new Error('cdp timeout: ' + method)); }
        }, 180000);
      });
    },
    close: () => ws.close(),
  };
}

let cdp;
try {
  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: DPR, mobile: W <= 720,
  });
  cdp.lines.push('[browser] ' + ver.Browser);

  const t0 = Date.now();
  await cdp.send('Page.navigate', { url });

  let ok = false;
  while (Date.now() - t0 < TIMEOUT) {
    await sleep(300);
    try {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(function(){try{return !!(${WAIT_EXPR})}catch(e){return false}})()`,
        returnByValue: true,
      });
      if (r.result && r.result.value === true) { ok = true; break; }
    } catch {}
  }
  cdp.lines.push(`[harness] ready=${ok} in ${Date.now() - t0}ms`);

  if (EVAL_FILE) {
    const code = fs.readFileSync(EVAL_FILE, 'utf8');
    const r = await cdp.send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
    cdp.lines.push('[eval] ' + JSON.stringify(r.result?.value ?? r.result ?? null).slice(0, 4000));
  }

  await sleep(SETTLE);

  const st = await cdp.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__FC_STATS__ || null)', returnByValue: true,
  });
  cdp.lines.push('[stats] ' + (st.result?.value ?? 'null'));

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(cdp.lines.join('\n'));
  console.log(`saved ${out} (${fs.statSync(out).size} bytes, ${Date.now() - t0}ms total)`);

  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  cdp.close();
} catch (e) {
  console.error('HARNESS ERROR:', e.message);
  if (cdp) console.error(cdp.lines.join('\n'));
  process.exitCode = 1;
  try { cdp?.close(); } catch {}
}
process.exit(process.exitCode || 0);
