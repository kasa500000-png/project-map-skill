import Link from 'next/link';
import { AppNavigation } from '@/components/AppNavigation';
import { TaskSummary } from '@/components/TaskSummary';
import { buildReport } from '@/lib/reports';
import { listTasks } from '@/lib/tasks';

export default function ReportsPage() {
  const tasks = listTasks();
  return <main><Link href="/">홈으로</Link><h1>주간 리포트</h1><AppNavigation /><p>{buildReport(tasks)}</p><TaskSummary tasks={tasks} /></main>;
}
