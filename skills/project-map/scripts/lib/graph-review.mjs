import { buildFeatureMap } from './feature-map.mjs';

/** Keep all three snapshots. An inferred graph match is not a behavior test. */
export function reviewGraphs(task, config, assurance) {
  const project = graph => graph ? buildFeatureMap({ ...graph, files: [] }, config) : null;
  const before = task.plan?.beforeGraph || null;
  let expected = task.plan?.afterGraph ? structuredClone(task.plan.afterGraph) : null;
  if (expected) for (const node of before?.nodes || []) {
    if (node.action === 'remove' && !expected.nodes.some(n => n.id === node.id))
      expected.nodes.push({ ...node, planned: true, action: 'remove' });
  }
  if (!task.result) return { beforeGraph: project(before), expectedGraph: project(expected), actualGraph: null, comparison: null };
  const actual = structuredClone(task.result.afterGraph || { nodes: [], edges: [] });
  const nodes = new Map(actual.nodes.map(n => [n.id, n]));
  const changes = assurance?.audit?.available ? assurance.audit.changes : task.result.changes;
  const byPath = new Map(changes.map(c => [c.path, c]));
  const outcomes = new Map((task.result.outcomes || []).map(o => [o.nodeId, o.status]));
  for (const node of task.result.beforeGraph?.nodes || []) {
    if (byPath.get(node.id)?.status === 'deleted' && !nodes.has(node.id)) nodes.set(node.id, { ...node, changeStatus: 'deleted' });
  }
  for (const node of task.plan?.artifactNodes || []) {
    const change = byPath.get(node.id), isNew = task.plan.newNodes.some(n => n.id === node.id);
    // Unchanged existing artifacts exist in the reviewed snapshot, but do not invent uncreated additions.
    if (!isNew || change?.afterHash || change?.status === 'deleted') nodes.set(node.id, { ...node, planned: false, ...(change ? { changeStatus: change.status } : {}) });
  }
  for (const node of nodes.values()) {
    const change = byPath.get(node.id);
    if (change) { node.changeStatus = change.status; node.outOfScope = change.outOfScope; }
    if (outcomes.has(node.id)) node.verificationStatus = outcomes.get(node.id);
  }
  for (const [file, owner] of Object.entries(task.plan?.assetBindings || {})) if (nodes.has(file) && nodes.has(owner)) {
    actual.edges.push({ id: `artifact:${owner}:${file}`, source: owner, target: file, kind: 'uses', confidence: 'inferred', evidence: 'Declared artifact membership from reviewed plan, not runtime proof.' });
  }
  // Retain previous edges only to display removed nodes as tombstones, not live navigation.
  for (const edge of task.result.beforeGraph?.edges || []) if ((nodes.get(edge.source)?.changeStatus === 'deleted' || nodes.get(edge.target)?.changeStatus === 'deleted') && nodes.has(edge.source) && nodes.has(edge.target) && !actual.edges.some(e => e.id === edge.id))
    actual.edges.push({ ...edge, changeStatus: 'deleted' });
  actual.nodes = [...nodes.values()];
  const planned = (task.plan?.writeFiles || []).map(file => {
    const wanted = task.plan.removeNodeIds.includes(file) ? 'deleted' : task.plan.newNodes.some(n => n.id === file) ? 'added' : 'modified';
    const found = byPath.get(file)?.status || 'unchanged';
    return { file, expected: wanted, actual: found, matches: wanted === found, verification: outcomes.get(file) || 'not_run' };
  });
  return { beforeGraph: project(before), expectedGraph: project(expected), actualGraph: project(actual), comparison: {
    planned, unexpected: changes.filter(c => c.outOfScope),
    note: '파일 변화 비교입니다. 모양이나 이동선이 같아도 기능 동작은 별도 확인해야 합니다.'
  } };
}
