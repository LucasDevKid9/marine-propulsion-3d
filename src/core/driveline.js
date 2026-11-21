/**
 * driveline.js — 推进传动链的单一真值表（Single Source of Truth）
 *
 * 设计动因（见 docs/POSTMORTEM.md 缺陷 A「接缝无人负责」）：
 * 过去每个总成在自己的局部坐标系里估算零件位置，跨总成的接缝（燃机→齿轮箱→轴系）
 * 不属于任何构建者，于是出现 1.8 m 的悬空间隙。现在把传动链显式建模成
 * 「节点（法兰/轴端）+ 路径段（轴/齿轮/联轴器）」的图，几何一律由节点坐标生成，
 * 断裂在结构上变得不可能；审计器再反向校验网格顶点是否落在节点上。
 *
 * 单位：米。坐标：船体坐标系，x 右舷为正，y 向上，z 向艉为负。
 */

/** 节点：p 法兰/轴端中心，a 轴线方向（单位向量），r 名义半径，kind 含义见 SEGMENTS */
export const NODES = {
  'pt-flange': { p: [-4.0, 8.3, -1.9], a: [0, 0, 1], r: 0.3, label: '动力涡轮输出轴端法兰' },
  'angle-top-in': { p: [-4.0, 8.3, -1.55], a: [0, 0, 1], r: 0.28, label: '上直角传动箱输入法兰' },
  'angle-top-out': { p: [-4.0, 7.52, -1.05], a: [0, -1, 0], r: 0.16, label: '上直角传动箱输出法兰' },
  'angle-bot-in': { p: [-4.0, 2.78, -1.05], a: [0, -1, 0], r: 0.16, label: '下直角传动箱输入法兰' },
  'angle-bot-out': { p: [-3.62, 1.95, -1.05], a: [1, 0, 0], r: 0.13, label: '下直角传动箱输出法兰' },
  'gear-in': { p: [-1.0, 1.95, -1.05], a: [1, 0, 0], r: 0.18, label: '主减速齿轮箱输入法兰' },
  'gear-out': { p: [0.0, 1.95, -2.23], a: [0, 0, -1], r: 0.5, label: '主减速齿轮箱输出法兰' },
  'shaft-in': { p: [0.0, 1.95, -2.67], a: [0, 0, -1], r: 0.55, label: '中间轴前端法兰' },
};

/**
 * 路径段。kind:
 *  - shaft   同轴刚性轴
 *  - gear    90° 换向 / 减速（允许轴向改变）
 *  - flex    弹性 / 膜片联轴器
 * parts    声明由哪些构件实现该段 —— 审计器据此反查几何有没有按表落地。
 * supports（可选）声明该段的中间支承件 —— 长跨段必须显式列出，
 *          审计器不再靠 id 里有没有 "bearing" 去猜（见 POSTMORTEM 缺陷 C）。
 */
export const SEGMENTS = [
  { id: 'gt-flex', from: 'pt-flange', to: 'angle-top-in', kind: 'flex', label: '燃机膜片联轴器', parts: ['gt-flex-coupling'] },
  { id: 'gt-angle-drive', from: 'angle-top-in', to: 'angle-top-out', kind: 'gear', label: '上直角传动箱', parts: ['gt-angle-drive'] },
  {
    id: 'gt-drop-shaft', from: 'angle-top-out', to: 'angle-bot-in', kind: 'shaft', label: '竖直传动轴',
    parts: ['gt-drop-shaft'], supports: ['gt-drop-shaft-bearing'],
  },
  { id: 'gt-cross-connect', from: 'angle-bot-in', to: 'angle-bot-out', kind: 'gear', label: '下直角传动箱', parts: ['gt-cross-connect'] },
  {
    id: 'gt-cross-shaft', from: 'angle-bot-out', to: 'gear-in', kind: 'shaft', label: '横向传动轴',
    parts: ['gt-cross-shaft'],
  },
  { id: 'gt-main-gear', from: 'gear-in', to: 'gear-out', kind: 'gear', label: '主减速齿轮箱', parts: ['gt-main-gear'] },
  { id: 'shaft-flex', from: 'gear-out', to: 'shaft-in', kind: 'flex', label: '高弹性联轴器', parts: ['shaft-flex-coupling'] },
];

/** 属于燃气轮机替代构型的段（柴油机直驱时隐藏） */
export const GT_SEGMENTS = new Set([
  'gt-flex', 'gt-angle-drive', 'gt-drop-shaft', 'gt-cross-connect', 'gt-cross-shaft', 'gt-main-gear',
]);

export function node(id) {
  const n = NODES[id];
  if (!n) throw new Error('driveline: unknown node ' + id);
  return n;
}

export const NODE_IDS = Object.keys(NODES);

/** 节点图：id → 关联段 id 列表 */
export function graph() {
  const deg = Object.fromEntries(NODE_IDS.map((k) => [k, []]));
  for (const s of SEGMENTS) {
    deg[s.from].push(s.id);
    deg[s.to].push(s.id);
  }
  return deg;
}

export const TERMINALS = ['pt-flange', 'shaft-in'];

/**
 * 连通性自检：除两端自由端外每个节点度必须为 2；整图必须是一条单链，
 * 不允许悬空支路、孤岛或不可达段。
 */
export function checkChain() {
  const deg = graph();
  const issues = [];
  for (const [id, segs] of Object.entries(deg)) {
    if (segs.length === 0) issues.push({ node: id, type: 'orphan', msg: '节点未被任何路径段引用' });
    else if (segs.length === 1 && !TERMINALS.includes(id)) issues.push({ node: id, type: 'dangling', msg: `度=1 但非自由端（${segs[0]}）` });
    else if (segs.length > 2) issues.push({ node: id, type: 'branch', msg: `度=${segs.length}，出现支路` });
  }
  const seen = new Set();
  const stack = [TERMINALS[0]];
  while (stack.length) {
    const n = stack.pop();
    for (const s of deg[n]) {
      if (seen.has(s)) continue;
      seen.add(s);
      const seg = SEGMENTS.find((x) => x.id === s);
      stack.push(seg.from === n ? seg.to : seg.from);
    }
  }
  const unreached = SEGMENTS.filter((s) => !seen.has(s.id)).map((s) => s.id);
  if (unreached.length) issues.push({ node: '-', type: 'disconnected', msg: '不可达段：' + unreached.join(', ') });
  // 轴线与段方向一致性：shaft 段两端轴线应同向
  for (const s of SEGMENTS) {
    if (s.kind !== 'shaft') continue;
    const a = node(s.from), b = node(s.to);
    const dir = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
    const len = Math.hypot(...dir);
    const cos = Math.abs((dir[0] * a.a[0] + dir[1] * a.a[1] + dir[2] * a.a[2]) / (len || 1));
    if (cos < 0.999) issues.push({ node: s.id, type: 'misaligned', msg: `轴段与轴线不共线（cos=${cos.toFixed(4)}）` });
  }
  return { ok: issues.length === 0, issues, segments: SEGMENTS.length, nodes: NODE_IDS.length };
}

/** 段长 */
export function span(s) {
  const a = node(s.from).p, b = node(s.to).p;
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}
