import { TaskSummary } from '@/components/TaskSummary';
import { buildReport } from '@/lib/reports';
import { listTasks } from '@/lib/tasks';

export default function ReportsPage() {
  const tasks = listTasks();
  return <main><h1>주간 리포트</h1><p>{buildReport(tasks)}</p><TaskSummary tasks={tasks} /></main>;
}
