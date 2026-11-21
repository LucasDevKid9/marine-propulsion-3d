import { LAYERS, LAYER_MAP } from '../core/registry.js';
import { SECTION_TARGETS } from '../core/section.js';
import { TELEGRAPH, GT_STEPS } from '../systems/simulation.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export function initUI(app) {
  const { sim, explode, section, flow, reg } = app;
  const treeEl = $('#tree');
  const controlsEl = $('#controls');
  const pctEl = $('#pct');
  const progressEl = $('#progress');
  const stateEl = $('#play-state');
  const partCountEl = $('#part-count');

  /* ---------------- 构件树 ---------------- */
  let treeBuilt = false;
  function buildTree() {
    treeEl.innerHTML = '';
    let total = 0;
    for (const l of LAYERS) {
      const parts = reg.parts.filter((p) => p.layer === l.id);
      if (!parts.length) continue;
      total += parts.length;
      const node = document.createElement('div');
      node.className = 'layer-node' + (['prop', 'engine'].includes(l.id) ? '' : ' closed');
      node.dataset.layer = l.id;

      const head = document.createElement('div');
      head.className = 'layer-head';
      head.innerHTML = `<span class="layer-caret">▾</span>
        <span class="layer-swatch" style="background:${l.color};color:${l.color}"></span>
        <span class="layer-name">${l.name}</span>
        <span class="layer-count">${parts.length}</span>`;
      head.addEventListener('click', () => node.classList.toggle('closed'));
      node.appendChild(head);

      const body = document.createElement('div');
      body.className = 'layer-body';

      const subs = [...new Set(parts.map((p) => p.sub))];
      for (const sub of subs) {
        const sp = parts.filter((p) => p.sub === sub);
        if (sub) {
          const sh = document.createElement('div');
          sh.className = 'sub-head';
          sh.textContent = sub;
          body.appendChild(sh);
        }
        for (const p of sp) {
          const item = document.createElement('div');
          item.className = 'part-item';
          item.dataset.id = p.id;
          item.dataset.search = (p.label + ' ' + p.sub + ' ' + p.id).toLowerCase();
          item.innerHTML = `<span class="tagdot"></span><span>${p.label}</span><span class="pid">${p.id.split('-')[0]}</span>`;
          item.addEventListener('click', () => {
            app.select(p);
            app.focusOn(p, 4.5);
            if (window.innerWidth <= 980) closePanels();
          });
          body.appendChild(item);
        }
      }
      node.appendChild(body);
      treeEl.appendChild(node);
    }
    partCountEl.textContent = String(total);
    treeBuilt = true;
  }

  function highlightTree(id) {
    $$('.part-item', treeEl).forEach((el) => el.classList.toggle('selected', el.dataset.id === id));
    const sel = $(`.part-item[data-id="${id}"]`, treeEl);
    if (sel) {
      const node = sel.closest('.layer-node');
      if (node) node.classList.remove('closed');
      sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  $('#search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$('.layer-node', treeEl).forEach((node) => {
      let any = false;
      $$('.part-item', node).forEach((el) => {
        const hit = !q || el.dataset.search.includes(q);
        el.style.display = hit ? '' : 'none';
        if (hit) any = true;
      });
      node.style.display = any ? '' : 'none';
      if (q && any) node.classList.remove('closed');
    });
  });

  $('#btn-show-all').addEventListener('click', () => {
    reg.parts.forEach((p) => { p.userHidden = false; });
    sim.state.isolateId = null;
    reg.refreshVisibility(sim.state);
    app.toast('已恢复全部构件可见');
  });
  $('#btn-collapse').addEventListener('click', () => {
    $$('.layer-node', treeEl).forEach((n) => n.classList.toggle('closed'));
  });

  /* ---------------- 控制台 ---------------- */
  const sectionBtns = SECTION_TARGETS.filter((s) => s.id !== 'off')
    .map((s) => `<button data-sec="${s.id}">${s.label.replace('剖切', '')}</button>`).join('');
  const teleBtns = TELEGRAPH.map((t, i) => `<button data-tele="${i}" class="${i === 0 ? 'on' : ''}">${t.cn}</button>`).join('');
  const cylBtns = [1, 2, 3, 4, 5, 6].map((i) => `<button class="cyl on" data-cyl="${i - 1}">C${i}</button>`).join('');

  controlsEl.innerHTML = `
    <div class="sec">
      <h3 class="sec-title">视图与剖切 <span class="hint" id="sec-hint">OFF</span></h3>
      <div class="seg" id="mode-seg">
        <button data-mode="assembly" class="on">装配</button>
        <button data-mode="explode">爆炸</button>
        <button data-mode="section">剖切</button>
      </div>
      <div class="seg" id="sec-seg" style="margin-top:5px;flex-wrap:wrap">
        <button data-sec="off" class="on">关闭</button>${sectionBtns}
      </div>
      <div class="row" style="margin-top:9px">
        <label>剖切位置</label>
        <input type="range" id="sec-offset" min="-30" max="30" value="0" step="0.5" />
      </div>
      <p style="font-size:9.5px;color:#5d7788;line-height:1.6;margin:2px 0 0">
        剖切仅作用于壳体类构件，内部运动件保持完整，便于观察气缸、燃烧室、轴承与密封层次。
      </p>
    </div>

    <div class="sec">
      <h3 class="sec-title">推进构型 <span class="hint" id="cfg-hint">DIESEL</span></h3>
      <div class="seg" id="cfg-seg">
        <button data-cfg="diesel" class="on">柴油机直驱</button>
        <button data-cfg="gas">燃气轮机</button>
      </div>
      <div class="seg" id="prop-seg" style="margin-top:5px">
        <button data-prop="cpp" class="on">可调距桨</button>
        <button data-prop="fpp">定距桨 + 导管</button>
      </div>
    </div>

    <div class="sec">
      <h3 class="sec-title">驾驶台车钟 <span class="hint" id="tele-hint">STOP</span></h3>
      <div class="seg" id="tele-seg" style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px">${teleBtns}</div>
      <div class="row" style="margin-top:8px">
        <label>CPP 螺距</label>
        <input type="range" id="pitch" min="-100" max="100" value="0" step="1" />
        <output id="pitch-out">0°</output>
      </div>
      <div class="tele">
        <div><i>轴系转速</i><b id="u-rpm">0.0</b><em>rpm</em></div>
        <div><i>推力输出</i><b id="u-thrust">0</b><em>%</em></div>
      </div>
    </div>

    <div class="sec">
      <h3 class="sec-title">燃气轮机时序 <span class="hint" id="gt-step">0/6</span></h3>
      <div class="seg">
        <button id="gt-start">启动</button>
        <button id="gt-next">下一步</button>
        <button id="gt-stop">停止</button>
      </div>
      <div class="gt-log" id="gt-log">燃气轮机模块待机。启动时序：起动机带转 → 点火 → 分区供油 → 火焰建立 → 高压涡轮自持 → 动力涡轮接入 → 全功率。</div>
    </div>

    <div class="sec">
      <h3 class="sec-title">轴系 / 密封 / 制动</h3>
      <div class="switch-list">
        <div class="sw" data-sw="brake"><i></i>轴系制动</div>
        <div class="sw" data-sw="grease"><i></i>艉密封注脂</div>
        <div class="sw on" data-sw="film"><i></i>推力油膜</div>
        <div class="sw" data-sw="oilfilm-force"><i></i>油膜隔离观察</div>
      </div>
      <div class="tele">
        <div><i>艉管滑油压</i><b id="u-lop">0.12</b><em>MPa</em></div>
        <div><i>海水压力</i><b id="u-seap">0.06</b><em>MPa</em></div>
      </div>
    </div>

    <div class="sec">
      <h3 class="sec-title">辅机 / 单缸控制</h3>
      <div class="switch-list">
        <div class="sw on" data-pump="lo"><i></i>滑油泵</div>
        <div class="sw on" data-pump="sw"><i></i>海水泵</div>
        <div class="sw on" data-pump="fw"><i></i>淡水泵</div>
        <div class="sw on" data-pump="vent"><i></i>通风机</div>
      </div>
      <div class="cyl-grid" style="margin-top:7px" id="cyl-grid">${cylBtns}</div>
      <p style="font-size:9.5px;color:#5d7788;line-height:1.6;margin:6px 0 0">点击 C1–C6 可令单缸熄火 / 缺火，观察曲轴与增压器转速波动。</p>
    </div>

    <div class="sec">
      <h3 class="sec-title">实时参数 <span class="hint" id="perf-hint">${app.perf.toUpperCase()}</span></h3>
      <div class="tele">
        <div><i>曲轴转角</i><b id="u-crank">0</b><em>°</em></div>
        <div><i>燃机转速</i><b id="u-gt">0</b><em>%</em></div>
        <div><i>油膜压力</i><b id="u-film">0.02</b><em>MPa</em></div>
        <div><i>构件总数</i><b id="u-parts">${reg.parts.length}</b><em>pcs</em></div>
      </div>
    </div>
  `;

  /* ---------------- 交互绑定 ---------------- */
  $$('#mode-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      $$('#mode-seg button').forEach((x) => x.classList.toggle('on', x === b));
      $$('#modes .mode-btn').forEach((x) => x.classList.toggle('active', x.dataset.mode === b.dataset.mode));
      app.setMode(b.dataset.mode);
    });
  });

  $$('#modes .mode-btn').forEach((b) => {
    b.addEventListener('click', () => {
      $$('#modes .mode-btn').forEach((x) => x.classList.toggle('active', x === b));
      $$('#mode-seg button').forEach((x) => x.classList.toggle('on', x.dataset.mode === b.dataset.mode));
      app.setMode(b.dataset.mode);
    });
  });

  $$('#sec-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      app.setSection(b.dataset.sec);
      if (b.dataset.sec !== 'off') {
        $$('#mode-seg button').forEach((x) => x.classList.toggle('on', x.dataset.mode === 'section'));
        $$('#modes .mode-btn').forEach((x) => x.classList.toggle('active', x.dataset.mode === 'section'));
      }
    });
  });

  const secOffset = $('#sec-offset');
  secOffset.addEventListener('input', (e) => {
    const t = SECTION_TARGETS.find((x) => x.id === section.active);
    if (!t) return;
    const range = t.range;
    const span = range[1] - range[0];
    section.setOffset(((Number(e.target.value) / 30) * span) / 2);
  });

  $$('#cfg-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      $$('#cfg-seg button').forEach((x) => x.classList.toggle('on', x === b));
      $('#cfg-hint').textContent = b.dataset.cfg === 'gas' ? 'GAS TURBINE' : 'DIESEL';
      app.setConfig(b.dataset.cfg);
    });
  });

  $$('#prop-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      $$('#prop-seg button').forEach((x) => x.classList.toggle('on', x === b));
      app.setPropulsor(b.dataset.prop);
      $('#pitch').disabled = b.dataset.prop === 'fpp';
    });
  });

  $$('#tele-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      $$('#tele-seg button').forEach((x) => x.classList.toggle('on', x === b));
      sim.setTelegraph(Number(b.dataset.tele));
      $('#tele-hint').textContent = TELEGRAPH[Number(b.dataset.tele)].name;
      $('#pitch').value = String(Math.round(sim.order.pitch * (sim.state.propulsor === 'fpp' ? 1 : 1)));
      app.toast(`车钟 → ${TELEGRAPH[Number(b.dataset.tele)].cn} · ${TELEGRAPH[Number(b.dataset.tele)].name}`);
    });
  });

  const pitchEl = $('#pitch');
  pitchEl.addEventListener('input', (e) => {
    sim.setPitch(Number(e.target.value));
  });

  $('#gt-start').addEventListener('click', () => {
    sim.startGT();
    app.toast('燃气轮机启动时序已触发');
    logGt(true);
  });
  $('#gt-next').addEventListener('click', () => {
    sim.stepGT();
    logGt(true);
  });
  $('#gt-stop').addEventListener('click', () => {
    sim.stopGT();
    app.toast('燃气轮机已停机，动力涡轮惰转');
    logGt(true);
  });

  $$('.sw[data-sw]').forEach((el) => {
    el.addEventListener('click', () => {
      const k = el.dataset.sw;
      if (k === 'brake') {
        sim.toggleBrake();
        el.classList.toggle('on', sim.state.brake);
        app.toast(sim.state.brake ? '轴系制动器已锁止' : '轴系制动器已释放');
      } else if (k === 'grease') {
        sim.grease();
        el.classList.add('on');
        setTimeout(() => el.classList.remove('on'), 2400);
        app.toast('艉管唇形密封注脂：三道密封同时加压');
      } else if (k === 'film') {
        const p = reg.get('thrust-oil-film');
        if (p) {
          p.userHidden = !p.userHidden;
          reg.refreshVisibility(sim.state);
          el.classList.toggle('on', !p.userHidden);
        }
      } else if (k === 'oilfilm-force') {
        const p = reg.get('thrust-oil-film');
        if (p) { app.select(p); app.focusOn(p, 3.2); }
      }
    });
  });

  $$('.sw[data-pump]').forEach((el) => {
    el.addEventListener('click', () => {
      const k = el.dataset.pump;
      sim.state.pumps[k] = !sim.state.pumps[k];
      el.classList.toggle('on', sim.state.pumps[k]);
      app.toast(`${el.textContent.trim()}${sim.state.pumps[k] ? '启动' : '停止'}`);
    });
  });

  $$('#cyl-grid .cyl').forEach((b) => {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.cyl);
      const next = !(sim.firingEnabled[i] !== false);
      sim.setCylinderFiring(i, next);
      b.classList.toggle('on', next);
      b.classList.toggle('off', !next);
      app.toast(next ? `第 ${i + 1} 缸恢复燃烧` : `第 ${i + 1} 缸熄火 / 缺火`);
    });
  });

  /* 底部传输控制 */
  const playBtn = $('#btn-play');
  const pauseBtn = $('#btn-pause');
  const resumeBtn = $('#btn-resume');
  const reverseBtn = $('#btn-reverse');
  const resetBtn = $('#btn-reset');

  playBtn.addEventListener('click', () => { explode.play(1); syncProgress(true); });
  pauseBtn.addEventListener('click', () => { explode.pause(); syncProgress(true); });
  resumeBtn.addEventListener('click', () => {
    if (explode.progress >= 0.999) explode.play(-1);
    else explode.play(explode.direction || 1);
    syncProgress(true);
  });
  reverseBtn.addEventListener('click', () => { explode.reverse(); syncProgress(true); });
  resetBtn.addEventListener('click', () => {
    explode.reassemble();
    app.select(null);
    syncProgress(true);
    app.toast('重新装配：构件按层级回落');
  });

  progressEl.addEventListener('pointerdown', () => explode.pause());
  progressEl.addEventListener('input', (e) => {
    explode.playing = false;
    explode.direction = 0;
    explode.setProgress(Number(e.target.value) / 1000);
    syncProgress(true);
  });

  /* 层级快捷条 */
  const chips = $('#layer-chips');
  LAYERS.forEach((l, i) => {
    const b = document.createElement('button');
    b.className = 'layer-chip';
    b.textContent = `${i + 1} ${l.name.split(' / ')[0].replace(/^[①-⑥]\s*/, '')}`;
    b.addEventListener('click', () => {
      explode.stepLayer(i);
      syncProgress(true);
      app.toast(`展开至第 ${i + 1} 层：${l.name}`);
    });
    chips.appendChild(b);
  });

  /* 顶栏快捷 */
  const flowBtn = $('#btn-flow');
  const labelsBtn = $('#btn-labels');
  const xrayBtn = $('#btn-xray');
  labelsBtn.classList.add('on');

  function toggleFlow() {
    const on = flow.toggle();
    flowBtn.classList.toggle('on', on);
    app.toast(on ? '气流可视化：蓝=进气 青=压缩 橙=燃烧 红=排气' : '气流可视化已关闭');
  }
  flowBtn.addEventListener('click', toggleFlow);
  labelsBtn.addEventListener('click', () => {
    const on = !labels.enabled;
    labels.setEnabled(on);
    labelsBtn.classList.toggle('on', on);
  });
  xrayBtn.addEventListener('click', () => {
    const on = !sim.state.xray;
    app.setXray(on);
    xrayBtn.classList.toggle('on', on);
    if (on) app.toast('透视模式：壳体半透明，可见内部运动链');
  });

  /* 移动端面板 */
  $('#btn-panel-left').addEventListener('click', () => {
    $('#panel-left').classList.add('open');
    $('#panel-right').classList.remove('open');
  });
  $('#btn-panel-right').addEventListener('click', () => {
    $('#panel-right').classList.add('open');
    $('#panel-left').classList.remove('open');
  });
  $$('[data-close]').forEach((b) => b.addEventListener('click', closePanels));

  function closePanels() {
    $('#panel-left').classList.remove('open');
    $('#panel-right').classList.remove('open');
  }

  /* 信息卡 */
  const infoEl = $('#info');
  $('#info-close').addEventListener('click', () => app.select(null));
  $('#btn-focus').addEventListener('click', () => { if (app.selected) app.focusOn(app.selected, 4); });
  $('#btn-isolate').addEventListener('click', () => {
    if (!app.selected) return;
    const id = sim.state.isolateId === app.selected.id ? null : app.selected.id;
    app.setIsolate(id);
    app.toast(id ? `隔离显示：${app.selected.label}` : '已取消隔离');
  });
  $('#btn-split').addEventListener('click', () => {
    if (!app.selected) return;
    app.selected.indTarget = app.selected.indTarget > 0.5 ? 0 : 1;
    app.toast(app.selected.indTarget > 0.5 ? '单件拆出' : '单件装回');
  });
  $('#btn-hide').addEventListener('click', () => {
    if (!app.selected) return;
    app.selected.userHidden = true;
    reg.refreshVisibility(sim.state);
    app.select(null);
    app.toast('构件已隐藏，可在构件树"全部显示"恢复');
  });

  function showInfo(part) {
    if (!part) { infoEl.classList.add('hidden'); return; }
    infoEl.classList.remove('hidden');
    $('#info-title').textContent = part.label;
    const layer = LAYER_MAP[part.layer];
    $('#info-meta').textContent = `${layer ? layer.name : '环境'} · ${part.sub || '—'} · ${part.id}`;
    $('#info-details').textContent = part.details.length ? part.details.join(' · ') : '—';
    $('#btn-split').textContent = part.indTarget > 0.5 ? '单件装回' : '单件拆出';
  }

  /* 状态同步 */
  let lastPct = -1, lastGtStep = -1;
  function syncProgress(force) {
    const pct = explode.percent;
    if (force || pct !== lastPct) {
      lastPct = pct;
      pctEl.textContent = pct + '%';
      if (document.activeElement !== progressEl) progressEl.value = String(Math.round(explode.progress * 1000));
      stateEl.textContent = explode.playing
        ? (explode.direction > 0 ? '展开中' : '装配中')
        : pct === 0 ? '已装配' : pct === 100 ? '完全分解' : '已暂停';
      $$('.layer-chip').forEach((c, i) => {
        c.style.borderColor = pct >= [16, 32, 48, 64, 80, 100][i] ? 'rgba(79,216,240,.55)' : '';
        c.style.color = pct >= [16, 32, 48, 64, 80, 100][i] ? '#4fd8f0' : '';
      });
    }
  }

  function logGt(force) {
    const step = sim.state.gtStarted ? sim.state.gtStep : 0;
    const el = $('#gt-log');
    if (force || step !== lastGtStep) {
      lastGtStep = step;
      const lines = GT_STEPS.slice(0, step + 1).map((s, i) => `${i === step ? '▶' : '✓'} ${i} ${s.label}`);
      el.innerHTML = (sim.state.gtStarted ? lines.join('\n') : '燃气轮机模块待机。') +
        `\n<b>转速 ${(sim.state.gtSpeed * 100).toFixed(0)}% · 输出 ${(sim.state.gtOut * 100).toFixed(0)}%</b>`;
      $('#gt-step').textContent = `${step}/6`;
      el.scrollTop = el.scrollHeight;
    }
  }

  /* 每帧刷新读数 */
  let acc = 0;
  function tick(dt) {
    syncProgress(false);
    acc += dt;
    if (acc < 0.08) return;
    acc = 0;
    const s = sim.state;
    $('#t-rpm').textContent = Math.abs(s.rpm).toFixed(1);
    $('#t-pitch').textContent = Math.round(s.pitch);
    $('#t-thrust').textContent = Math.round(Math.abs(s.thrust));
    $('#u-rpm').textContent = Math.abs(s.rpm).toFixed(1);
    $('#u-thrust').textContent = Math.round(Math.abs(s.thrust));
    $('#u-crank').textContent = (((sim.angle * 180 / Math.PI) % 360 + 360) % 360).toFixed(0);
    $('#u-gt').textContent = (s.gtSpeed * 100).toFixed(0);
    $('#u-film').textContent = s.oilFilm.toFixed(2);
    $('#u-lop').textContent = s.loP.toFixed(2);
    $('#u-seap').textContent = s.seaP.toFixed(2);
    if (document.activeElement !== pitchEl) pitchEl.value = String(Math.round(s.pitch));
    $('#pitch-out').textContent = Math.round(s.pitchDeg) + '°';
    $('#sec-hint').textContent = section.active === 'off' ? 'OFF' : (SECTION_TARGETS.find((x) => x.id === section.active)?.label || 'ON');
    logGt(false);
    if (app.selected) showInfo(app.selected);
  }

  function setSectionActive(id) {
    $$('#sec-seg button').forEach((b) => b.classList.toggle('on', b.dataset.sec === id));
    $('#sec-offset').value = '0';
  }

  return { buildTree, showInfo, highlightTree, setSectionActive, syncProgress, toggleFlow, closePanels, tick };
}
