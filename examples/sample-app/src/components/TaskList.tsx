import Link from 'next/link';
import { Button } from './Button';
import type { Task } from '@/lib/tasks';

export function TaskList({ tasks }: { tasks: Task[] }) {
  return <ul>{tasks.map(task => <li key={task.id}><Link href={`/tasks/${task.id}`}>{task.title}</Link><Button>완료</Button></li>)}</ul>;
}
