import { completedCount, type Task } from '@/lib/tasks';

export function TaskSummary({ tasks }: { tasks: Task[] }) {
  return <section><h2>진행 현황</h2><p>{completedCount(tasks)} / {tasks.length}</p></section>;
}
