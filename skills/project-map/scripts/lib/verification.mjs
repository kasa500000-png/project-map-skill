/** Reports are not execution proof. Receipts are scoped to revision + content. */
import { inventory } from './inventory.mjs';
import { loadAssurance } from './assurance.mjs';
import { problem } from './state-store.mjs';
const key = e => `${e.nodeId || ''}\0${String(e.checkId || e.name || '').trim()}`;

export async function reconcileChecks(root, task, reports = [], options = {}) {
  if (!Array.isArray(reports) || reports.length > 50) throw problem('검증 결과는 50개 이하의 배열이어야 합니다.');
  const effectIds = new Set(task.plan?.effects.map(e => e.nodeId) || []);
  for (const report of reports) {
    if (!report || typeof report.name !== 'string' || !report.name.trim() || !['passed', 'failed', 'not_run'].includes(report.status) || (report.nodeId !== undefined && !effectIds.has(report.nodeId)))
      throw problem('유효한 검사 이름·상태·계획의 기능 ID가 필요합니다.');
  }
  const meta = await loadAssurance(root, task.id, options), current = await inventory(root, options);
  const latest = new Map();
  for (const record of meta.evidence || []) {
    if (record.kind !== 'check' || record.revision !== task.plan?.revision) continue;
    if (record.nodeId && !effectIds.has(record.nodeId)) continue;
    latest.set(key(record), record);
  }
  const effective = new Map();
  for (const report of reports) {
    effective.set(key(report), {
      name: report.name, ...(report.nodeId ? { nodeId: report.nodeId } : {}), source: 'agent',
      status: report.status === 'failed' ? 'failed' : 'not_run',
      detail: report.status === 'passed' ? `AI 통과 보고 · 실행 증거 미연결. ${report.detail || ''}` : report.detail || '실행 증거 미연결'
    });
  }
  for (const [id, record] of latest) {
    const valid = current.complete && record.fingerprint === current.fingerprint && record.stable !== false;
    const status = valid ? (record.exitCode === 0 && record.status === 'passed' ? 'passed' : 'failed') : 'not_run';
    effective.set(id, { name: record.name, ...(record.nodeId ? { nodeId: record.nodeId } : {}), source: 'tool', evidenceId: record.id,
      status, detail: valid ? `실제 종료 코드 ${record.exitCode ?? '없음'} · ${record.id}` : '이전 코드 또는 불완전한 분석 기준의 증거입니다. 다시 검사하세요.' });
  }
  if (effective.size > 50) throw problem('검증 기록이 50개를 넘었습니다. 작업을 나누거나 검사 이름을 일관되게 사용하세요.');
  return { checks: [...effective.values()], reports, fingerprint: current.fingerprint, inventoryComplete: current.complete };
}
