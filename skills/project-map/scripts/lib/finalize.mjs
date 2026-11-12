/** Prepare audit, checkpoint and candidate first; publish completion last. */
import * as core from './analyzer.mjs';
import { reconcileChecks } from './verification.mjs';
import { finishAudit } from './assurance.mjs';
import { inventory } from './inventory.mjs';
import { sealCheckpoint } from './safety.mjs';
import { readState, writeState, problem, taskId } from './state-store.mjs';
import { releaseExecution, claimExecution } from './task-lock.mjs';

export async function finalize(root, id, input = {}, options = {}) {
  taskId(id);
  let task = await core.getTask(root, id, options);
  if (task.status === 'completed') { await releaseExecution(root, id, options); return task; }
  if (!['running', 'finalizing', 'finalization_failed'].includes(task.status)) throw problem('실행 중이거나 결과 정리를 재시도하는 작업만 완료할 수 있습니다.', 'REVIEW_REQUIRED', 409);
  const journalPath = `finalization/${id}.json`, previous = await readState(root, journalPath, options);
  // Persist the original completion request. An empty retry does not discard it.
  const request = Object.keys(input).length ? input : previous?.request || {};
  if (request.summary !== undefined && (typeof request.summary !== 'string' || request.summary.length > 6000)) throw problem('Invalid summary.');
  await claimExecution(root, id, options);
  try {
    const verified = await reconcileChecks(root, task, request.checks, options);
    await writeState(root, journalPath, { status: 'preparing', request, fingerprint: verified.fingerprint, at: new Date().toISOString() }, options);
    task = await core.markFinalization(root, id, 'finalizing', '', options);
    const candidate = await core.completeTask(root, id, { ...request, checks: verified.checks }, { ...options, prepareOnly: true });
    await finishAudit(root, candidate, options);
    await sealCheckpoint(root, candidate, options);
    const after = await inventory(root, options);
    if (after.fingerprint !== verified.fingerprint) throw problem('결과 정리 중 파일이 바뀌었습니다. 변경 내용을 확인하고 다시 시도하세요.', 'FINALIZATION_CHANGED', 409);
    await writeState(root, journalPath, { status: 'ready', request, fingerprint: after.fingerprint, reportedChecks: verified.reports, candidate, at: new Date().toISOString() }, options);
    const completed = await core.publishCompletion(root, id, candidate, options);
    // If cleanup fails after publication, an idempotent retry releases the lease.
    await releaseExecution(root, id, options);
    return completed;
  } catch (error) {
    const current = await core.getTask(root, id, options);
    if (current.status !== 'completed' && ['running', 'finalizing', 'finalization_failed'].includes(current.status))
      await core.markFinalization(root, id, 'finalization_failed', error.message, options);
    throw error;
  }
}
