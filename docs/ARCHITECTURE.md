# 架构

```
                       ┌──────────────────────────────────────────┐
                       │  真值表层（唯一出处）                     │
                       │  core/driveline.js   传动链节点 + 路径段  │
                       │  core/materials.js   45 种 PBR 配方       │
                       │  core/registry.js    partVisible() 判据   │
                       └───────────────┬──────────────────────────┘
                                       │ 被引用，不复制
        ┌──────────────────────────────┼───────────────────────────────┐
        ▼                              ▼                               ▼
 ┌─────────────┐              ┌──────────────────┐            ┌────────────────┐
 │ 几何生成层   │              │ 运动 / 交互层     │            │  审计层         │
 │ assemblies/ │              │ systems/         │            │  core/audit.js │
 │  environment│              │  simulation.js   │            │  audit-allow.js│
 │  diesel     │              │ core/explode.js  │            │  scripts/      │
 │  cpp        │              │ core/section.js  │            │   geom-lint.mjs│
 │  shafting   │              │ core/flow.js     │            └───────┬────────┘
 │  gasturbine │              │ core/labels.js   │                    │
 │  piping     │              └──────────────────┘                    │
 └──────┬──────┘                       │                              │
        │  build(g, ctx)               │ 每帧改 animPos / animRot     │ 读 group 与
        ▼                              ▼                              ▼ solidBoxes
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │  registry.add()：独立 Group → bakeStatic 合批 → 留档子网格盒 → 注册元数据     │
 └───────────────────────────────────┬─────────────────────────────────────────┘
                                     ▼
                     ┌───────────────────────────────┐
                     │ renderer + EffectComposer     │
                     │ ACESFilmic / Bloom / clipping │
                     └───────────────────────────────┘
```

## 1. 三层职责

### 真值表层

只放**需要两处以上共同保证**的量。原则：改一次，全局生效。

- `driveline.js` —— 传动链的 8 个节点 + 7 个路径段。所有传动构件的位置、朝向、法兰半径
  都由节点反推，**不由各自的总成文件独立估算**。这也是链图连通性自检的数据源。
- `materials.js` —— 材质只在这一处定义，构件通过 `c.m(key)` 取，避免同一材质在不同文件里渐变成两种颜色。
- `registry.js` 的 `partVisible()` —— 渲染与审计共用的唯一可见性判据。

### 几何生成层

每个 `assemblies/*.js` 导出 `buildXxx(reg): refs`。

- 构件用 `reg.add({ id, label, layer, sub, details, build })` 注册，**id 全局唯一**（重复会直接抛错）。
- `build(g, ctx)` 在构件局部坐标系里建几何；位置由 `pos` 给，朝向由 `rot` / 动画给。
- 需要独立运动的网格（活塞、曲轴、桨叶、火焰筒……）打 `userData.keep`，跳过合批。
- 总成通过 `refs` 把「需要被仿真的对象」返回给 `simulation.js`，**几何与运动解耦**。

### 审计层

只读，不改模型。产出结构化结果 + 人类可读报告。

- `audit.js`：五类谓词（干涉 / 走管 / 链连续 / 节点吻合 / 长跨支承），全部基于几何计算，不看 id 猜意图。
- `audit-allow.js`：设计允许的装配接触豁免表，逐条注明工程理由。
- `geom-lint.mjs`：命令行门禁，四种构型全绿才返回 0。

## 2. 数据流：从节点到网格

```
NODES[...]  ──►  构件 pos / 局部尺寸  ──►  THREE.BufferGeometry
                                             │
                                             ├─► bakeStatic(按材质 × 5 m 分块合批)
                                             │        └─► group.userData.solidBoxes
                                             │             （合批前的子网格盒，审计用）
                                             ▼
                                        Mesh → renderer
```

关键点：**渲染用的网格与审计用的包围盒在同一个函数里分叉**。
合批只服务渲染；审计精度不依赖合批粒度。这就是为什么能把分块从 1.6 m 放大到 5 m
（draw call 2628 → 1982）而不改变审计结论。

## 3. 运动链

```
sim.update(dt)
  ├─ 状态收敛      转速 / 螺距 / 推力 / 各压力（阻尼，非物理求解）
  ├─ 角度积分      crankAngle / shaftAngle / turboAngle / gtAngle / ptAngle
  ├─ 曲柄连杆      crossY = yPin + ROD·cos(asin(xPin/ROD))
  ├─ 配气正时      valvelift(θ) → 阀杆 / 摇臂 / 空气弹簧
  ├─ 燃烧          亮度 = f(θ, 负荷, 单缸熄火位)
  ├─ 桨叶变距      伺服活塞位移 → 曲柄销环转角 → 联动盘 → 桨叶自转
  ├─ 轴系          旋转 / 制动锁止 / 甩油环
  └─ 燃机时序      七步状态机 → 转速目标 / 火焰强度 / 可调静叶
```

`animPos` / `animRot` 是**相对装配位的增量**，与 `explode.js` 的分解位移、
`section.js` 的裁剪平面互不干扰 —— 三者作用在不同通道上。

`sim.setReferencePose(deg)` 把整条链钉到确定位姿（保存 → 重置 → `update(0)` → 恢复），
这是几何审计能作为门禁的前提。

## 4. 为什么不合并成一个大场景

- **构件是交互单位**：点击、隔离、单独拆出、隐藏都以 `id` 为粒度；
- **构件是 BOM 单位**：`PARTS.md` 由运行时导出，与代码一一对应；
- **构件是审计单位**：干涉、走管、豁免都以 `id` 对出现，报告可直接指到零件。

所以合批只在**构件内部**做（同构件同材质），从不跨构件合并 ——
跨构件合并会让上面三件事同时失效。

## 5. 性能取舍（实测）

| 指标 | 值 |
|---|---|
| 构件数 | 186 |
| 合批后网格数 | 1400 |
| draw call | 1982 |
| 三角面 | 423 k |
| 顶点 | 741 k |
| 贴图（全部 Canvas 生成） | 27 |
| 单文件产物 | 974 kB |

`detectPerf()` 按设备分级：`low` 关 Bloom、降像素比；`mid` 保留 Bloom；
移动端竖屏自动切 FOV 与艉部机位。

## 6. 目录

```
src/
  core/        utils · textures · materials · registry · driveline · audit · audit-allow
               explode · section · flow · labels
  assemblies/  environment · diesel · cpp · shafting · gasturbine · piping
  systems/     simulation
  ui/          ui.js · ui.css
scripts/       geom-lint（门禁） · test-core · test-mobile · test-dist · shots · export-parts
docs/          ARCHITECTURE · POSTMORTEM · SKILLS-RETRO
```
