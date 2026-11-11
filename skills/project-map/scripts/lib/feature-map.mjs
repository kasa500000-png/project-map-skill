/** A product-facing projection. Source nodes remain the evidence of record. */
export function buildFeatureMap(map, config = {}) {
  const source = new Map(map.nodes.map(n => [n.id, n]));
  const dependencies = new Map();
  for (const edge of map.edges) {
    if (edge.kind === 'navigates') continue;
    if (!dependencies.has(edge.source)) dependencies.set(edge.source, []);
    dependencies.get(edge.source).push(edge.target);
  }
  const warnings = [], nodes = [], claimed = new Set();
  const closure = entries => {
    const seen = new Set(entries), queue = [...entries];
    while (queue.length && seen.size < 150) {
      for (const id of dependencies.get(queue.shift()) || []) {
        if (seen.has(id) || source.get(id)?.kind === 'screen') continue;
        seen.add(id); queue.push(id);
      }
    }
    if (queue.length) warnings.push('기능의 연결 파일이 많아 일부를 생략했습니다. 상세 코드를 확인하세요.');
    return [...seen].filter(id => source.has(id)).sort();
  };
  const add = (id, label, entries, files, description, origin) => {
    nodes.push({ id, label, kind: 'feature', entryNodeIds: entries, files,
      description, origin, confidence: 'inferred' });
  };
  for (const group of Array.isArray(config.features) ? config.features.slice(0, 100) : []) {
    if (!group || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(group.id || '') ||
        typeof group.label !== 'string' || !group.label.trim() ||
        !Array.isArray(group.entries) || !group.entries.length || group.entries.length > 30 ||
        !group.entries.every(id => source.has(id)) ||
        (group.files !== undefined && (!Array.isArray(group.files) || !group.files.every(id => source.has(id)))) ||
        nodes.some(n => n.id === `feature:custom:${group.id}`)) {
      warnings.push('유효하지 않거나 삭제된 파일을 참조하는 기능 묶음을 생략했습니다.'); continue;
    }
    const entries = [...new Set(group.entries)];
    entries.forEach(id => claimed.add(id));
    add(`feature:custom:${group.id}`, group.label.trim().slice(0, 120), entries,
      [...new Set([...closure(entries), ...(group.files || [])])].sort(),
      String(group.description || '').slice(0, 400), 'configured');
  }
  for (const node of map.nodes.filter(n => n.kind === 'screen' && !claimed.has(n.id))) {
    add(`feature:${node.id}`, node.label, [node.id], closure([node.id]),
      node.description || (node.route ? `${node.route} 화면과 연결된 구현` : '화면과 연결된 구현'), 'inferred');
  }
  // In a library/backend without routes, expose useful module entry points too.
  if (!nodes.length) for (const node of map.nodes.filter(n => n.kind !== 'config' && n.kind !== 'style').slice(0, 60)) {
    add(`feature:${node.id}`, node.label, [node.id], closure([node.id]), '화면이 없는 프로젝트의 모듈 후보', 'inferred');
  }
  const entryOwners = new Map(), membership = new Map();
  for (const feature of nodes) {
    for (const id of feature.entryNodeIds) {
      if (!entryOwners.has(id)) entryOwners.set(id, []);
      entryOwners.get(id).push(feature.id);
    }
    for (const id of feature.files) {
      if (!membership.has(id)) membership.set(id, []);
      membership.get(id).push(feature.id);
    }
  }
  for (const [id, owners] of membership) {
    if (owners.length < 2 || entryOwners.has(id)) continue;
    const node = source.get(id);
    nodes.push({ id: `shared:${id}`, label: `${node.label} · 공통`, kind: 'shared',
      entryNodeIds: [id], files: [id], confidence: 'inferred', origin: 'inferred',
      description: `${owners.length}개 기능에서 함께 사용합니다. 변경 시 이 기능들을 함께 확인하세요.` });
  }
  for (const node of nodes) {
    const custom = config.featureLabels?.[node.id];
    if (typeof custom === 'string' && custom.trim()) node.label = custom.trim().slice(0, 120);
  }
  const edges = new Map();
  const connect = (a, b, kind, reason, evidence) => {
    if (a === b) return;
    const id = JSON.stringify([a, b, kind]);
    const previous = edges.get(id);
    if (previous) { previous.evidenceCount++; return; }
    edges.set(id, { id, source: a, target: b, kind, confidence: 'inferred', reason, evidence, evidenceCount: 1 });
  };
  for (const edge of map.edges) {
    if (edge.kind === 'navigates') {
      for (const a of entryOwners.get(edge.source) || []) for (const b of entryOwners.get(edge.target) || [])
        connect(a, b, 'navigates', '이 화면에서 다음 화면으로 이동하는 코드가 있습니다.', edge.evidence);
    }
  }
  for (const node of nodes.filter(n => n.kind === 'shared')) for (const owner of membership.get(node.entryNodeIds[0]) || [])
    connect(owner, node.id, 'uses', '같은 구현을 사용합니다. 이 공통 부분의 변경은 연결된 기능의 검증이 필요합니다.', node.entryNodeIds[0]);
  for (const edge of map.edges.filter(e => e.kind !== 'navigates')) {
    for (const a of entryOwners.get(edge.source) || []) for (const b of entryOwners.get(edge.target) || [])
      connect(a, b, 'uses', '다른 기능의 진입 코드를 참조합니다. 이동 관계와는 다릅니다.', edge.evidence);
  }
  return { nodes, edges: [...edges.values()], warnings,
    coverage: '정적 코드 기반 후보입니다. 선이 없다는 이유만으로 영향이 없다고 판단하지 마세요.' };
}

export function resolveSelection(map, input) {
  if (input.featureIds === undefined) return input;
  if (!Array.isArray(input.featureIds) || !input.featureIds.length || input.featureIds.length > 30)
    throw Object.assign(new Error('기능을 1~30개 선택하세요.'), { statusCode: 400 });
  const known = new Map(map.featureGraph.nodes.map(n => [n.id, n]));
  if (input.featureIds.some(id => !known.has(id))) throw Object.assign(new Error('선택한 기능이 변경되었습니다. 지도를 새로고침하세요.'), { statusCode: 409 });
  const nodeIds = [...new Set(input.featureIds.flatMap(id => known.get(id).entryNodeIds))];
  if (nodeIds.length > 30) throw Object.assign(new Error('선택한 기능이 너무 큽니다. 작은 작업으로 나눠 주세요.'), { statusCode: 400 });
  return { ...input, nodeIds };
}

export function suggestIntent(request) {
  if (/(데이터|스키마|권한|로그인|인증|저장 형식|api|schema|auth|database)/i.test(request)) return 'contract';
  if (/(글씨|문구|색상|여백|디자인|배치|font|wording|color|spacing)/i.test(request)) return 'display';
  return 'behavior';
}
