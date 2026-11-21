/**
 * geom-lint.mjs — 几何审计命令行入口
 *
 * 用法：node scripts/geom-lint.mjs [--config diesel|gas] [--propulsor cpp|fpp] [--json out.json]
 * 前置：npm run dev 已在 127.0.0.1:5173 运行
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const URL = arg('url', 'http://127.0.0.1:5173/');
const outJson = arg('json', '');
const configs = (arg('config', 'diesel,gas')).split(',');
const props = (arg('propulsor', 'cpp,fpp')).split(',');
const MAX_INTERFERENCE = Number(arg('max-interference', '0'));

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__APP__ && !!window.__APP__.audit, null, { timeout: 90000 });
await page.waitForTimeout(1800);

const results = [];
for (const config of configs) {
  for (const propulsor of props) {
    const r = await page.evaluate(([c, p]) => {
      const a = window.__APP__;
      a.explode.pause();
      a.explode.setProgress(0);
      return a.audit({ config: c, propulsor: p });
    }, [config, propulsor]);
    results.push(r);
  }
}

const chainNode = await page.evaluate(() => window.__APP__.driveline.check());
await browser.close();

for (const r of results) {
  console.log(`\n=== ${r.config} / ${r.propulsor} · 可见 ${r.visible}/${r.total} ===`);
  console.log(`干涉 ${r.summary.interference} · 走管异常 ${r.summary.routing} · 传动链空洞 ${r.summary.chainGaps} · 节点失配 ${r.summary.jointsBad} · 链图 ${r.chain.ok ? 'OK' : '异常'}`);
  if (r.allowed?.length) {
    console.log(`-- 已登记装配接触 ${r.allowed.length} 条（豁免表 docs/AUDIT-ALLOW.md）--`);
  }
  if (r.interference.length) {
    console.log('-- 干涉 TOP --');
    for (const x of r.interference.slice(0, 12)) {
      console.log(`  ${(x.vol + ' m³').padEnd(9)} ratio ${String(x.ratio).padEnd(6)} ${x.a} × ${x.b}  @[${x.at}]  dims ${x.dims}`);
    }
  }
  if (r.routing.length) {
    console.log('-- 走管 --');
    for (const x of r.routing.slice(0, 8)) {
      console.log(`  ${x.id} → ${x.offenders.map((o) => `${o.id}(深${o.maxDepth}m×${o.n})`).join(', ')}`);
    }
  }
  if (r.chain.gaps.length) {
    console.log('-- 传动链 --');
    for (const g of r.chain.gaps) console.log(`  ${g.seg} (${g.kind}) 空洞 ${g.empty}/${g.of} 采样，最长连续 ${g.worstRun}，段长 ${g.len} m，实现件 ${g.owners.join('/')}`);
  }
  const badJoints = r.chain.joints.filter((j) => !j.ok);
  if (badJoints.length) {
    console.log('-- 节点失配 --');
    for (const j of badJoints) console.log(`  ${j.node} (${j.label}) r=${j.r} 最远 ${j.worst} m :: ${j.incident.map((i) => `${i.part}=${i.dist}`).join(', ')}`);
  }
  if (r.supports.length) {
    console.log('-- 长跨支承 --');
    for (const s of r.supports) {
      const list = s.supports.map((x) => `${x.id}(t=${x.t}m, 垂距=${x.perp}m${x.declared ? ', 已声明' : ''})`).join(' ') || '无';
      const miss = s.declaredMissing.length ? `  ⚠ 声明但未落位：${s.declaredMissing.join(', ')}` : '';
      console.log(`  ${s.ok ? 'OK ' : '警告'} ${s.seg} 段长 ${s.len} m → ${list}${miss}`);
    }
  }
}
console.log('\n=== 链图 ===');
console.log(JSON.stringify(chainNode));

const bad = results.filter((r) => r.summary.chainGaps > 0 || r.summary.routing > 0
  || r.summary.jointsBad > 0 || r.summary.interference > MAX_INTERFERENCE
  || r.supports.some((s) => !s.ok || s.declaredMissing.length));
if (errors.length) console.log('\n页面报错：\n' + errors.join('\n'));
if (outJson) {
  writeFileSync(outJson, JSON.stringify({ results, chainNode, errors }, null, 2));
  console.log('written ' + outJson);
}
console.log(`\n门禁：链图 ${chainNode.ok ? 'PASS' : 'FAIL'} · 构型 ${results.length - bad.length}/${results.length} PASS（干涉上限 ${MAX_INTERFERENCE}）`);
process.exit(chainNode.ok && bad.length === 0 && errors.length === 0 ? 0 : 1);
