# 装配接触豁免表（自动生成，请勿手工编辑）

> 生成命令：`npm run docs:allow`　·　唯一真值源：[`src/core/audit-allow.js`](../src/core/audit-allow.js)
> CI 会执行 `git diff --exit-code docs/AUDIT-ALLOW.md`：源码改了而文档没重生成，流水线直接失败。

当前共 **51 条**登记项，分 5 组。

## 为什么需要这张表

几何审计把「两个实体子网格的包围盒互相侵入」判为干涉。但船舶推进系统里，
**设计上必然重叠**的配合占了很大一部分：轴穿轴承内孔、叶根坐入桨毂法兰座、
艉轴穿艉管、螺栓穿法兰、排气支管接缸盖排气道……这些不是穿模，是装配。

早期版本用一个「大阈值」把小体积重叠一起放过，结果是：**真缺陷和正常装配一起被掩盖**。
现在改成逐条登记 + 工程理由，代价是维护一张表，收益是
① 每一处重叠都有人负责；② 新增豁免必须写清理由，无法悄悄放水；
③ 审计输出会打印「已登记装配接触 N 条」，数量突变本身就是告警。

## 判定规则

- `a` / `b` 为构件 id 字符串，或正则表达式字面量（用于 `cover-1`…`cover-6` 这类成组构件）；
- 匹配是**双向**的：`(a,b)` 与 `(b,a)` 都命中；
- 审计器 `allowReason()` 返回理由即记入 `allowed`，不再计入干涉/走管异常；
- 豁免只作用于**干涉与走管**两类检查；传动链空洞、节点失配、链图连通性**不可豁免**；
- 想让某处重叠合法，只有两条路：**改几何**，或**在这里登记一条并写明工程理由**。

---

## 通用装配接触（24）

| 构件 A | 构件 B | 工程理由 |
| --- | --- | --- |
| `'diesel-exhaust-manifold'` | `'turbo-casing'` | 排气集管经膨胀节接入增压器蜗壳 |
| `'turbo-rotor'` | `'turbo-casing'` | 增压器转子装于蜗壳与轴承体内 |
| `/^cpp-blade-\d$/` | `'cpp-hub'` | 桨叶叶根法兰坐入桨毂法兰座，由 12 条螺栓压紧 |
| `'fpp-blade-1'` | `'cpp-hub'` | FPP 桨叶锥孔装于艉轴锥端 |
| `'shaft-intermediate'` | `/^thrust-(collar\|pads\|oil-film)$/` | 推力环热套于中间轴，油膜位于推力块与推力环之间 |
| `/^hp-pipe-\d$/` | `/^cover-\d$/` | 高压油管穿过气缸盖罩接入喷油器 |
| `/^injector-\d$/` | `/^cover-\d$/` | 喷油器安装于气缸盖中央孔内 |
| `/^injector-\d$/` | `'hp-pipe-1'` | 高压油管接入喷油器进油口 |
| `/^stern-seal-\d$/` | `'stern-shaft'` | 唇形密封唇口贴合艉轴衬套 |
| `'stern-bearings'` | `'stern-shaft'` | 白合金轴承支承艉轴轴颈 |
| `'stern-gland'` | `'stern-shaft'` | 密封压盖套装于艉轴 |
| `'stern-tube'` | `'stern-shaft'` | 艉轴穿艉管内孔 |
| `'cpp-oil-pipes'` | `/^(stern-shaft\|stern-tube\|cpp-hub)$/` | CPP 双层输油管经空心艉轴内孔进入桨毂 |
| `'diesel-scavenge'` | `'diesel-liner'` | 扫气箱经缸套扫气口与扫气室连通 |
| `'diesel-crankshaft'` | `'diesel-main-bearings'` | 主轴颈落于主轴承下瓦 |
| `'diesel-flywheel'` | `'diesel-crankshaft'` | 飞轮套装于曲轴后端法兰 |
| `'diesel-flywheel'` | `'diesel-main-bearings'` | 飞轮端主轴承支承曲轴后端 |
| `'shaft-flex-coupling'` | `/^(shaft-intermediate\|gt-main-gear)$/` | 高弹性联轴器两侧法兰分别与中间轴、齿轮箱输出法兰对接 |
| `'diesel-crankshaft'` | `'diesel-coupling-flange'` | 曲轴输出法兰与联轴器对接 |
| `'diesel-cylinder-jacket'` | `/^cover-\d$/` | 气缸盖罩坐于气缸体顶面，四周螺栓压紧 |
| `'diesel-liner'` | `/^cover-\d$/` | 缸套上端伸入缸盖罩内的密封环座 |
| `'thrust-collar'` | `'thrust-pads'` | 推力块瓦面与推力环油膜面相接触 |
| `'shaft-oil-ring'` | `/^(shaft-intermediate\|shaft-intermediate-bearing)$/` | 甩油环挂装在中间轴上并浸入轴承油池 |
| `'diesel-cylinder-jacket'` | `/^guide-\d$/` | 十字头导板用螺栓把合在气缸体下部 |

