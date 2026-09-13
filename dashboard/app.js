/* JobHuntBot Dashboard — 重构版前端逻辑（原生 JS，无打包） */
(function () {
  'use strict';

  // ---------------- theme ----------------
  const root = document.documentElement;
  function applyTheme(t) {
    if (t) root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
  }
  applyTheme(localStorage.getItem('dash-theme') || '');

  // ---------------- csv parse ----------------
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (inQuotes) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') { inQuotes = true; }
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\r') { /* skip */ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else { field += c; }
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
    if (!rows.length) return [];
    const header = rows.shift();
    return rows.filter(r => !(r.length === 1 && r[0] === '')).map(r => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ''; });
      return obj;
    });
  }

  // ---------------- data ----------------
  const data = { jobs: [], followUps: [], lastRead: null };
  async function readCSV(name) {
    const res = await fetch('./' + name + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(name + ' 读取失败 (HTTP ' + res.status + ')');
    return parseCSV(await res.text());
  }
  async function refreshData() {
    const jobs = await readCSV('job_pool.csv');
    jobs.forEach((r, i) => { r.__rowIndex = i; });
    const fu = await readCSV('follow_up.csv').catch(() => []);
    fu.forEach((r, i) => { r.__rowIndex = i; });
    data.jobs = jobs;
    data.followUps = fu;
    data.lastRead = new Date();
  }

  // ---------------- helpers ----------------
  const VALID_STAGE = ['测评', '笔试', '一面', '二面', '三面', '终面', 'HR面', '谈薪'];
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function normRF(rf) { return (rf || '').replace(/^[①-⑨]\s*/, '').trim() || '未分类'; }
  function category(r) { return normRF(r.role_family); }
  function tierOf(r) { const t = (r.submission_tier || '').trim(); return ['S', 'A', 'B', '待解阻塞'].includes(t) ? t : ''; }
  function isExcluded(r) { return ['排除-内容创作岗', '已过期'].includes((r.status || '').trim()); }
  function hasStageWord(s) { return VALID_STAGE.some(w => (s || '').indexOf(w) !== -1); }

  function isBlocked(r) {
    if (isExcluded(r)) return false;
    if ((r.blocker || '').trim()) return true;
    const na = r.next_action || '';
    return ['需登录', '待登录核验', '飞书招聘需登录', '待复核', '无法投递', '镜像过期', '已下线', 'post id', '直链', '官方链接待复核', '镜像'].some(k => na.indexOf(k) !== -1);
  }
  function classifyBlocker(r) {
    const na = r.next_action || '';
    const b = r.blocker || '';
    if (na.indexOf('需登录') !== -1 || na.indexOf('待登录核验') !== -1 || na.indexOf('飞书招聘需登录') !== -1)
      return '需登录';
    if (['待复核', '无法投递', '镜像过期', '已下线', 'post id', '直链', '官方链接待复核', '镜像'].some(k => (b + na).indexOf(k) !== -1))
      return '链接待复核·失效';
    return '其他';
  }
  function blockerReason(r) {
    return (r.blocker || '').trim() || (r.next_action || '').trim() || '待处理';
  }

  // pipeline stage: pending | submitted | assess | interview | ended
  function pipelineStage(r) {
    if (isExcluded(r)) return 'ended';
    const st = (r.status || '').trim();
    const cs = (r.current_stage || '').trim();
    if (st === 'Offer' || st === 'Rejected') return 'ended';
    if (st === 'Submitted') {
      if (hasStageWord(cs)) {
        if (cs.indexOf('测评') !== -1 || cs.indexOf('笔试') !== -1) return 'assess';
        return 'interview';
      }
      return 'submitted';
    }
    return 'pending';
  }
  function stageLabel(r) {
    const s = pipelineStage(r);
    const cs = (r.current_stage || '').trim();
    if (s === 'interview') return cs && hasStageWord(cs) ? cs : '面试中';
    if (s === 'assess') return cs && hasStageWord(cs) ? cs : '测评中';
    if (s === 'submitted') return '已投递·等待反馈';
    if (s === 'ended') return (r.status === 'Offer') ? 'Offer' : (r.status === 'Rejected') ? '已挂' : '已结束';
    return '待投递';
  }
  function statusLabel(r) {
    const s = (r.status || '').trim();
    if (s === 'Submitted') return '已投递';
    if (s === 'Pending') return isBlocked(r) ? '阻塞' : '待投递';
    if (s === 'Offer') return 'Offer';
    if (s === 'Rejected') return '已挂';
    if (isExcluded(r)) return s === '已过期' ? '已过期' : '已排除';
    return s || '待投递';
  }

  // ---------------- toast ----------------
  function toast(msg, kind) {
    const wrap = document.getElementById('toast-wrap');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2600);
  }

  // ---------------- api ----------------
  async function apiPost(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) throw new Error(result.error || ('HTTP ' + res.status));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ---------------- drawer ----------------
  let drawerJob = null;
  function openDrawer(r) {
    drawerJob = r;
    const d = document.getElementById('drawer');
    const url = (r.job_url || '').trim();
    const jd = (r.notes || '').trim() || (r.next_action || '').trim();
    const rv = (r.resume_variant || '').trim();
    const blk = (r.blocker || '').trim();
    const dlg = `
      <div class="drawer-head">
        <div>
          <h3>${esc(r.company)}</h3>
          <div class="ac-title">${esc(r.job_title)}</div>
        </div>
        <button class="btn btn-sm btn-ghost" id="drawer-close">✕</button>
      </div>
      <div class="dv"><span class="chip chip-cat1">${esc(category(r))}</span> ${tierOf(r) ? '<span class="chip tier-' + tierOf(r) + '">' + tierOf(r) + '梯队</span>' : ''} <span class="chip">${esc(statusLabel(r))}</span></div>
      <div class="dl">地点 / 类型</div><div class="dv">${esc(r.location || '—')} · ${esc(r.level || r.convert_track || '—')}</div>
      <div class="dl">投递梯队</div><div class="dv">${esc(r.submission_tier || '未分档')}</div>
      <div class="dl">当前阶段</div><div class="dv">${esc(stageLabel(r))}</div>
      <div class="dl">下一步</div><div class="dv">${esc(r.next_action || '—')}</div>
      ${url ? '<div class="dl">官网链接</div><div class="dv"><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a></div>' : ''}
      <div class="dl">来源</div><div class="dv">${esc(r.source || '—')}</div>
      ${rv ? '<div class="dl">推荐简历版本</div><div class="dv">' + esc(rv) + '</div>' : ''}
      ${blk ? '<div class="dl">阻塞原因</div><div class="dv" style="color:var(--warning)">' + esc(blk) + '</div>' : ''}
      <div class="dl">岗位说明 / 适配理由</div><div class="dv">${esc(jd) || '—'}</div>
      <div class="drawer-actions">
        ${url ? '<a class="btn btn-primary" href="' + esc(url) + '" target="_blank" rel="noopener">打开官网</a>' : ''}
        ${(r.status || '').trim() === 'Pending' && !isExcluded(r) ? '<button class="btn" id="drawer-submit">标记已投递</button>' : ''}
        ${isBlocked(r) ? '<button class="btn" id="drawer-resolve">标记已解决</button>' : ''}
      </div>`;
    d.innerHTML = dlg;
    d.classList.add('open');
    document.getElementById('drawer-overlay').classList.remove('hidden');
    document.getElementById('drawer-close').addEventListener('click', closeDrawer);
    const sb = document.getElementById('drawer-submit');
    if (sb) sb.addEventListener('click', () => { closeDrawer(); doMarkSubmitted(r, 'Submitted'); });
    const rb = document.getElementById('drawer-resolve');
    if (rb) rb.addEventListener('click', () => { closeDrawer(); doResolve(r); });
  }
  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.add('hidden');
    drawerJob = null;
  }
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);

  // ---------------- write ops ----------------
  async function doMarkSubmitted(r, status) {
    toast('处理中…');
    const res = await apiPost('/api/update-status', { job_id: r.job_id, company: r.company, job_title: r.job_title, status });
    if (!res.ok) { toast('失败：' + res.error, 'err'); return; }
    toast(status === 'Submitted' ? '已标记为已投递' : (status === 'Pending' ? '已撤销' : '已更新状态'), 'ok');
    await refreshData(); renderAll();
  }
  async function doMarkEnded(r, status) {
    toast('处理中…');
    const res = await apiPost('/api/update-status', { job_id: r.job_id, company: r.company, job_title: r.job_title, status });
    if (!res.ok) { toast('失败：' + res.error, 'err'); return; }
    toast(status === 'Offer' ? '已标记为 Offer 🎉' : '已标记为已挂', 'ok');
    await refreshData(); renderAll();
  }
  async function doResolve(r) {
    toast('处理中…');
    const res = await apiPost('/api/blocker/resolve', { job_id: r.job_id, company: r.company, job_title: r.job_title });
    if (!res.ok) { toast('失败：' + res.error, 'err'); return; }
    toast('阻塞已解决', 'ok');
    await refreshData(); renderAll();
  }

  // ---------------- today view ----------------
  function computeStats() {
    const pendingHigh = data.jobs.filter(r => (r.status || '').trim() === 'Pending' && !isExcluded(r) && (tierOf(r) === 'S' || tierOf(r) === 'A' || isBlocked(r)));
    const submitted = data.jobs.filter(r => (r.status || '').trim() === 'Submitted');
    const interview = data.jobs.filter(r => pipelineStage(r) === 'interview');
    const offer = data.jobs.filter(r => (r.status || '').trim() === 'Offer');
    return { pendingAction: pendingHigh.length, submitted: submitted.length, interview: interview.length, offer: offer.length };
  }
  function actionQueue() {
    const cand = data.jobs.filter(r => (r.status || '').trim() === 'Pending' && !isExcluded(r) && (['S', 'A', 'B'].includes(tierOf(r)) || isBlocked(r)));
    function rank(r) {
      if (isBlocked(r)) return 2;
      const t = tierOf(r);
      if (t === 'S') return 1;
      if (t === 'A') return 3;
      if (t === 'B') return 4;
      return 5;
    }
    cand.sort((a, b) => rank(a) - rank(b));
    return cand.slice(0, 8);
  }
  function renderToday() {
    const el = document.getElementById('view-today');
    const s = computeStats();
    const queue = actionQueue();
    const funnel = {
      pending: data.jobs.filter(r => pipelineStage(r) === 'pending').length,
      submitted: data.jobs.filter(r => pipelineStage(r) === 'submitted' || pipelineStage(r) === 'assess').length,
      interview: data.jobs.filter(r => pipelineStage(r) === 'interview').length,
      offer: s.offer,
    };
    let html = `
      <div class="stat-row">
        <div class="stat-card"><div class="label">待处理</div><div class="value">${s.pendingAction}</div><div class="sub">今天最该推进的岗位</div></div>
        <div class="stat-card"><div class="label">已投递</div><div class="value">${s.submitted}</div><div class="sub">进行中的投递</div></div>
        <div class="stat-card"><div class="label">流程中</div><div class="value">${s.interview}</div><div class="sub">测评 / 面试阶段</div></div>
        <div class="stat-card"><div class="label">Offer</div><div class="value">${s.offer}</div><div class="sub">已拿到的 Offer</div></div>
      </div>
      <div class="block-title">今天先做这些</div>`;
    if (!queue.length) {
      html += '<div class="empty">今天暂时没有待处理任务 🎉</div>';
    } else {
      queue.forEach(r => {
        const blocked = isBlocked(r);
        const t = tierOf(r);
        const tierChip = blocked ? '<span class="chip chip-status-blocked">阻塞</span>' : (t ? '<span class="chip tier-' + t + '">' + t + '梯队</span>' : '');
        const nextLine = blocked
          ? '阻塞：' + esc(blockerReason(r).slice(0, 28))
          : '下一步：' + esc((r.next_action || '待投递').slice(0, 28));
        html += `
          <div class="action-card">
            <div class="ac-main">
              <div class="ac-company">${esc(r.company)} · ${esc(r.job_title)}</div>
              <div class="ac-meta">${tierChip} <span>${esc(category(r))}</span> <span>${esc(r.location || '—')}</span></div>
              <div class="ac-next">${nextLine}</div>
            </div>
            <div class="ac-actions">
              <button class="btn btn-sm" data-act="detail">查看详情</button>
              ${blocked ? '<button class="btn btn-sm" data-act="site">打开官网</button>' : '<button class="btn btn-sm btn-primary" data-act="submit">标记已投递</button>'}
            </div>
          </div>`;
      });
    }
    html += `
      <div class="section-title">未来 7 天</div>
      <div id="today-cal-week" class="cal-week"></div>
      <div class="section-title">投递进度</div>
      <div class="funnel" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <span class="chip" style="font-size:14px;padding:6px 12px;">待投递 ${funnel.pending}</span><span style="color:var(--muted)">→</span>
        <span class="chip" style="font-size:14px;padding:6px 12px;">已投/测评 ${funnel.submitted}</span><span style="color:var(--muted)">→</span>
        <span class="chip" style="font-size:14px;padding:6px 12px;">面试 ${funnel.interview}</span><span style="color:var(--muted)">→</span>
        <span class="chip" style="font-size:14px;padding:6px 12px;">Offer ${funnel.offer}</span>
      </div>`;
    el.innerHTML = html;
    el.querySelectorAll('[data-act]').forEach(btn => {
      const r = queue.find(x => x.company === btn.closest('.action-card').querySelector('.ac-company').textContent.split(' · ')[0]);
      const act = btn.dataset.act;
      btn.addEventListener('click', () => {
        if (act === 'detail') openDrawer(r);
        else if (act === 'site' && r.job_url) window.open(r.job_url, '_blank');
        else if (act === 'submit') doMarkSubmitted(r, 'Submitted');
      });
    });
    renderCalendarWeek(document.getElementById('today-cal-week'));
  }

  // ---------------- jobs (岗位池) ----------------
  const jobsFilter = { q: '', tier: '', cat: '', loc: '', status: '', convert: '' };
  function buildJobFilters(el) {
    const cats = [...new Set(data.jobs.map(category))].sort();
    const locs = [...new Set(data.jobs.map(r => (r.location || '').trim()).filter(Boolean))].sort();
    el.innerHTML = `
      <input type="text" id="jobs-q" placeholder="搜索公司 / 岗位">
      <select id="jobs-tier"><option value="">全部梯队</option><option value="S">S</option><option value="A">A</option><option value="B">B</option><option value="待解阻塞">阻塞</option></select>
      <select id="jobs-cat"><option value="">全部方向</option>${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
      <select id="jobs-loc"><option value="">全部地点</option>${locs.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
      <select id="jobs-status"><option value="">全部状态</option><option value="pending">未投递</option><option value="submitted">已投递</option><option value="process">流程中</option><option value="ended">已结束</option></select>
      <select id="jobs-convert"><option value="">全部类型</option><option value="日常实习">日常实习</option><option value="转正岗位">转正岗位</option></select>`;
    const bind = (id, key) => {
      const sel = document.getElementById(id);
      sel.value = jobsFilter[key];
      sel.addEventListener('input', () => { jobsFilter[key] = sel.value; drawJobs(); });
      sel.addEventListener('change', () => { jobsFilter[key] = sel.value; drawJobs(); });
    };
    bind('jobs-q', 'q'); bind('jobs-tier', 'tier'); bind('jobs-cat', 'cat');
    bind('jobs-loc', 'loc'); bind('jobs-status', 'status'); bind('jobs-convert', 'convert');
  }
  function jobRowHTML(r) {
    const t = tierOf(r);
    const tierCls = t ? 'tier-' + t : 'tier-X';
    const tierTxt = t || '–';
    const next = (r.status || '').trim() === 'Pending'
      ? (isBlocked(r) ? '阻塞：' + esc(blockerReason(r).slice(0, 22)) : '下一步：' + esc((r.next_action || '待投递').slice(0, 22)))
      : esc(stageLabel(r));
    return `
      <div class="job-row" data-idx="${r.__rowIndex}">
        <div class="jr-tier ${tierCls}">${tierTxt}</div>
        <div class="jr-body">
          <div class="jr-company">${esc(r.company)} · ${esc(r.job_title)}</div>
          <div class="jr-meta"><span>${esc(category(r))}</span><span>${esc(r.location || '—')}</span><span>${esc(r.convert_track || r.level || '—')}</span></div>
          <div class="jr-next">${next}</div>
        </div>
        <div class="jr-right">
          ${r.job_url ? '<button class="btn btn-sm" data-act="site">官网</button>' : ''}
          <button class="btn btn-sm" data-act="detail">详情</button>
        </div>
      </div>`;
  }
  function drawJobs() {
    const listEl = document.getElementById('jobs-list');
    let rows = data.jobs.slice();
    if (jobsFilter.q) { const q = jobsFilter.q.toLowerCase(); rows = rows.filter(r => (r.company + ' ' + r.job_title).toLowerCase().includes(q)); }
    if (jobsFilter.tier) rows = rows.filter(r => tierOf(r) === jobsFilter.tier);
    if (jobsFilter.cat) rows = rows.filter(r => category(r) === jobsFilter.cat);
    if (jobsFilter.loc) rows = rows.filter(r => (r.location || '').trim() === jobsFilter.loc);
    if (jobsFilter.convert) rows = rows.filter(r => (r.convert_track || '日常实习') === jobsFilter.convert);
    if (jobsFilter.status) {
      const map = { pending: 'pending', submitted: 'submitted', process: 'interview', ended: 'ended' };
      rows = rows.filter(r => pipelineStage(r) === map[jobsFilter.status]);
    }
    if (!rows.length) { listEl.innerHTML = '<div class="empty">没有符合当前筛选条件的岗位</div>'; return; }
    listEl.innerHTML = rows.map(jobRowHTML).join('');
    bindJobRowEvents(listEl);
  }
  function bindJobRowEvents(listEl) {
    listEl.querySelectorAll('.job-row').forEach(rowEl => {
      const idx = +rowEl.dataset.idx;
      const r = data.jobs[idx];
      rowEl.querySelector('[data-act="detail"]').addEventListener('click', e => { e.stopPropagation(); openDrawer(r); });
      const siteBtn = rowEl.querySelector('[data-act="site"]');
      if (siteBtn) siteBtn.addEventListener('click', e => { e.stopPropagation(); if (r.job_url) window.open(r.job_url, '_blank'); });
      rowEl.addEventListener('click', () => openDrawer(r));
    });
  }
  function renderJobs() {
    const el = document.getElementById('view-jobs');
    el.innerHTML = `
      <div class="view-head"><h2>岗位池</h2></div>
      <div class="filters" id="jobs-filters"></div>
      <div id="jobs-list"></div>`;
    buildJobFilters(document.getElementById('jobs-filters'));
    drawJobs();
  }

  // ---------------- pipeline ----------------
  function renderPipeline() {
    const el = document.getElementById('view-pipeline');
    const cols = [
      { key: 'pending', title: '待投递' },
      { key: 'submitted', title: '已投 · 测评' },
      { key: 'interview', title: '面试' },
      { key: 'ended', title: '已结束' },
    ];
    let html = '<div class="view-head"><h2>投递进度</h2></div><div class="kanban">';
    cols.forEach(c => {
      const rows = data.jobs.filter(r => pipelineStage(r) === c.key);
      html += `<div class="kanban-col"><h3>${c.title} · ${rows.length}</h3>`;
      if (!rows.length) html += '<div class="cal-empty">当前阶段没有岗位</div>';
      else rows.forEach(r => {
        const t = tierOf(r);
        html += `
          <div class="kb-card" data-idx="${r.__rowIndex}">
            <div class="kb-company">${esc(r.company)}</div>
            <div class="kb-title">${esc(r.job_title)}</div>
            <div class="kb-meta">${t ? '<span class="chip tier-' + t + '">' + t + '</span>' : ''}<span>${esc(stageLabel(r))}</span></div>
          </div>`;
      });
      html += '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
    el.querySelectorAll('.kb-card').forEach(card => {
      const r = data.jobs[+card.dataset.idx];
      card.addEventListener('click', () => openDrawer(r));
    });
  }

  // ---------------- calendar ----------------
  let calSelectedJob = null, calEditing = null, calView = 'week';
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayLabel(d, isToday) {
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const lbl = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + wd[d.getDay()];
    return isToday ? '今天 · ' + lbl : lbl;
  }
  function renderCalendarWeek(container) {
    container.innerHTML = '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const iso = ymd(d);
      const evs = data.followUps.filter(f => f.date === iso).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const day = document.createElement('div');
      day.className = 'cal-day' + (i === 0 ? ' is-today' : '');
      day.innerHTML = '<div class="cal-day-head">' + dayLabel(d, i === 0) + '</div>';
      if (!evs.length) day.innerHTML += '<div class="cal-empty">无安排</div>';
      else evs.forEach(ev => {
        const e = document.createElement('div');
        e.className = 'cal-event';
        e.innerHTML = '<div><span class="ce-time">' + esc(ev.time) + '</span> ' + esc(ev.company) + '</div><div>' + esc(ev.job_title) + ' · ' + esc(ev.event_type) + '</div><div class="ce-actions"><button data-act="edit">编辑</button><button data-act="del">删除</button></div>';
        e.querySelector('[data-act="edit"]').addEventListener('click', () => openCalForm(ev));
        e.querySelector('[data-act="del"]').addEventListener('click', () => delCal(ev));
        day.appendChild(e);
      });
      container.appendChild(day);
    }
  }
  function renderCalendar() {
    const el = document.getElementById('view-calendar');
    el.innerHTML = `
      <div class="view-head"><h2>日程</h2>
        <div class="seg" id="cal-seg">
          <button data-v="week" class="${calView === 'week' ? 'active' : ''}">未来 7 天</button>
          <button data-v="all" class="${calView === 'all' ? 'active' : ''}">全部</button>
        </div>
      </div>
      <div id="cal-week" class="cal-week"></div>
      <div id="cal-all" class="cal-list hidden"></div>
      <div style="margin-top:18px;"><button class="btn btn-primary" id="cal-add-btn">+ 添加日程</button></div>
      <div id="cal-form" class="cal-form hidden" style="margin-top:14px;border-top:1px dashed var(--border);padding-top:14px;display:flex;flex-direction:column;gap:10px;"></div>`;
    document.getElementById('cal-seg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { calView = b.dataset.v; renderCalendar(); }));
    renderCalendarWeek(document.getElementById('cal-week'));
    if (calView === 'all') { document.getElementById('cal-week').classList.add('hidden'); document.getElementById('cal-all').classList.remove('hidden'); renderCalAll(); }
    document.getElementById('cal-add-btn').addEventListener('click', () => openCalForm(null));
  }
  function renderCalAll() {
    const el = document.getElementById('cal-all');
    const rows = data.followUps.slice().sort((a, b) => (a.date + (a.time || '')) .localeCompare(b.date + (b.time || '')));
    if (!rows.length) { el.innerHTML = '<div class="empty">未来暂无日程</div>'; return; }
    el.innerHTML = rows.map(f => `
      <div class="cal-list-item">
        <div class="cli-date">${esc(f.date)} ${esc(f.time || '')}</div>
        <div style="flex:1"><b>${esc(f.company)}</b> · ${esc(f.job_title)}<br><span style="color:var(--muted);font-size:12px">${esc(f.event_type)}</span></div>
        <div><button class="btn btn-sm" data-act="edit">编辑</button> <button class="btn btn-sm" data-act="del">删除</button></div>
      </div>`).join('');
    el.querySelectorAll('.cal-list-item').forEach((it, i) => {
      const f = rows[i];
      it.querySelector('[data-act="edit"]').addEventListener('click', () => openCalForm(f));
      it.querySelector('[data-act="del"]').addEventListener('click', () => delCal(f));
    });
  }
  function openCalForm(existing) {
    const form = document.getElementById('cal-form');
    form.classList.remove('hidden');
    form.innerHTML = `
      <div class="form-row" style="display:flex;gap:12px;flex-wrap:wrap;">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);flex:1;min-width:160px;">日期<input type="date" id="cal-date"></label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);flex:1;min-width:160px;">时间<input type="time" id="cal-time"></label>
      </div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);">公司 / 岗位（从已投递里搜索）
        <input type="text" id="cal-company-search" placeholder="输入公司或岗位…" autocomplete="off" style="font:inherit;font-size:13px;padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);">
      </label>
      <div id="cal-company-results" class="cal-company-results hidden" style="position:relative;background:var(--surface);border:1px solid var(--border);border-radius:8px;max-height:200px;overflow-y:auto;"></div>
      <div id="cal-selected-job" class="cal-selected-job hidden" style="font-size:12px;color:var(--primary);"></div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);">事件内容
        <input type="text" id="cal-event-type" list="cal-event-suggestions" placeholder="比如：一面、测评…" style="font:inherit;font-size:13px;padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);">
      </label>
      <datalist id="cal-event-suggestions"><option value="笔试"><option value="测评"><option value="一面"><option value="二面"><option value="三面"><option value="终面"><option value="HR面"><option value="谈薪"><option value="Follow-up"><option value="其他"></datalist>
      <p id="cal-form-error" class="cal-form-error hidden" style="color:var(--danger);font-size:12px;margin:0;"></p>
      <div class="form-actions" style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" id="cal-cancel">取消</button><button class="btn btn-primary" id="cal-save">保存</button>
      </div>`;
    if (existing) {
      calEditing = existing.__rowIndex;
      document.getElementById('cal-date').value = existing.date;
      document.getElementById('cal-time').value = existing.time;
      document.getElementById('cal-event-type').value = existing.event_type;
      const job = data.jobs.find(r => r.company === existing.company && r.job_title === existing.job_title && (r.status || '').trim() === 'Submitted');
      if (job) selectCalJob(job); else { const s = document.getElementById('cal-selected-job'); s.textContent = '找不到对应已投递岗位，请重新搜索'; s.classList.remove('hidden'); }
    } else { calEditing = null; }
    const cs = document.getElementById('cal-company-search');
    cs.addEventListener('input', e => { calSelectedJob = null; document.getElementById('cal-selected-job').classList.add('hidden'); searchCal(cs.value); });
    document.getElementById('cal-cancel').addEventListener('click', () => form.classList.add('hidden'));
    document.getElementById('cal-save').addEventListener('click', saveCal);
  }
  function selectCalJob(r) {
    calSelectedJob = r;
    const cs = document.getElementById('cal-company-search'); if (cs) cs.value = r.company + ' · ' + r.job_title;
    const sel = document.getElementById('cal-selected-job');
    sel.textContent = '已选择：' + r.company + ' · ' + r.job_title; sel.classList.remove('hidden');
    document.getElementById('cal-company-results').classList.add('hidden');
  }
  function searchCal(q) {
    const res = document.getElementById('cal-company-results');
    const query = q.trim().toLowerCase();
    if (!query) { res.classList.add('hidden'); res.innerHTML = ''; return; }
    const matches = data.jobs.filter(r => (r.status || '').trim() === 'Submitted' && ((r.company + ' ' + r.job_title).toLowerCase().includes(query))).slice(0, 8);
    res.innerHTML = '';
    if (!matches.length) { res.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:var(--muted)">没有匹配的已投递岗位</div>'; res.classList.remove('hidden'); return; }
    matches.forEach(r => { const b = document.createElement('button'); b.textContent = r.company + ' · ' + r.job_title; b.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 10px;font-size:13px;background:none;border:none;color:var(--text);cursor:pointer;'; b.addEventListener('click', () => selectCalJob(r)); res.appendChild(b); });
    res.classList.remove('hidden');
  }
  async function saveCal() {
    const date = document.getElementById('cal-date').value;
    const time = document.getElementById('cal-time').value;
    const event_type = document.getElementById('cal-event-type').value.trim();
    const err = document.getElementById('cal-form-error');
    if (!date || !time || !event_type || !calSelectedJob) { err.textContent = '日期、时间、公司/岗位、事件内容都要填'; err.classList.remove('hidden'); return; }
    err.classList.add('hidden');
    toast('保存中…');
    const body = calEditing !== null
      ? { followUpRowIndex: calEditing, job_id: calSelectedJob.job_id, company: calSelectedJob.company, job_title: calSelectedJob.job_title, date, time, event_type }
      : { job_id: calSelectedJob.job_id, company: calSelectedJob.company, job_title: calSelectedJob.job_title, date, time, event_type };
    const res = await apiPost(calEditing !== null ? '/api/calendar/update' : '/api/calendar/add', body);
    if (!res.ok) { err.textContent = '保存失败：' + res.error; err.classList.remove('hidden'); return; }
    toast('日程已保存', 'ok');
    await refreshData(); renderCalendar();
  }
  async function delCal(ev) {
    if (!confirm('删除这条日程？')) return;
    toast('删除中…');
    const res = await apiPost('/api/calendar/delete', { followUpRowIndex: ev.__rowIndex, company: ev.company, job_title: ev.job_title, event_type: ev.event_type, date: ev.date, time: ev.time });
    if (!res.ok) { toast('失败：' + res.error, 'err'); return; }
    toast('已删除', 'ok');
    await refreshData(); renderCalendar();
  }

  // ---------------- blockers ----------------
  function renderBlockers() {
    const el = document.getElementById('view-blockers');
    const list = data.jobs.filter(isBlocked);
    const groups = { '需登录': [], '链接待复核·失效': [], '其他': [] };
    list.forEach(r => { groups[classifyBlocker(r)].push(r); });
    let html = '<div class="view-head"><h2>阻塞项</h2><span class="meta">' + list.length + ' 个待处理</span></div>';
    if (!list.length) { html += '<div class="empty">当前没有阻塞项 🎉</div>'; }
    else {
      ['需登录', '链接待复核·失效', '其他'].forEach(g => {
        if (!groups[g].length) return;
        html += '<div class="blk-group-title">' + g + ' · ' + groups[g].length + '</div>';
        groups[g].forEach(r => {
          html += `
            <div class="blk-card" data-job-id="${esc(r.job_id || '')}">
              <div style="min-width:0">
                <div class="jr-company">${esc(r.company)} · ${esc(r.job_title)}</div>
                <div class="blk-reason">${esc(blockerReason(r).slice(0, 60))}</div>
                <div class="blk-next">建议：${esc((r.next_action || '待处理').slice(0, 50))}</div>
              </div>
              <div class="blk-actions">
                ${r.job_url ? '<button class="btn btn-sm" data-act="site">打开官网</button>' : ''}
                <button class="btn btn-sm" data-act="detail">查看岗位</button>
                <button class="btn btn-sm btn-primary" data-act="resolve">标记已解决</button>
              </div>
            </div>`;
        });
      });
    }
    el.innerHTML = html;
    el.querySelectorAll('.blk-card').forEach((card, i) => {
      const r =
        list.find(x => x.job_id && x.job_id === card.getAttribute('data-job-id')) ||
        list.find(x => x.company + ' · ' + x.job_title === card.querySelector('.jr-company').textContent);
      card.querySelector('[data-act="detail"]').addEventListener('click', () => openDrawer(r));
      const sb = card.querySelector('[data-act="site"]'); if (sb) sb.addEventListener('click', () => { if (r.job_url) window.open(r.job_url, '_blank'); });
      card.querySelector('[data-act="resolve"]').addEventListener('click', () => doResolve(r));
    });
  }

  // ---------------- settings ----------------
  function renderSettings() {
    const el = document.getElementById('view-settings');
    const theme = localStorage.getItem('dash-theme') || '';
    const files = ['job_pool.csv', 'application_log.csv', 'follow_up.csv', 'blocker_queue.csv'];
    const lastRead = data.lastRead ? data.lastRead.toLocaleString('zh-CN', { hour12: false }) : '—';
    let html = `
      <div class="view-head"><h2>设置</h2></div>
      <div class="set-card">
        <h3>当前数据</h3>
        <div class="set-row"><span class="k">岗位总数</span><span class="v">${data.jobs.length}</span></div>
        <div class="set-row"><span class="k">阻塞项</span><span class="v">${data.jobs.filter(isBlocked).length}</span></div>
        <div class="set-row"><span class="k">最近读取</span><span class="v">${esc(lastRead)}</span></div>
      </div>
      <div class="set-card">
        <h3>数据文件（本地 CSV，唯一真源）</h3>
        ${files.map(f => `<div class="set-row"><span class="k">${f}</span><span class="v">同目录</span></div>`).join('')}
      </div>
      <div class="set-card">
        <h3>界面</h3>
        <div class="set-row"><span class="k">主题</span><span class="v">
          <span class="seg" id="theme-seg">
            <button data-t="" class="${theme === '' ? 'active' : ''}">跟随系统</button>
            <button data-t="light" class="${theme === 'light' ? 'active' : ''}">浅色</button>
            <button data-t="dark" class="${theme === 'dark' ? 'active' : ''}">深色</button>
          </span>
        </span></div>
        <div class="set-row"><span class="k">刷新</span><span class="v"><button class="btn btn-sm" id="set-refresh">重新读取本地数据</button></span></div>
      </div>
      <div class="set-card">
        <h3>云端同步</h3>
        <div class="set-row"><span class="k">状态</span><span class="v">暂未配置</span></div>
        <div class="placeholder-note">当前版本仅使用本地 CSV。云端同步（如飞书）将在后续接入，不会成为第二真源。</div>
      </div>`;
    el.innerHTML = html;
    el.querySelectorAll('#theme-seg button').forEach(b => b.addEventListener('click', () => {
      localStorage.setItem('dash-theme', b.dataset.t); applyTheme(b.dataset.t); renderSettings();
    }));
    document.getElementById('set-refresh').addEventListener('click', async () => {
      toast('读取中…'); await refreshData(); renderAll(); toast('已刷新', 'ok');
    });
  }

  // ---------------- nav / render ----------------
  let currentView = 'today';
  function showView(name) {
    currentView = name;
    ['today', 'jobs', 'pipeline', 'calendar', 'blockers', 'settings'].forEach(v => {
      document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
    });
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
    renderCurrent();
  }
  function renderCurrent() {
    if (currentView === 'today') renderToday();
    else if (currentView === 'jobs') renderJobs();
    else if (currentView === 'pipeline') renderPipeline();
    else if (currentView === 'calendar') renderCalendar();
    else if (currentView === 'blockers') renderBlockers();
    else if (currentView === 'settings') renderSettings();
    updateBadges();
  }
  function updateBadges() {
    const pending = computeStats().pendingAction;
    const blk = data.jobs.filter(isBlocked).length;
    const todayNav = document.querySelector('.nav-item[data-view="today"]');
    const blkNav = document.querySelector('.nav-item[data-view="blockers"]');
    todayNav.querySelector('.nav-badge') ? todayNav.querySelector('.nav-badge').remove() : null;
    blkNav.querySelector('.nav-badge') ? blkNav.querySelector('.nav-badge').remove() : null;
    if (pending) todayNav.insertAdjacentHTML('beforeend', '<span class="nav-badge">' + pending + '</span>');
    if (blk) blkNav.insertAdjacentHTML('beforeend', '<span class="nav-badge">' + blk + '</span>');
  }
  function renderAll() {
    document.getElementById('last-updated').textContent = '最后读取：' + (data.lastRead ? data.lastRead.toLocaleString('zh-CN', { hour12: false }) : '—');
    const sub = (data.jobs.find(r => (r.role_family || '').indexOf('AI') !== -1) && 'AI 产品经理') || '';
    // 不硬编码方向；若岗位普遍含 AI 方向则显示，否则保持"求职工作台"
    document.getElementById('brand-sub').textContent = sub || '求职工作台';
    renderCurrent();
  }

  // ---------------- boot ----------------
  document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', () => showView(n.dataset.view)));
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dash-theme', next); applyTheme(next);
  });
  document.getElementById('refresh-btn').addEventListener('click', () => location.reload());

  async function boot() {
    const cs = document.getElementById('connect-screen');
    try {
      await refreshData();
      cs.classList.add('hidden');
      renderAll();
    } catch (e) {
      cs.classList.remove('hidden');
      document.getElementById('connect-title').textContent = '读取数据失败';
      document.getElementById('connect-desc').textContent = '';
      document.getElementById('connect-warn').textContent = e.message + ' —— 请确认是通过本地服务器（node server.js）打开，而非直接双击 dashboard.html。';
    }
  }
  boot();
})();
