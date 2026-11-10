import { TaskSummary } from '@/components/TaskSummary';
import { listTasks } from '@/lib/tasks';

export default function HomePage() {
  return <main><h1>내 작업</h1><TaskSummary tasks={listTasks()} /></main>;
}
