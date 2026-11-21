/**
 * export-allow.mjs — 从 src/core/audit-allow.js 生成 docs/AUDIT-ALLOW.md
 *
 * 设计原则：豁免表只有一个真值源，就是被审计器实际执行的那份数组。
 * 文档由脚本读取源码文本渲染，人工不维护第二份清单；CI 用 git diff --exit-code
 * 校验「改了源码却没重新生成文档」会直接失败。
 *
 * 用法：npm run docs:allow
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../src/core/audit-allow.js', import.meta.url);
const OUT = new URL('../docs/AUDIT-ALLOW.md', import.meta.url);
const lines = readFileSync(SRC, 'utf8').split(/\r?\n/);

const groups = [];
let cur = { title: '通用装配接触', rows: [] };
for (const line of lines) {
  const gm = line.match(/^\s*\/\/\s*-{2,}\s*(.+?)\s*-{2,}\s*$/);
  if (gm) {
    if (cur.rows.length) groups.push(cur);
    cur = { title: gm[1], rows: [] };
    continue;
  }
  // 只解析单行对象字面量；reason 内不含单引号，是本文件遵守的书写约定
  const m = line.match(/^\s*\{\s*a:\s*(.+?),\s*b:\s*(.+?),\s*reason:\s*'(.+?)'\s*\},?\s*$/);
  if (m) cur.rows.push({ a: m[1].trim(), b: m[2].trim(), reason: m[3] });
}
if (cur.rows.length) groups.push(cur);

const total = groups.reduce((n, g) => n + g.rows.length, 0);
const esc = (s) => s.replace(/\|/g, '\\|');

const out = [];
out.push('# 装配接触豁免表（自动生成，请勿手工编辑）');
out.push('');
out.push('> 生成命令：`npm run docs:allow`　·　唯一真值源：[`src/core/audit-allow.js`](../src/core/audit-allow.js)');
out.push('> CI 会执行 `git diff --exit-code docs/AUDIT-ALLOW.md`：源码改了而文档没重生成，流水线直接失败。');
out.push('');
out.push(`当前共 **${total} 条**登记项，分 ${groups.length} 组。`);
out.push('');
out.push('## 为什么需要这张表');
out.push('');
out.push('几何审计把「两个实体子网格的包围盒互相侵入」判为干涉。但船舶推进系统里，');
out.push('**设计上必然重叠**的配合占了很大一部分：轴穿轴承内孔、叶根坐入桨毂法兰座、');
out.push('艉轴穿艉管、螺栓穿法兰、排气支管接缸盖排气道……这些不是穿模，是装配。');
out.push('');
out.push('早期版本用一个「大阈值」把小体积重叠一起放过，结果是：**真缺陷和正常装配一起被掩盖**。');
out.push('现在改成逐条登记 + 工程理由，代价是维护一张表，收益是');
out.push('① 每一处重叠都有人负责；② 新增豁免必须写清理由，无法悄悄放水；');
out.push('③ 审计输出会打印「已登记装配接触 N 条」，数量突变本身就是告警。');
out.push('');
out.push('## 判定规则');
out.push('');
out.push('- `a` / `b` 为构件 id 字符串，或正则表达式字面量（用于 `cover-1`…`cover-6` 这类成组构件）；');
out.push('- 匹配是**双向**的：`(a,b)` 与 `(b,a)` 都命中；');
out.push('- 审计器 `allowReason()` 返回理由即记入 `allowed`，不再计入干涉/走管异常；');
out.push('- 豁免只作用于**干涉与走管**两类检查；传动链空洞、节点失配、链图连通性**不可豁免**；');
out.push('- 想让某处重叠合法，只有两条路：**改几何**，或**在这里登记一条并写明工程理由**。');
out.push('');
out.push('---');
out.push('');
for (const g of groups) {
  out.push(`## ${g.title}（${g.rows.length}）`);
  out.push('');
  out.push('| 构件 A | 构件 B | 工程理由 |');
  out.push('| --- | --- | --- |');
  for (const r of g.rows) {
    out.push(`| \`${esc(r.a)}\` | \`${esc(r.b)}\` | ${esc(r.reason)} |`);
  }
  out.push('');
}
out.push('---');
out.push('');
out.push('## 复核');
out.push('');
out.push('```bash');
out.push('npm run lint:geom          # 四构型门禁，输出「已登记装配接触 N 条」');
out.push('npm run docs:allow         # 重新生成本文件');
out.push('git diff --exit-code docs/AUDIT-ALLOW.md   # 非空 = 源码与文档已不同步');
out.push('```');
out.push('');

writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(`docs/AUDIT-ALLOW.md ← ${total} 条 / ${groups.length} 组`);
