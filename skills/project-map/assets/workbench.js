'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const node = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const statusNames = { cancelled:'취소됨 · 파일은 유지', queued: 'Codex에 계획 요청 필요', awaiting_review: '사용자 계획 검토 대기', approved: '승인됨 · Codex 실행 필요', running: '작업 중', blocked: '중단 · 확인 필요', finalizing: '결과 정리 중', finalization_failed: '결과 정리 실패 · 재시도 필요', completed: '수정 완료 · 검증은 별도 확인', passed: '통과', failed: '실패', not_run: '미확인' };
  let map, token, selected, impact, task, tasks = [], zoom = 1, parentTaskId, nextOffset=null, activityVersion='';
  const notice = text => { $('#notice').textContent = text; $('#notice').hidden = !text; };
  const fail = error => { $('#error').textContent = error.message; $('#error').hidden = false; };
  async function api(url, data) {
    const response = await fetch(url, { cache: 'no-store', ...(data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Project-Map-Token': token }, body: JSON.stringify(data) }) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.message || '요청을 처리하지 못했습니다.');
    $('#error').hidden = true; return value;
  }
  const action = fn => async event => { event?.preventDefault(); try { await fn(event); } catch (error) { fail(error); } };
  function button(text, fn, cls = '') { const b = node('button', text, cls); b.type = 'button'; b.addEventListener('click', action(fn)); return b; }
  function badge(status) { const b = node('span', statusNames[status] || status, 'badge'); b.dataset.status = status; return b; }
  function graph(host, data, select, effect = {}) {
    host.replaceChildren(); if (!data?.nodes?.length) { host.append(node('p', '표시할 기능이 없습니다. 파일 지도를 확인하거나 기능 묶음을 지정하세요.', 'empty')); return; }
    const all = data.nodes.slice(0, 90), positions = new Map(), screens = all.filter(n => n.kind !== 'shared'), shared = all.filter(n => n.kind === 'shared');
    screens.forEach((n, i) => positions.set(n.id, { x: 26 + (i % 3) * 226, y: 30 + Math.floor(i / 3) * 125 }));
    shared.forEach((n, i) => positions.set(n.id, { x: 26 + (i % 3) * 226, y: 30 + Math.ceil(screens.length / 3) * 125 + Math.floor(i / 3) * 125 }));
    const height = Math.max(280, 35 + Math.ceil(screens.length / 3) * 125 + Math.ceil(shared.length / 3) * 125);
    const canvas = node('div', undefined, 'canvas'); canvas.style.width = '705px'; canvas.style.height = height + 'px';
    if (host.id === 'graph') canvas.style.zoom = zoom;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', '705'); svg.setAttribute('height', height);
    const defs = document.createElementNS(svg.namespaceURI, 'defs'), marker = document.createElementNS(svg.namespaceURI, 'marker');
    const markerId = 'arrow-' + Math.random().toString(36).slice(2); marker.setAttribute('id', markerId); marker.setAttribute('viewBox', '0 0 10 10'); marker.setAttribute('refX', '9'); marker.setAttribute('refY', '5'); marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6'); marker.setAttribute('orient', 'auto');
    const arrow = document.createElementNS(svg.namespaceURI, 'path'); arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); arrow.setAttribute('fill', '#8ea79a'); marker.append(arrow); defs.append(marker); svg.append(defs);
    for (const edge of data.edges || []) {
      const a = positions.get(edge.source), b = positions.get(edge.target); if (!a || !b) continue;
      const line = document.createElementNS(svg.namespaceURI, 'path'); const right = b.x > a.x;
      const x1 = a.x + (right ? 174 : 0), x2 = b.x + (right ? 0 : 174), y1 = a.y + 37, y2 = b.y + 37;
      line.setAttribute('d', `M${x1} ${y1} C${x1 + (right ? 28 : -28)} ${y1},${x2 + (right ? -28 : 28)} ${y2},${x2} ${y2}`);
      line.setAttribute('fill', 'none'); line.setAttribute('stroke', edge.changeStatus==='deleted'||edge.action==='remove'?'#bd6258':edge.planned?'#2c9264':'#8ea79a'); line.setAttribute('stroke-width', edge.source === selected?.id || edge.target === selected?.id ? '2' : '1'); line.setAttribute('marker-end', `url(#${markerId})`);
      if (edge.kind !== 'navigates') line.setAttribute('stroke-dasharray', '4 4'); svg.append(line);
    }
    canvas.append(svg);
    for (const item of all) {
      const p = positions.get(item.id), b = button('', () => select?.(item), 'node'); b.dataset.id = item.id; b.dataset.kind = item.kind; b.dataset.effect = effect[item.id] || (item.removed?'deleted':item.changeStatus|| (item.planned?'planned':'')); b.dataset.unexpected=String(!!item.outOfScope); b.setAttribute('aria-pressed', String(Boolean(select) && item.id === selected?.id)); b.style.left = p.x + 'px'; b.style.top = p.y + 'px';
      b.append(node('strong', item.label), node('small', item.kind === 'shared' ? '여러 기능의 공통 부분' : `${item.files?.length || 1}개 코드 · ${item.origin === 'configured' ? '지정한 기능' : '자동 구성'}`));
      const flags=[];
      if(item.removed)flags.push('삭제');else if(item.changeStatus)flags.push(({added:'추가됨',modified:'수정됨',deleted:'삭제됨',unknown:'변경 확인 필요'})[item.changeStatus]||'변경');else if(item.planned)flags.push('수정 예정');
      if(item.outOfScope)flags.push('예상 밖');
      if(item.verificationStatus)flags.push(item.verificationStatus==='passed'?'도구 검사 통과':item.verificationStatus==='failed'?'검사 실패':'동작 미확인');
      if(flags.length)b.append(node('span',flags.join(' · '),'change-flag'));
      b.title = item.description || item.label; if (!select) {b.setAttribute('aria-disabled','true');b.tabIndex=-1;} canvas.append(b);
    }
    host.append(canvas);
    if (data.nodes.length > 90) host.append(node('p', '처음 90개만 표시했습니다. 기능 검색 또는 프로젝트 범위를 좁혀 확인하세요.', 'empty'));
  }
  function renderMap() {
    const query = $('#search').value.toLowerCase(); const filtered = map.featureGraph.nodes.filter(n => n.label.toLowerCase().includes(query));
    $('#features').replaceChildren(); for (const f of filtered) { const b = button(f.label, () => choose(f)); b.setAttribute('aria-pressed', String(selected?.id === f.id)); $('#features').append(b); }
    const effects = {};
    for (const f of map.featureGraph.nodes) if (impact) {
      if (f.files.some(p => impact.verifyFiles.includes(p))) effects[f.id] = 'verify';
      if (f.entryNodeIds.some(p => impact.writeFiles.includes(p))) effects[f.id] = 'write';
    }
    graph($('#graph'), { ...map.featureGraph, nodes: filtered }, choose, effects);
  }
  function choose(feature) {
    selected = feature; impact = null; $('#impact').hidden = true; $('#save').hidden = true; $('#preview').disabled = false; $('#rename').disabled = false;
    $('#selected-title').textContent = feature.label; $('#selected-description').textContent = feature.description;
    $('#files').replaceChildren(...feature.files.map(f => node('li', f)));
    $('#connections').replaceChildren();
    for (const edge of map.featureGraph.edges.filter(e => e.source === feature.id || e.target === feature.id)) {
      const peer = map.featureGraph.nodes.find(n => n.id === (edge.source === feature.id ? edge.target : edge.source));
      const card = node('div', undefined, 'connection-item'); card.append(node('strong', `${edge.kind === 'navigates' ? '화면 이동' : '공통 구현'} · ${peer?.label || ''}`), node('p', edge.reason)); $('#connections').append(card);
    }
    if (!$('#connections').children.length) $('#connections').append(node('p', '확인된 연결이 없습니다. 영향 없음이 아니라 추가 확인 대상입니다.', 'footnote'));
    renderMap();
  }
  function renderProject() {
    $('#project').textContent = map.project.name;
    $('#meta').textContent = `${map.featureGraph.nodes.filter(n => n.kind === 'feature').length}개 기능 · ${map.nodes.length}개 파일 · ${map.project.git.branch || 'Git 정보 없음'} · ${new Date(map.generatedAt).toLocaleTimeString('ko-KR')} 분석`;
    $('#warnings').replaceChildren(...[...map.warnings, ...map.featureGraph.warnings].map(w => node('li', w)));
    const previous = map.featureGraph.nodes.find(n => n.id === selected?.id); if (previous) choose(previous); else if (map.featureGraph.nodes[0]) choose(map.featureGraph.nodes[0]); else renderMap();
  }
  function promptFor(t) {
    const direction = t.status === 'finalization_failed' ? '결과 정리 실패 원인을 확인하고 기존 요청 결과를 보존해 complete를 재시도해줘. 코드를 임의로 다시 수정하지 마.' : t.status === 'approved' ? '내가 승인한 현재 계획을 확인하고 작업을 진행해줘.' : t.status === 'completed' ? '완료된 작업의 실제 변경과 미확인 검증을 설명해줘.' : '최신 코드와 요청을 읽고 시각적인 변경 계획만 작성해줘. 내가 지도에서 승인하기 전에는 코드를 수정하지 마.';
    return `$project-map\n프로젝트: ${map.project.root}\n요청 ID: ${t.id}\n${direction}`;
  }
  function renderTasks() {
    $('#tasks').replaceChildren();
    for (const t of tasks) { const b = button(t.request.slice(0, 65), () => openTask(t.id)); b.setAttribute('aria-pressed', String(task?.id === t.id)); b.append(node('small', statusNames[t.status] || t.status)); $('#tasks').append(b); }
    if (!tasks.length) $('#tasks').append(node('p', '저장한 요청이 아직 없습니다.', 'muted'));
  }
  async function openTask(id, scroll = true) { task = await api('/api/tasks/' + encodeURIComponent(id)); renderTask(); renderTasks(); if (scroll) $('#task-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
  function mini(title, data) { const frame = node('section', undefined, 'mini-map'), view = node('div', undefined, 'graph-scroll'); frame.append(node('h3', title), node('p','가로·세로로 이동해 연결된 기능을 확인하세요.','footnote map-scroll-hint'), view); graph(view, data); return frame; }
  function renderTask() {
    if (!task) return; const t = task;
    $('#task-section').hidden = false; $('#task-title').textContent = t.request; $('#task-status').replaceChildren(badge(t.status));
    const body = node('div', undefined, 'task-body');
    body.append(node('p', `요청 ID ${t.id}`, 'muted'));
    if (t.plan) {
      body.append(node('p', t.plan.summary, 'info'));
      const compare = node('div', undefined, 'task-grid'); compare.append(mini('변경 전 · 계획 작성 시점', t.experience.beforeGraph), mini(t.approval?'승인한 예상 구조':'승인 전 예상 구조', t.experience.expectedGraph)); if(t.result)compare.append(mini('작업 후 실제 결과 · 검증 상태 별도',t.experience.actualGraph)); body.append(compare);
      for (const effect of t.result?.outcomes || t.plan.effects) {
        const card = node('article', undefined, 'effect'); card.append(badge(effect.status || 'not_run'), node('h3', t.experience.featureLabels[effect.nodeId] || effect.nodeId), node('p', '변경: ' + effect.change), node('p', '기대 결과: ' + effect.expected), node('p', '확인 방법: ' + effect.verify)); body.append(card);
      }
      const files = node('details'); files.append(node('summary', '개발 상세 · 수정 예정 파일'), node('pre', t.plan.writeFiles.join('\n') || '코드 수정 없음', 'prompt')); body.append(files);
    } else body.append(node('p', '요청은 저장됐지만 아직 실행되지 않았습니다. 아래 요청문을 Codex에 전달하면 예상 변경 계획을 작성합니다.', 'info'));
    if (t.status === 'awaiting_review') {
      const feedback = node('textarea'); feedback.placeholder = '계획이 의도와 다르면 수정할 내용을 적어 주세요.'; feedback.setAttribute('aria-label', '계획 수정 의견');
      const actions = node('div', undefined, 'actions');
      const review = async decision => { task = await api(`/api/tasks/${t.id}/review`, { decision, revision: t.plan.revision, snapshotId: t.plan.snapshotId, note: feedback.value }); renderTask(); await reloadTasks(); notice(decision === 'approve' ? '계획을 승인했습니다. 현재 연결 방식에서는 Codex에 실행 요청을 전달해야 합니다.' : '수정 의견을 저장했습니다. Codex에 계획 재작성을 요청하세요.'); };
      actions.append(button('이 계획으로 진행', () => review('approve'), 'primary'), button('계획 수정 요청', () => review('revise'))); body.append(feedback, actions);
    }
    if (t.status==='finalization_failed') {
      body.append(node('p',t.finalization?.message||'마무리 기록에 실패했습니다. 원인을 해결한 뒤 다시 시도하세요.','info caution'),button('결과 정리 다시 시도',async()=>{await api(`/api/tasks/${t.id}/retry-finalization`,{});await openTask(t.id,false);notice('결과 기록을 다시 확인했습니다.');}));
    }
    if (t.result) {
      body.append(node('p', '파일이 바뀌었다는 사실과 기능이 검증됐다는 사실은 다릅니다. 미확인 항목을 확인한 뒤 배포하세요.', 'info caution'));
      const d = node('details'); d.append(node('summary', `실제 소스 변경 ${t.result.changes.length}개 · 범위 밖 ${t.result.outOfScopeFiles.length}개`), node('pre', t.result.changes.map(c => `${c.status} ${c.path}${c.outOfScope ? ' [범위 밖]' : ''}`).join('\n') || '변경 없음', 'prompt')); body.append(d);
      for (const check of t.result.checks) { const row = node('p', undefined, 'effect'); row.append(badge(check.status), node('strong', `${check.name} · ${check.source==='tool'?'실행 증거':'AI 보고'}`), node('p', check.detail || '추가 기록 없음')); body.append(row); }
      body.append(button('이 결과에서 다음 요청 시작', () => { parentTaskId = t.id; const f = map.featureGraph.nodes.find(f => f.entryNodeIds.some(id => t.nodeIds.includes(id))); if (f) choose(f); $('#request').value = ''; $('#request').focus(); notice('이전 작업과 연결된 새 요청을 작성하세요.'); }));
    }
    if(t.experience.comparison){
      const cmp=t.experience.comparison,table=node('table'),head=node('tr');['파일','승인한 예상','실제 변화','확인 상태'].forEach(x=>head.append(node('th',x)));table.append(head);
      const names={added:'추가',modified:'수정',deleted:'삭제',unchanged:'변화 없음',unknown:'추가 확인'};
      for(const item of cmp.planned){const row=node('tr');row.append(node('td',item.file),node('td',names[item.expected]),node('td',names[item.actual]||item.actual),node('td',statusNames[item.verification]));if(!item.matches)row.className='comparison-mismatch';table.append(row);}
      const wrap=node('div',undefined,'table-wrap');wrap.append(table);body.append(node('h3','승인한 예상과 실제 결과'),node('p',cmp.note,'footnote'),wrap);
      if(cmp.unexpected.length)body.append(node('p',`예상 밖 변경 ${cmp.unexpected.length}개: ${cmp.unexpected.map(c=>c.path).join(', ')}`,'info caution'));
    }
    const management=node('div',undefined,'actions');
    if(['queued','awaiting_review','approved','blocked'].includes(t.status)&&!t.experience?.safety?.uncertainExecution)management.append(button('이 요청 취소',async()=>{if(!confirm('요청을 취소합니다. 이미 수정된 앱 파일은 되돌리지 않습니다. 계속하시겠습니까?'))return;await api(`/api/tasks/${t.id}/manage`,{action:'cancel'});await openTask(t.id,false);await reloadTasks();}));
    if(['completed','cancelled'].includes(t.status))management.append(button(t.archivedAt?'보관함에서 꺼내기':'작업 기록 보관',async()=>{await api(`/api/tasks/${t.id}/manage`,{action:t.archivedAt?'unarchive':'archive'});await openTask(t.id,false);await reloadTasks();}));
    body.append(management);
    const prompt = node('pre', promptFor(t), 'prompt');
    body.append(button('Codex 요청문 복사', async () => { try { await navigator.clipboard.writeText(prompt.textContent); notice('복사했습니다. 현재 프로젝트의 Codex 대화에 붙여 넣으세요.'); } catch { notice('자동 복사가 안 되면 아래 요청문을 직접 선택해 복사하세요.'); } }), prompt);
    $('#task-content').replaceChildren(body);
    window.dispatchEvent(new CustomEvent('project-map:task', { detail: { task: t, body, api, button, node, notice, reload: () => openTask(t.id, false) } }));
  }
  async function reloadTasks(append=false) {
    const result=await api(`/api/tasks?brief=1&limit=30&offset=${append?nextOffset||0:0}&archived=${$('#show-archived').checked?'1':'0'}`);
    tasks=append?Array.from(new Map([...tasks,...result.tasks].map(t=>[t.id,t])).values()):result.tasks;nextOffset=result.nextOffset;$('#more-tasks').hidden=nextOffset===null||nextOffset===undefined;renderTasks();
  }
  $('#refresh').addEventListener('click', action(async () => { map = await api('/api/refresh', {}); renderProject(); await reloadTasks();if(task)await openTask(task.id,false); notice('최신 코드로 갱신했습니다. 기존 요청의 기준 시점은 유지됩니다.'); }));
  $('#show-archived').addEventListener('change',action(()=>reloadTasks()));
  $('#more-tasks').addEventListener('click',action(()=>reloadTasks(true)));
  $('#storage-usage').addEventListener('click',action(async()=>{const data=await api('/api/storage');notice(`로컬 기록 ${(data.bytes/1048576).toFixed(1)} MB · ${data.files}개 파일 · 백업 ${(data.checkpointBytes/1048576).toFixed(1)} MB${data.truncated?' · 일부만 집계됨':''}. 기록이나 백업을 자동 삭제하지 않습니다.`);}));
  $('#search').addEventListener('input', () => map && renderMap());
  $('#zoom-in').addEventListener('click', () => { zoom = Math.min(1.5, zoom + .15); renderMap(); }); $('#zoom-out').addEventListener('click', () => { zoom = Math.max(.5, zoom - .15); renderMap(); });
  $('#request').addEventListener('input', () => { impact = null; $('#impact').hidden = true; $('#save').hidden = true; }); $('#intent').addEventListener('change', () => { impact = null; $('#save').hidden = true; $('#impact').hidden = true; });
  $('#rename').addEventListener('click', action(async () => { const label = prompt('다음에도 사용할 기능 이름', selected.label); if (!label?.trim()) return; map = await api('/api/features/rename', { id: selected.id, label, snapshotId: map.snapshotId }); renderProject(); notice('이름을 프로젝트 설정에 저장했습니다. 프로젝트를 다시 열어도 유지됩니다.'); }));
  $('#request-form').addEventListener('submit', action(async () => {
    if (!selected || !$('#request').value.trim()) throw new Error('기능을 선택하고 원하는 변경을 적어 주세요.');
    impact = await api('/api/impact', { featureIds: [selected.id], intent: $('#intent').value, request: $('#request').value.trim() });
    $('#impact').replaceChildren(node('h3', '초기 탐색 범위 · 확정 계획 아님'));
    for (const [label, key] of [['수정 후보', 'writeFiles'], ['참고할 코드', 'readFiles'], ['함께 확인', 'verifyFiles']]) { const row = node('div', undefined, 'scope'); row.append(node('span', label), node('strong', `${impact[key].length}개`)); $('#impact').append(row); }
    $('#impact').append(node('p', impact.intentNote, 'footnote')); $('#impact').hidden = false; $('#save').hidden = false; renderMap();
  }));
  $('#save').addEventListener('click', action(async () => { if (!impact) return; $('#save').disabled = true; try {
    const t = await api('/api/tasks', { featureIds: [selected.id], intent: impact.intent, request: $('#request').value.trim(), snapshotId: impact.snapshotId, ...(parentTaskId ? { parentTaskId } : {}) }); parentTaskId = undefined; await reloadTasks(); await openTask(t.id); notice('요청을 저장했습니다. Codex에 계획 작성을 요청하세요.'); $('#save').hidden = true;
  } finally { $('#save').disabled = false; } }));
  action(async () => { token = (await api('/api/session')).token; map = await api('/api/map'); renderProject(); await reloadTasks(); })();
  setInterval(() => {
    if(document.visibilityState!=='visible'||!map||['TEXTAREA','INPUT','SELECT'].includes(document.activeElement?.tagName))return;
    action(async()=>{const state=await api('/api/activity');if(state.version===activityVersion)return;activityVersion=state.version;await reloadTasks();if(task)await openTask(task.id,false);})();
  },5000);
})();
