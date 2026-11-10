import Link from 'next/link';
import { AppNavigation } from '@/components/AppNavigation';
import { TaskSummary } from '@/components/TaskSummary';
import { listTasks } from '@/lib/tasks';

export default function HomePage() {
  return <main><h1>내 작업</h1><AppNavigation /><TaskSummary tasks={listTasks()} /><Link href="/reports">주간 리포트 보기</Link></main>;
}
