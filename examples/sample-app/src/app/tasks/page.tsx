import Link from 'next/link';
import { TaskList } from '@/components/TaskList';
import { listTasks } from '@/lib/tasks';

export default function TasksPage() {
  return <main><Link href="/">홈으로</Link><h1>작업 목록</h1><Link href="/tasks/sample-1">첫 작업 자세히 보기</Link><TaskList tasks={listTasks()} /></main>;
}
