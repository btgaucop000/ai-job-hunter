import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobActionLayout } from '../src/features/inbox/JobActionLayout';

test('fields fill the shell allocation and actions own a separate natural-height row', () => {
  render(
    <JobActionLayout
      active
      actions={
        <div>
          <button>Back</button>
          <button>Save</button>
        </div>
      }
    >
      <label>
        Final field
        <input />
      </label>
      <details open>
        <summary>Source evidence</summary>Verbatim synthetic quote
      </details>
    </JobActionLayout>,
  );
  const fields = screen.getByRole('region', { name: 'Scrollable job fields' });
  const actions = screen.getByRole('region', { name: 'Job save actions' });
  expect(fields.parentElement).toBe(actions.parentElement);
  expect(fields.parentElement).toHaveStyle({
    display: 'grid',
    gridTemplateRows: 'minmax(0, 1fr) auto',
    flex: '1',
    minHeight: '0',
  });
  expect(fields.parentElement!.style.height).toBe('');
  expect(fields).toHaveStyle({ overflowY: 'auto', minHeight: '0' });
  expect(fields).toContainElement(screen.getByLabelText('Final field'));
  expect(fields).not.toContainElement(
    screen.getByRole('button', { name: 'Save' }),
  );
  expect(actions.style.height).toBe('');
});

test('Import and Review retain the same scroll owner and input state', () => {
  const { rerender } = render(
    <JobActionLayout active={false} scrollable actions={null}>
      <input aria-label="Source" defaultValue="Unsaved source" />
    </JobActionLayout>,
  );
  const fields = screen.getByRole('region', { name: 'Scrollable job fields' });
  expect(
    screen.queryByRole('region', { name: 'Job save actions' }),
  ).not.toBeInTheDocument();
  rerender(
    <JobActionLayout active scrollable actions={<button>Save</button>}>
      <input aria-label="Source" defaultValue="Unsaved source" />
    </JobActionLayout>,
  );
  expect(screen.getByRole('region', { name: 'Scrollable job fields' })).toBe(
    fields,
  );
  expect(screen.getByLabelText('Source')).toHaveValue('Unsaved source');
});

test('inactive Application layout uses normal document flow', () => {
  render(
    <JobActionLayout active={false} actions={<button>Save</button>}>
      <input aria-label="Notes" defaultValue="Unsaved notes" />
    </JobActionLayout>,
  );
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Notes')).toHaveValue('Unsaved notes');
});

test('save feedback is brought into the same scroll pane without adding a scroll container', () => {
  const { rerender } = render(
    <JobActionLayout active feedbackKey="" actions={<button>Save</button>}>
      <div>Synthetic form</div>
    </JobActionLayout>,
  );
  const fields = screen.getByRole('region', { name: 'Scrollable job fields' });
  fields.scrollTop = 500;
  rerender(
    <JobActionLayout
      active
      feedbackKey="Synthetic save error"
      actions={<button>Save</button>}
    >
      <div role="alert">Synthetic save error</div>
    </JobActionLayout>,
  );
  expect(screen.getByRole('region', { name: 'Scrollable job fields' })).toBe(
    fields,
  );
  expect(fields.scrollTop).toBe(0);
  expect(fields).toContainElement(screen.getByRole('alert'));
});
