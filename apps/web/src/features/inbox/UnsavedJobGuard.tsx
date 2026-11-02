import { useContext, useRef, type RefObject } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import {
  UNSAFE_DataRouterContext,
  useBeforeUnload,
  useBlocker,
} from 'react-router-dom';

export function UnsavedJobGuard({
  dirty,
  savedNavigation,
}: {
  dirty: boolean;
  savedNavigation: RefObject<boolean>;
}) {
  useBeforeUnload((event) => {
    if (dirty && !savedNavigation.current) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  // Production uses a data router; embedded previews may use MemoryRouter.
  const router = useContext(UNSAFE_DataRouterContext);
  return router ? (
    <RouteGuard dirty={dirty} savedNavigation={savedNavigation} />
  ) : null;
}
function RouteGuard({
  dirty,
  savedNavigation,
}: {
  dirty: boolean;
  savedNavigation: RefObject<boolean>;
}) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const blocker = useBlocker(
    () => dirtyRef.current && !savedNavigation.current,
  );
  return (
    <Dialog
      open={blocker.state === 'blocked'}
      aria-labelledby="unsaved-job-title"
    >
      <DialogTitle id="unsaved-job-title">Leave unsaved changes?</DialogTitle>
      <DialogContent>
        <Alert severity="warning">
          Your job changes have not been saved. Stay to review and save them, or
          discard them and leave.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => blocker.state === 'blocked' && blocker.reset()}>
          Stay and edit
        </Button>
        <Button
          color="warning"
          onClick={() => blocker.state === 'blocked' && blocker.proceed()}
        >
          Discard and leave
        </Button>
      </DialogActions>
    </Dialog>
  );
}
