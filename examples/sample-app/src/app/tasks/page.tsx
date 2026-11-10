import { TaskList } from '@/components/TaskList';
import { listTasks } from '@/lib/tasks';

export default function TasksPage() {
  return <main><h1>작업 목록</h1><TaskList tasks={listTasks()} /></main>;
}
