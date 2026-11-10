export type Task = { id: string; title: string; done: boolean };
const tasks: Task[] = [
  { id: 'sample-1', title: '첫 작업 지도 살펴보기', done: false },
  { id: 'sample-2', title: '작업 요청 범위 확인하기', done: true },
];
export function listTasks() { return [...tasks]; }
export function getTask(id: string) { return tasks.find(task => task.id === id); }
export function completedCount(items: Task[]) { return items.filter(task => task.done).length; }
export function saveTask(task: Task) {
  const index = tasks.findIndex(item => item.id === task.id);
  if (index >= 0) tasks[index] = task;
}
