/**
 * Work that must run while the session is still valid, right before signing out (e.g. removing
 * this device's push token on the server). Each task is bounded so sign-out never hangs offline.
 */
type Task = () => Promise<void>;

const tasks = new Set<Task>();

export function addSignOutTask(task: Task): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
}

export async function runSignOutTasks(timeoutMs = 3000): Promise<void> {
  await Promise.all(
    [...tasks].map(
      (t) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, timeoutMs);
          t()
            .catch(() => {})
            .finally(() => {
              clearTimeout(timer);
              resolve();
            });
        })
    )
  );
}
