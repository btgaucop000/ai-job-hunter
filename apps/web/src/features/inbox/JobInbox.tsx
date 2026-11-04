import { PageHeader } from '../../components/PageHeader';
import { dueFollowUp, useLocalCalendarDate } from './follow-ups';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  SvgIcon,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  TablePagination,
  Typography,
  Link as MuiLink,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { jobUrlInfo, opportunityRequest } from './opportunities-api';
import type { Opportunity } from './opportunities-api';
const label = (value: string) => value.replaceAll('_', ' ');
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Request failed. Retry manually.';
export function JobInbox() {
  const today = useLocalCalendarDate();
  const [dueOnly, setDueOnly] = useState(false);
  const [page, setPage] = useState(0);
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
  const visibleRows = dueOnly
    ? rows.filter((row) => dueFollowUp(row.followUpDate, row.status, today))
    : rows;
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(visibleRows.length / 10) - 1),
  );
  const pageRows = visibleRows.slice(currentPage * 10, currentPage * 10 + 10);
  return (
    <Stack
      spacing={2}
      sx={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}
    >
      <PageHeader
        title="Job Inbox"
        description="Your opportunities, conversations, and next steps."
        actions={
          <Button component={Link} to="/jobs/new" variant="contained">
            Add Job
          </Button>
        }
      />
      <Paper
        component="section"
        aria-labelledby="saved-jobs-heading"
        variant="outlined"
        sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <Stack
          spacing={1}
          sx={{ p: 2, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', sm: 'center' },
            }}
          >
            <Typography id="saved-jobs-heading" component="h2" variant="h6">
              Saved Jobs{!loading && !error ? ` (${rows.length})` : ''}
            </Typography>
            <ToggleButtonGroup
              sx={{ '& .MuiToggleButton-root': { px: 1.5, minHeight: 44 } }}
              exclusive
              size="small"
              value={dueOnly ? 'due' : 'all'}
              aria-label="Saved jobs filter"
              onChange={(_, value: string | null) => {
                if (value === null) return;
                setDueOnly(value === 'due');
                setPage(0);
              }}
            >
              <ToggleButton value="all">All jobs</ToggleButton>
              <ToggleButton value="due">Due follow-ups</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Stack>
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
          <Stack direction="row" spacing={1} sx={{ p: 3 }} role="status">
            <CircularProgress size={20} aria-label="Loading opportunities" />
            <Typography variant="body2">Loading jobs…</Typography>
          </Stack>
        ) : (
          !error && (
            <TableContainer
              tabIndex={0}
              role="region"
              aria-label="Scrollable saved jobs"
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                scrollbarGutter: 'stable',
                overflowAnchor: 'none',
              }}
            >
              <Table
                size="small"
                aria-label="Saved opportunities"
                sx={{
                  tableLayout: 'fixed',
                  '& tr:last-child td': { borderBottom: 0 },
                  '& td, & th': {
                    overflowWrap: 'anywhere',
                    verticalAlign: 'top',
                    py: 1,
                    px: 2,
                  },
                }}
              >
                <TableBody>
                  {pageRows.map((row) => {
                    const urgency = dueFollowUp(
                      row.followUpDate,
                      row.status,
                      today,
                    );
                    const source =
                      row.discovery?.sourceName ??
                      [row.source, jobUrlInfo(row.originalLink).platform]
                        .filter(Boolean)
                        .join(' · ');
                    return (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: {
                                xs: 'minmax(0, 1fr) auto',
                                sm: 'minmax(0, 1fr) minmax(0, 12rem) auto',
                              },
                              columnGap: 2,
                              rowGap: 1,
                              alignItems: 'center',
                            }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <MuiLink
                                component={Link}
                                to={`/jobs/${row.id}`}
                                underline="hover"
                                color="text.primary"
                                variant="body1"
                                sx={{
                                  fontWeight: 500,
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {row.title}
                              </MuiLink>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ mt: 0.5 }}
                              >
                                {row.company || 'Unknown company'} · {source}
                              </Typography>
                            </Box>
                            <Stack
                              spacing={0.5}
                              sx={{
                                gridColumn: { xs: 1, sm: 2 },
                                alignItems: {
                                  xs: 'flex-start',
                                  sm: 'flex-end',
                                },
                              }}
                            >
                              <Chip
                                size="small"
                                variant="outlined"
                                label={label(row.status)}
                                sx={{
                                  typography: 'caption',
                                  maxWidth: '100%',
                                  height: 'auto',
                                  minHeight: 24,
                                  '& .MuiChip-label': {
                                    whiteSpace: 'normal',
                                    py: 0.5,
                                  },
                                }}
                              />
                              {row.followUpDate &&
                                (urgency ? (
                                  <MuiLink
                                    component={Link}
                                    to={`/jobs/${row.id}?tab=application`}
                                    aria-label={`${urgency}: open Application for ${row.title}`}
                                    title={row.followUpDate}
                                    color={
                                      urgency === 'Overdue'
                                        ? 'warning.dark'
                                        : 'text.primary'
                                    }
                                    underline="hover"
                                    sx={{
                                      typography: 'caption',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {urgency}
                                  </MuiLink>
                                ) : (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    aria-label={`Follow-up ${row.followUpDate}`}
                                  >
                                    {row.followUpDate}
                                  </Typography>
                                ))}
                            </Stack>
                            {row.originalLink &&
                              jobUrlInfo(row.originalLink).valid && (
                                <Tooltip title="Open original job / apply">
                                  <IconButton
                                    component="a"
                                    href={row.originalLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Original job / apply for ${row.title}`}
                                    size="small"
                                    sx={{
                                      width: 44,
                                      height: 44,
                                      color: 'text.secondary',
                                      gridColumn: { xs: 2, sm: 3 },
                                      gridRow: { xs: '1 / 3', sm: 1 },
                                    }}
                                  >
                                    <SvgIcon sx={{ fontSize: 20 }}>
                                      <path d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
                                    </SvgIcon>
                                  </IconButton>
                                </Tooltip>
                              )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!visibleRows.length && (
                    <TableRow>
                      <TableCell sx={{ py: 4 }}>
                        <Typography variant="h6">
                          {dueOnly
                            ? 'No due follow-ups'
                            : 'No saved opportunities yet'}
                        </Typography>
                        <Typography>
                          {dueOnly
                            ? 'No active jobs have a follow-up due today or earlier. Clear the filter to see all jobs.'
                            : 'Add a job from a website, recruiter conversation, or email to start tracking it.'}
                        </Typography>
                        {dueOnly ? (
                          <Button
                            onClick={() => {
                              setDueOnly(false);
                              setPage(0);
                            }}
                          >
                            Clear filter
                          </Button>
                        ) : (
                          <Stack
                            direction="row"
                            spacing={1}
                            useFlexGap
                            sx={{ flexWrap: 'wrap' }}
                          >
                            <Button
                              component={Link}
                              to="/discover"
                              variant="outlined"
                            >
                              Discover Jobs
                            </Button>
                            <Button
                              component={Link}
                              to="/jobs/new"
                              variant="outlined"
                            >
                              Add Job
                            </Button>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )
        )}
        {!loading && !error && (
          <TablePagination
            component="div"
            aria-label="Job Inbox pagination"
            count={visibleRows.length}
            page={currentPage}
            rowsPerPage={10}
            rowsPerPageOptions={[]}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            labelDisplayedRows={({ from, to, count }) =>
              `${from}–${to} of ${count} jobs`
            }
            sx={{
              flexShrink: 0,
              borderTop: 1,
              borderColor: 'divider',
              '& .MuiTablePagination-toolbar': { px: 2, flexWrap: 'wrap' },
              '& .MuiTablePagination-displayedRows': { mr: 'auto' },
              '& .MuiTablePagination-spacer': { display: 'none' },
            }}
          />
        )}
      </Paper>
    </Stack>
  );
}