## 第二轮补齐（装配接触，几何必然重叠但设计允许）（11）

| 构件 A | 构件 B | 工程理由 |
| --- | --- | --- |
| `'shaft-intermediate'` | `'shaft-intermediate-bearing'` | 中间轴轴颈落于中间轴承下瓦，油膜厚度不计入几何模型 |
| `'shaft-intermediate'` | `'stern-shaft'` | 中间轴后端法兰与艉轴前端法兰以螺栓对接（法兰止口互相嵌入） |
| `'thrust-collar'` | `'shaft-oil-ring'` | 甩油环骑挂在推力环外圆上，靠环面摩擦带动取油 |
| `'shaft-intermediate-bearing'` | `'stern-shaft'` | 艉轴前端穿过中间轴承座内孔 |
| `'env-transom'` | `'stern-shaft'` | 艉轴穿过艉封板上的艉管开口 |
| `/^cover-\d$/` | `'diesel-exhaust-manifold'` | 排气支管自缸盖排气道出口法兰引出，与盖体交接 |
| `'diesel-scavenge'` | `'diesel-cylinder-jacket'` | 扫气箱以法兰贴合气缸体扫气侧，螺栓紧固 |
| `/^conrod-\d$/` | `'diesel-crankshaft'` | 连杆大端轴瓦装于曲柄销，间隙由轴瓦油膜承担 |
| `'diesel-liner'` | `/^conrod-\d$/` | 连杆小端 / 活塞位于缸套内孔，行程末端贴近缸套下缘 |
| `/^fuelpump-\d$/` | `'diesel-camshaft'` | 喷油泵滚轮挺柱落于燃油凸轮工作表面 |
| `/^rocker-\d$/` | `'diesel-camshaft'` | 摇臂滚轮与凸轮型线接触 |

## 运动件包络：连杆 / 十字头在行程中必然扫过缸体与轴承座的让位腔（5）

| 构件 A | 构件 B | 工程理由 |
| --- | --- | --- |
| `/^conrod-\d$/` | `'diesel-cylinder-jacket'` | 连杆摆动包络穿过缸体下部的连杆让位开口（模型未单独建让位腔） |
| `/^conrod-\d$/` | `'diesel-scavenge'` | 扫气箱下缘让开连杆最大摆角包络 |
| `/^conrod-\d$/` | `'diesel-main-bearings'` | 连杆大端与曲柄臂在主轴承座之间的轴向让位槽内摆动 |
| `/^crosshead-\d$/` | `/^conrod-\d$/` | 十字头销装于连杆小端轴承内 |
| `/^combustion-\d$/` | `/^(diesel-liner\|diesel-cylinder-jacket)$/` | 燃烧室发光体即缸盖底面与活塞顶之间的燃烧空间本身 |

## 燃气轮机：分段机匣法兰对接、转子装机匣（8）

| 构件 A | 构件 B | 工程理由 |
| --- | --- | --- |
| `'gt-hp-casing'` | `'gt-comb-casing'` | 高压压气机机匣与燃烧室机匣法兰对接 |
| `'gt-lp-casing'` | `'gt-hp-casing'` | 低压 / 高压机匣中段法兰对接 |
| `'gt-comb-casing'` | `'gt-hp-turbine-casing'` | 燃烧室出口过渡段与高压涡轮机匣法兰对接 |
| `'gt-hp-casing'` | `'gt-hp-rotor'` | 高压转子装于高压机匣内（叶尖间隙不计入几何模型） |
| `'gt-pt-casing'` | `'gt-pt-rotor'` | 动力涡轮转子装于动力涡轮机匣内 |
| `'gt-flametubes'` | `'gt-hp-rotor'` | 火焰筒过渡段内端贴近涡轮进口导叶环 |
| `'gt-intake-filter'` | `'gt-hp-rotor'` | 进气滤清器出口与压气机进口导流罩对接 |
| `'gt-lp-casing'` | `'gt-accessory-gearbox'` | 附件齿轮箱以法兰挂装在低压机匣下方 |

## 桨毂内部转叶机构（3）

| 构件 A | 构件 B | 工程理由 |
| --- | --- | --- |
| `/^cpp-blade-\d$/` | `'cpp-servo-piston'` | 桨叶叶根曲柄与转叶伺服活塞同在桨毂内腔，属同一机构的配合件 |
| `'cpp-servo-piston'` | `'cpp-crank-ring'` | 伺服活塞推杆与转叶曲柄销环同处桨毂伺服腔 |
| `/^gt-(lp\|comb\|hp)-casing$/` | `'gt-hp-rotor'` | 高压转子轴段穿过相邻机匣的内孔（轴封处配合） |

---

## 复核

```bash
npm run lint:geom          # 四构型门禁，输出「已登记装配接触 N 条」
npm run docs:allow         # 重新生成本文件
git diff --exit-code docs/AUDIT-ALLOW.md   # 非空 = 源码与文档已不同步
```
