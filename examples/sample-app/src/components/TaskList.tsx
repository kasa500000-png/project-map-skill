import { Button } from './Button';
import type { Task } from '@/lib/tasks';

export function TaskList({ tasks }: { tasks: Task[] }) {
  return <ul>{tasks.map(task => <li key={task.id}>{task.title}<Button>열기</Button></li>)}</ul>;
}
