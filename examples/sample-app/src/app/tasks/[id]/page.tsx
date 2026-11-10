import { TaskForm } from '@/components/TaskForm';
import { getTask } from '@/lib/tasks';

export default function TaskDetailPage() {
  return <main><h1>작업 상세</h1><TaskForm task={getTask('sample-1')} /></main>;
}
