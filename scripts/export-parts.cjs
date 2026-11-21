const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__APP__, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const data = await page.evaluate(() => {
    const a = window.__APP__;
    const LAYERS = a.THREE ? null : null;
    return a.reg.parts.map(p => ({
      id: p.id, label: p.label, layer: p.layer, sub: p.sub || '',
      tags: p.tags || [], details: p.details || [], shell: !!p.shell,
      meshes: p.group.children.length,
      tris: (() => {
        let n = 0;
        p.group.traverse(o => {
          if (o.isMesh && o.geometry && o.geometry.index) n += o.geometry.index.count / 3;
          else if (o.isMesh && o.geometry && o.geometry.attributes.position) n += o.geometry.attributes.position.count / 3;
        });
        return Math.round(n);
      })(),
    }));
  });
  fs.writeFileSync('./shots/parts.json', JSON.stringify(data, null, 1));
  console.log('导出', data.length, '个构件');
  const byLayer = {};
  data.forEach(p => { byLayer[p.layer] = (byLayer[p.layer] || 0) + 1; });
  console.log(JSON.stringify(byLayer, null, 1));
  const totalTris = data.reduce((s, p) => s + p.tris, 0);
  console.log('三角面总数', totalTris.toLocaleString());

  /* ---- 同步生成 PARTS.md：与 parts.json 同源，杜绝清单过期 ----
     首版的 PARTS.md 是手工维护的，构件数停在 179 而代码已是 186 —— 正是本轮
     「文档与真值源不同步」的同一个病灶。现在两者由同一份运行时数据渲染。 */
  const LAYER_NAMES = {
    prop: '螺旋桨总成', stern: '艉轴与艉管密封', shaft: '中间轴与推力轴承',
    engine: '主机柴油机 / 燃气轮机', found: '机座与隔振支撑', aux: '辅助管路与控制系统',
  };
  const LAYER_ORDER = ['prop', 'stern', 'shaft', 'engine', 'found', 'aux'];
  const fmt = (n) => n.toLocaleString('en-US');
  const md = [];
  md.push(`# 构件清单（运行时导出，共 ${data.length} 件 / ${fmt(totalTris)} 三角面）`);
  md.push('');
  md.push('> 本清单由 `npm run parts` 从运行中的场景导出，与代码一一对应，非手工编写。');
  md.push('> CI 用 `git diff --exit-code PARTS.md shots/parts.json` 校验同步：改了构件却没重导出会直接失败。');
  md.push('');
  md.push('| 层级 | 构件数 | 三角面 |');
  md.push('|---|---:|---:|');
  for (const l of LAYER_ORDER) {
    const ps = data.filter(p => p.layer === l);
    if (!ps.length) continue;
    md.push(`| ${LAYER_NAMES[l] || l} (\`${l}\`) | ${ps.length} | ${fmt(ps.reduce((s, p) => s + p.tris, 0))} |`);
  }
  md.push('');
  for (const l of LAYER_ORDER) {
    const ps = data.filter(p => p.layer === l);
    if (!ps.length) continue;
    md.push(`## ${LAYER_NAMES[l] || l} · ${ps.length} 件`);
    md.push('');
    const subs = [...new Set(ps.map(p => p.sub || '其它'))];
    for (const s of subs) {
      const group = ps.filter(p => (p.sub || '其它') === s);
      md.push(`**${s}**（${group.length}）`);
      md.push('');
      md.push('| id | 名称 | 关键零件 | 面数 |');
      md.push('|---|---|---|---:|');
      for (const p of group) {
        const details = (p.details || []).join('、').replace(/\|/g, '\\|') || '—';
        md.push(`| \`${p.id}\` | ${p.label.replace(/\|/g, '\\|')} | ${details} | ${fmt(p.tris)} |`);
      }
      md.push('');
    }
  }
  fs.writeFileSync('./PARTS.md', md.join('\n') + '\n');
  console.log('PARTS.md ←', data.length, '件 /', fmt(totalTris), '三角面');
  await browser.close();
})();
