import { Button } from './Button';
import { saveTask, type Task } from '@/lib/tasks';

export function TaskForm({ task }: { task: Task | undefined }) {
  return <form onSubmit={() => task && saveTask(task)}><input defaultValue={task?.title} /><Button>저장</Button></form>;
}
