// CCTV System Survey 3D walkthrough. Silent, Thai subtitles. Copied from Item Catagory/Video3D_Vision/render.js.
//   node render.js                      full video → ../CCTV_System_3D_Walkthrough_<date>.mp4
//   node render.js --from 30 --to 45 --fps 10 --out preview   quick silent preview
//   node render.js --still 42,60        PNG frames (still_42.png …)
// Same toolchain as Safety and Protection/Video3D_src (puppeteer-core + three in %LOCALAPPDATA%/manual_tools, imageio ffmpeg).
const path = require('path'), fs = require('fs'), cp = require('child_process');
const TOOLS = process.env.LOCALAPPDATA + '/manual_tools/node_modules/';
const puppeteer = require(TOOLS + 'puppeteer-core');
const FFMPEG = 'C:/ProgramData/anaconda3/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
const DIR = __dirname;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const SEGS = require('./script.js');

// 1 ── no voice: reading time from the Thai subtitle length (~13 chars/s)
const DUR = {}; SEGS.forEach((s, i) => { DUR[String(i).padStart(2, '0')] = Math.max(4, Math.min(14, [...s.say].length / 13)); });
// 2 ── timeline
const TL = []; let t = 0;
SEGS.forEach((s, i) => {
  const key = String(i).padStart(2, '0'), lead = i === 0 ? 1.0 : .45;
  let dur = Math.max(s.min || 5, lead + DUR[key] + .7);
  if (i === SEGS.length - 1) dur += 1.5;
  TL.push({ ph: s.ph, chapter: s.chapter, say: s.say, key, start: +t.toFixed(3), dur: +dur.toFixed(3), audio: +(t + lead).toFixed(3), nd: DUR[key] });
  t += dur;
});
const TOTAL = t;
fs.writeFileSync(path.join(DIR, 'timeline.js'), 'window.TL = ' + JSON.stringify(TL) + ';\n', 'utf8');
console.log('timeline', TL.length, 'segments,', TOTAL.toFixed(1), 's');

// 3 ── render frames
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 600000,
    args: ['--no-sandbox', '--window-size=1920,1080', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url()); if (u.host !== 'v.local') return r.abort();
    const f = u.pathname === '/three.module.js' ? TOOLS + 'three/build/three.module.js' : path.join(DIR, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: (MIME[path.extname(f)] || 'application/octet-stream') + (path.extname(f) === '.png' ? '' : '; charset=utf-8'), body: fs.readFileSync(f) });
  });
  page.on('pageerror', e => console.log('PAGEERR', e.message)); page.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text()));
  await page.goto('http://v.local/scene.html');
  await page.waitForFunction('window.READY === true', { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.target().createCDPSession();
  const shot = async (fmt = 'jpeg') => Buffer.from((await cdp.send('Page.captureScreenshot', { format: fmt, quality: fmt === 'jpeg' ? 95 : undefined, optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1.5 } })).data, 'base64');

  if (arg('still')) { for (const s of String(arg('still')).split(',')) { await page.evaluate(x => window.renderAt(x), +s); fs.writeFileSync(path.join(DIR, 'still_' + s + '.png'), await shot('png')); } await browser.close(); return; }

  const FPS = +arg('fps', 25), from = +arg('from', 0), to = Math.min(+arg('to', TOTAL), TOTAL), preview = arg('out');
  const date = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const vid = path.join(DIR, preview ? preview + '.mp4' : 'video_only.mp4');
  const ff = cp.spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-tune', 'animation', '-pix_fmt', 'yuv420p', vid], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n0 = Math.round(from * FPS), n1 = Math.round(to * FPS), t0 = Date.now();
  for (let f = n0; f < n1; f++) {
    await page.evaluate(async x => { window.renderAt(x); await Promise.all([...document.images].map(i => i.complete && i.naturalWidth ? i.decode().catch(() => {}) : new Promise(r => { i.onload = i.onerror = r; }))); }, f / FPS);
    const buf = await shot();
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((f - n0) % (FPS * 10) === 0) { const el = (Date.now() - t0) / 1000, done = (f - n0 + 1) / (n1 - n0); console.log(`frame ${f}/${n1}  ${(done * 100).toFixed(1)}%  eta ${(el / done - el).toFixed(0)}s`); }
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await browser.close();
  if (preview) { console.log('preview →', vid); return; }

  // 4 ── no voice (user: Windows voice sounds unnatural) → silent MP4, Thai subtitles carry the story
  const out = path.join(DIR, '..', 'CCTV_System_3D_Walkthrough_' + date + '.mp4');
  cp.execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', vid, '-c:v', 'copy', '-an', '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log('DONE →', out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB', ((Date.now() - t0) / 60000).toFixed(1) + ' min');
})().catch(e => { console.error(e); process.exit(1); });
