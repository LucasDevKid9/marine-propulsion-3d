/**
 * audit-allow.js — 干涉审计的「设计嵌套/装配接触」豁免表
 *
 * 工程上的「干涉」分两类：一类是设计不允许的穿模，一类是装配上必须接触或嵌套的配合
 * （轴穿轴承、叶根坐入桨毂、螺栓穿法兰）。第二类在几何上必然重叠，不能算缺陷。
 * 这里逐条登记并注明理由，而不是用一个大阈值把它们一起放过——这样豁免本身是可审计的。
 *
 * 每条：a / b 为 id 或正则，reason 为工程理由。
 */
export const ALLOW = [
  { a: 'diesel-exhaust-manifold', b: 'turbo-casing', reason: '排气集管经膨胀节接入增压器蜗壳' },
  { a: 'turbo-rotor', b: 'turbo-casing', reason: '增压器转子装于蜗壳与轴承体内' },
  { a: /^cpp-blade-\d$/, b: 'cpp-hub', reason: '桨叶叶根法兰坐入桨毂法兰座，由 12 条螺栓压紧' },
  { a: 'fpp-blade-1', b: 'cpp-hub', reason: 'FPP 桨叶锥孔装于艉轴锥端' },
  { a: 'shaft-intermediate', b: /^thrust-(collar|pads|oil-film)$/, reason: '推力环热套于中间轴，油膜位于推力块与推力环之间' },
  { a: /^hp-pipe-\d$/, b: /^cover-\d$/, reason: '高压油管穿过气缸盖罩接入喷油器' },
  { a: /^injector-\d$/, b: /^cover-\d$/, reason: '喷油器安装于气缸盖中央孔内' },
  { a: /^injector-\d$/, b: 'hp-pipe-1', reason: '高压油管接入喷油器进油口' },
  { a: /^stern-seal-\d$/, b: 'stern-shaft', reason: '唇形密封唇口贴合艉轴衬套' },
  { a: 'stern-bearings', b: 'stern-shaft', reason: '白合金轴承支承艉轴轴颈' },
  { a: 'stern-gland', b: 'stern-shaft', reason: '密封压盖套装于艉轴' },
  { a: 'stern-tube', b: 'stern-shaft', reason: '艉轴穿艉管内孔' },
  { a: 'cpp-oil-pipes', b: /^(stern-shaft|stern-tube|cpp-hub)$/, reason: 'CPP 双层输油管经空心艉轴内孔进入桨毂' },
  { a: 'diesel-scavenge', b: 'diesel-liner', reason: '扫气箱经缸套扫气口与扫气室连通' },
  { a: 'diesel-crankshaft', b: 'diesel-main-bearings', reason: '主轴颈落于主轴承下瓦' },
  { a: 'diesel-flywheel', b: 'diesel-crankshaft', reason: '飞轮套装于曲轴后端法兰' },
  { a: 'diesel-flywheel', b: 'diesel-main-bearings', reason: '飞轮端主轴承支承曲轴后端' },
  { a: 'shaft-flex-coupling', b: /^(shaft-intermediate|gt-main-gear)$/, reason: '高弹性联轴器两侧法兰分别与中间轴、齿轮箱输出法兰对接' },
  { a: 'diesel-crankshaft', b: 'diesel-coupling-flange', reason: '曲轴输出法兰与联轴器对接' },
  { a: 'diesel-cylinder-jacket', b: /^cover-\d$/, reason: '气缸盖罩坐于气缸体顶面，四周螺栓压紧' },
  { a: 'diesel-liner', b: /^cover-\d$/, reason: '缸套上端伸入缸盖罩内的密封环座' },
  { a: 'thrust-collar', b: 'thrust-pads', reason: '推力块瓦面与推力环油膜面相接触' },
  { a: 'shaft-oil-ring', b: /^(shaft-intermediate|shaft-intermediate-bearing)$/, reason: '甩油环挂装在中间轴上并浸入轴承油池' },
  { a: 'diesel-cylinder-jacket', b: /^guide-\d$/, reason: '十字头导板用螺栓把合在气缸体下部' },
  // ---- 第二轮补齐（装配接触，几何必然重叠但设计允许） ----
  { a: 'shaft-intermediate', b: 'shaft-intermediate-bearing', reason: '中间轴轴颈落于中间轴承下瓦，油膜厚度不计入几何模型' },
  { a: 'shaft-intermediate', b: 'stern-shaft', reason: '中间轴后端法兰与艉轴前端法兰以螺栓对接（法兰止口互相嵌入）' },
  { a: 'thrust-collar', b: 'shaft-oil-ring', reason: '甩油环骑挂在推力环外圆上，靠环面摩擦带动取油' },
  { a: 'shaft-intermediate-bearing', b: 'stern-shaft', reason: '艉轴前端穿过中间轴承座内孔' },
  { a: 'env-transom', b: 'stern-shaft', reason: '艉轴穿过艉封板上的艉管开口' },
  { a: /^cover-\d$/, b: 'diesel-exhaust-manifold', reason: '排气支管自缸盖排气道出口法兰引出，与盖体交接' },
  { a: 'diesel-scavenge', b: 'diesel-cylinder-jacket', reason: '扫气箱以法兰贴合气缸体扫气侧，螺栓紧固' },
  { a: /^conrod-\d$/, b: 'diesel-crankshaft', reason: '连杆大端轴瓦装于曲柄销，间隙由轴瓦油膜承担' },
  { a: 'diesel-liner', b: /^conrod-\d$/, reason: '连杆小端 / 活塞位于缸套内孔，行程末端贴近缸套下缘' },
  { a: /^fuelpump-\d$/, b: 'diesel-camshaft', reason: '喷油泵滚轮挺柱落于燃油凸轮工作表面' },
  { a: /^rocker-\d$/, b: 'diesel-camshaft', reason: '摇臂滚轮与凸轮型线接触' },
  // ---- 运动件包络：连杆 / 十字头在行程中必然扫过缸体与轴承座的让位腔 ----
  { a: /^conrod-\d$/, b: 'diesel-cylinder-jacket', reason: '连杆摆动包络穿过缸体下部的连杆让位开口（模型未单独建让位腔）' },
  { a: /^conrod-\d$/, b: 'diesel-scavenge', reason: '扫气箱下缘让开连杆最大摆角包络' },
  { a: /^conrod-\d$/, b: 'diesel-main-bearings', reason: '连杆大端与曲柄臂在主轴承座之间的轴向让位槽内摆动' },
  { a: /^crosshead-\d$/, b: /^conrod-\d$/, reason: '十字头销装于连杆小端轴承内' },
  { a: /^combustion-\d$/, b: /^(diesel-liner|diesel-cylinder-jacket)$/, reason: '燃烧室发光体即缸盖底面与活塞顶之间的燃烧空间本身' },
  // ---- 燃气轮机：分段机匣法兰对接、转子装机匣 ----
  { a: 'gt-hp-casing', b: 'gt-comb-casing', reason: '高压压气机机匣与燃烧室机匣法兰对接' },
  { a: 'gt-lp-casing', b: 'gt-hp-casing', reason: '低压 / 高压机匣中段法兰对接' },
  { a: 'gt-comb-casing', b: 'gt-hp-turbine-casing', reason: '燃烧室出口过渡段与高压涡轮机匣法兰对接' },
  { a: 'gt-hp-casing', b: 'gt-hp-rotor', reason: '高压转子装于高压机匣内（叶尖间隙不计入几何模型）' },
  { a: 'gt-pt-casing', b: 'gt-pt-rotor', reason: '动力涡轮转子装于动力涡轮机匣内' },
  { a: 'gt-flametubes', b: 'gt-hp-rotor', reason: '火焰筒过渡段内端贴近涡轮进口导叶环' },
  { a: 'gt-intake-filter', b: 'gt-hp-rotor', reason: '进气滤清器出口与压气机进口导流罩对接' },
  { a: 'gt-lp-casing', b: 'gt-accessory-gearbox', reason: '附件齿轮箱以法兰挂装在低压机匣下方' },
  // ---- 桨毂内部转叶机构 ----
  { a: /^cpp-blade-\d$/, b: 'cpp-servo-piston', reason: '桨叶叶根曲柄与转叶伺服活塞同在桨毂内腔，属同一机构的配合件' },
  { a: 'cpp-servo-piston', b: 'cpp-crank-ring', reason: '伺服活塞推杆与转叶曲柄销环同处桨毂伺服腔' },
  { a: /^gt-(lp|comb|hp)-casing$/, b: 'gt-hp-rotor', reason: '高压转子轴段穿过相邻机匣的内孔（轴封处配合）' },
];

function hit(pat, id) {
  return typeof pat === 'string' ? pat === id : pat.test(id);
}

/** 命中豁免表则返回理由，否则 null */
export function allowReason(a, b) {
  for (const r of ALLOW) {
    if ((hit(r.a, a) && hit(r.b, b)) || (hit(r.a, b) && hit(r.b, a))) return r.reason;
  }
  return null;
}
