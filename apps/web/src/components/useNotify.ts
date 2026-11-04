import { createContext, useContext } from 'react';

export type Notification = {
  severity: 'success' | 'error' | 'warning' | 'info';
  text: string;
};
export const Notifications = createContext<
  ((message: Notification) => void) | null
>(null);
export function useNotify() {
  const notify = useContext(Notifications);
  if (!notify) throw new Error('NotificationProvider is required');
  return notify;
}
