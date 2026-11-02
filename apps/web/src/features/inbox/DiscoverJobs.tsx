import { useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { opportunityRequest } from './opportunities-api';
interface Summary {
  found: number;
  imported: number;
  duplicatesSkipped: number;
  remaining: number;
  errors: string[];
  scope: string;
}
export function DiscoverJobs({ onImported }: { onImported: () => void }) {
  const [location, setLocation] = useState('Ho Chi Minh City');
  const [stacks, setStacks] = useState([
    'Java',
    'Spring Boot',
    'Node.js',
    'React',
  ]);
  const [workMode, setWorkMode] = useState('All');
  const [seniority, setSeniority] = useState('Senior');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  async function discover() {
    setBusy(true);
    setError('');
    setSummary(null);
    try {
      const result = await opportunityRequest<Summary>('/discover', {
        method: 'POST',
        body: JSON.stringify({ location, stacks, workMode, seniority }),
      });
      setSummary(result);
      if (result.imported) onImported();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Discovery failed. Retry later.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper
      component="section"
      aria-label="Discover Jobs"
      variant="outlined"
      sx={{ p: 2 }}
    >
      <Stack spacing={2}>
        <Typography variant="h6">Discover Jobs</Typography>
        <Typography variant="body2" color="text.secondary">
          Search Axon and Backbase public career feeds. Any selected stack can
          match. Location, work mode and seniority rank relevance; unknown
          values stay eligible. Discover imports new jobs directly into this
          Inbox.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            select
            fullWidth
            label="Discovery location"
            value={location}
            disabled={busy}
            onChange={(event) => setLocation(event.target.value)}
          >
            {['Ho Chi Minh City', 'Vietnam'].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Tech stack (any)"
            value={stacks}
            disabled={busy}
            slotProps={{ select: { multiple: true } }}
            onChange={(event) =>
              setStacks(
                typeof event.target.value === 'string'
                  ? event.target.value.split(',')
                  : event.target.value,
              )
            }
          >
            {['Java', 'Spring Boot', 'Node.js', 'React'].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Discovery work mode"
            value={workMode}
            disabled={busy}
            onChange={(event) => setWorkMode(event.target.value)}
          >
            {['All', 'Onsite', 'Hybrid', 'Remote'].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Discovery seniority"
            value={seniority}
            disabled={busy}
            onChange={(event) => setSeniority(event.target.value)}
          >
            {['Senior', 'Technical Lead', 'All'].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Button
          variant="outlined"
          disabled={busy || !stacks.length}
          onClick={() => void discover()}
          sx={{ alignSelf: 'flex-start' }}
        >
          Discover Jobs
        </Button>
        {busy && (
          <Stack direction="row" spacing={1} role="status">
            <CircularProgress size={20} />
            <Typography>Discovering public jobs…</Typography>
          </Stack>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {summary && (
          <Stack spacing={1}>
            <Alert severity={summary.errors.length ? 'warning' : 'success'}>
              Found {summary.found} · Imported {summary.imported} · Duplicates
              skipped {summary.duplicatesSkipped}
              {summary.remaining
                ? ` · ${summary.remaining} new jobs remain; run again to import more`
                : ''}
            </Alert>
            {summary.errors.map((message, index) => (
              <Typography key={index} variant="body2" color="text.secondary">
                {message}
              </Typography>
            ))}
            <Typography variant="caption" color="text.secondary">
              {summary.scope} Source responses may be cached for five minutes.
            </Typography>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
