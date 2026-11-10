import { completedCount, type Task } from './tasks';

export function buildReport(tasks: Task[]) {
  return `전체 ${tasks.length}개 중 ${completedCount(tasks)}개를 완료했습니다.`;
}
