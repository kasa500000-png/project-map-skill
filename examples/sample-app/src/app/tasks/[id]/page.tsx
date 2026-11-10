import Link from 'next/link';
import { TaskForm } from '@/components/TaskForm';
import { getTask } from '@/lib/tasks';

export default function TaskDetailPage() {
  return <main><Link href="/tasks">작업 목록으로</Link><h1>작업 상세</h1><TaskForm task={getTask('sample-1')} /></main>;
}
