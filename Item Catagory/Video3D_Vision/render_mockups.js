// Screenshot the BOQ → Asset mockup screens (.dc.html design-canvas files) to shots/*.png for the vision video.
//   node render_mockups.js <folder with *.dc.html>
// The files normally run inside the artifact viewer (support.js). They only use {{expr}} fields and <sc-for list as>,
// so we expand those as text here (before HTML parsing, because <sc-for> inside <tbody> would be moved by the parser).
const path = require('path'), fs = require('fs');
const TOOLS = process.env.LOCALAPPDATA + '/manual_tools/node_modules/';
const puppeteer = require(TOOLS + 'puppeteer-core');
const SRC = process.argv[2], OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

class DCLogic { constructor() { this.props = {}; } }
const get = (expr, scope) => { try { return new Function(...Object.keys(scope), 'return (' + expr + ')')(...Object.values(scope)); } catch (e) { return ''; } };
function expand(s, scope) {
  let out = '', i = 0;
  while (true) {
    const a = s.indexOf('<sc-for', i);
    if (a < 0) { out += s.slice(i); break; }
    out += s.slice(i, a);
    const tagEnd = s.indexOf('>', a), tag = s.slice(a, tagEnd + 1);
    let depth = 1, j = tagEnd + 1;
    while (depth) { const o = s.indexOf('<sc-for', j), c = s.indexOf('</sc-for>', j); if (o > -1 && o < c) { depth++; j = o + 7; } else { depth--; j = c + 9; } }
    const inner = s.slice(tagEnd + 1, j - 9);
    const list = get((tag.match(/list="\{\{([^}]+)\}\}"/) || [])[1], scope) || [], as = (tag.match(/as="([^"]+)"/) || [])[1] || 'item';
    out += list.map((it, k) => expand(inner, Object.assign({}, scope, { [as]: it, index: k }))).join('');
    i = j;
  }
  return out.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, e) => { const v = get(e, scope); return v == null ? '' : String(v); });
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.dc.html'))) {
    const raw = fs.readFileSync(path.join(SRC, f), 'utf8');
    const js = raw.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
    const props = JSON.parse((raw.match(/data-props='([^']*)'/) || [, '{}'])[1]);
    const W = (props.$preview || {}).width || 1440, H = (props.$preview || {}).height || 900;
    const Comp = new Function('DCLogic', js + '; return Component;')(DCLogic);
    const vals = new Comp().renderVals();
    const body = raw.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1];
    const helmet = (body.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">${helmet}</head><body style="margin:0">${expand(body.replace(/<helmet>[\s\S]*?<\/helmet>/, ''), vals)}</body></html>`;
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.fonts.ready);
    const name = f.replace('.dc.html', '.png');
    await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: W, height: H } });
    console.log('shot', name, W + 'x' + H);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
