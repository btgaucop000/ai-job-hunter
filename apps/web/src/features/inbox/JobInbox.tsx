import { DiscoverJobs } from './DiscoverJobs';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { jobUrlInfo, opportunityRequest } from './opportunities-api';
import type { Opportunity } from './opportunities-api';
const label = (value: string) => value.replaceAll('_', ' ');
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Request failed. Retry manually.';
export function JobInbox() {
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    opportunityRequest<Opportunity[]>()
      .then(
        (data) => {
          if (active) {
            setRows(data);
            setError('');
          }
        },
        (error) => {
          if (active) setError(message(error));
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Job Inbox
          </Typography>
          <Typography color="text.secondary">
            Your opportunities, conversations, and next steps.
          </Typography>
        </Box>
        <Button component={Link} to="/jobs/new" variant="contained">
          Add Job
        </Button>
      </Stack>
      <Alert severity="info">
        Local single-user workspace. Saved opportunities stay in PostgreSQL.
        Authentication and multi-user access are not available.
      </Alert>
      <DiscoverJobs
        onImported={() => {
          setLoading(true);
          setAttempt((value) => value + 1);
        }}
      />
      {error && (
        <Alert
          severity="error"
          action={
            <Button
              onClick={() => {
                setLoading(true);
                setAttempt((value) => value + 1);
              }}
            >
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {loading ? (
        <CircularProgress aria-label="Loading opportunities" />
      ) : (
        !error &&
        (rows.length ? (
          <TableContainer component={Paper}>
            <Table aria-label="Saved opportunities">
              <TableHead>
                <TableRow>
                  {[
                    'Job title',
                    'Company',
                    'Source',
                    'Status',
                    'Follow-up date',
                  ].map((text) => (
                    <TableCell key={text}>{text}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link to={`/jobs/${row.id}`}>{row.title}</Link>
                      {Boolean(row.discovery?.techStack?.length) && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          {row.discovery?.techStack?.join(' · ')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{row.company || 'Unknown company'}</TableCell>
                    <TableCell>
                      {row.discovery?.sourceName ??
                        [row.source, jobUrlInfo(row.originalLink).platform]
                          .filter(Boolean)
                          .join(' · ')}
                      {row.discovery && (
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          Discovered{' '}
                          {new Date(
                            row.discovery.discoveredAt,
                          ).toLocaleDateString()}
                        </Typography>
                      )}
                      {row.discovery && row.originalLink && (
                        <Box
                          component="a"
                          href={row.originalLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ display: 'block', fontSize: '0.8rem' }}
                        >
                          Original job / apply
                        </Box>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={label(row.status)} />
                    </TableCell>
                    <TableCell>{row.followUpDate ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Paper variant="outlined" sx={{ p: 4 }}>
            <Typography variant="h6">No saved opportunities yet</Typography>
            <Typography>
              Add a job from a website, recruiter conversation, or email to
              start tracking it.
            </Typography>
          </Paper>
        ))
      )}
    </Stack>
  );
}
