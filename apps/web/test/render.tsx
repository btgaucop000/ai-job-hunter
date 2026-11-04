import { render as renderUi, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { NotificationProvider } from '../src/components/Notifications';
export * from '@testing-library/react';
export function render(ui: ReactElement, options?: RenderOptions) {
  return renderUi(<NotificationProvider>{ui}</NotificationProvider>, options);
}
