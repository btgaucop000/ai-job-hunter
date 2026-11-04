import { PageHeader } from '../components/PageHeader';
import { DiscoverJobsPage } from '../features/inbox/DiscoverJobsPage';
import { JobInbox } from '../features/inbox/JobInbox';
import { JobEditor } from '../features/inbox/JobEditor';
import { lazy, Suspense, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useMatch,
} from 'react-router-dom';
import { Dashboard } from '../features/dashboard/Dashboard';
import { ApiReadiness } from '../features/health/ApiReadiness';

const UiAcceptancePreview = import.meta.env.DEV
  ? lazy(() => import('../features/dashboard/UiAcceptancePreview'))
  : null;

const navigation = [
  { label: 'Job Inbox', path: '/dashboard' },
  { label: 'Discover Jobs', path: '/discover' },
  { label: 'CV & Review', path: '/cv' },
  { label: 'Candidates', path: '/candidates' },
  { label: 'Jobs', path: '/jobs' },
  { label: 'Matches', path: '/matches' },
  { label: 'Settings', path: '/settings' },
];
function ComingSoon({ title }: { title: string }) {
  return (
    <Stack spacing={2}>
      <PageHeader title={title} />
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Coming soon
        </Typography>
        <Typography color="text.secondary">
          This part of your workspace is not available yet.
        </Typography>
      </Paper>
    </Stack>
  );
}
export function App() {
  const dashboardMatch = useMatch('/dashboard');
  const jobsMatch = useMatch('/jobs');
  const inbox = Boolean(dashboardMatch || jobsMatch);
  const discoveryPage = Boolean(useMatch('/discover'));
  const [discoveryViewport, setDiscoveryViewport] = useState(false);
  const newJob = Boolean(useMatch('/jobs/new'));
  const jobDetails = Boolean(useMatch('/jobs/:id'));
  const [editorViewport, setEditorViewport] = useState(false);
  const bounded =
    inbox ||
    newJob ||
    (jobDetails && editorViewport) ||
    (discoveryPage && discoveryViewport);
  return (
    <Box
      sx={{
        minHeight: bounded ? 0 : '100vh',
        height: bounded ? '100dvh' : undefined,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '230px minmax(0, 1fr)' },
        gridTemplateRows: bounded
          ? { xs: 'auto minmax(0, 1fr)', md: 'minmax(0, 1fr)' }
          : { xs: 'auto 1fr', md: '1fr' },
      }}
    >
      <Box
        component="aside"
        sx={{
          minHeight: bounded ? 0 : undefined,
          overflowY: bounded ? 'auto' : undefined,
          bgcolor: 'background.paper',
          borderRight: { md: 1 },
          borderBottom: { xs: 1, md: 0 },
          borderColor: 'divider',
          p: 3,
        }}
      >
        <Typography variant="h6" color="primary" sx={{ mb: 3 }}>
          AI Job Hunter
        </Typography>
        <Stack
          component="nav"
          aria-label="Main navigation"
          direction={{ xs: 'row', md: 'column' }}
          sx={{ flexWrap: 'wrap' }}
          spacing={1}
          useFlexGap
        >
          {navigation.map(({ label, path }) => (
            <Button
              key={path}
              component={NavLink}
              to={path}
              sx={{
                justifyContent: 'flex-start',
                color: 'text.secondary',
                '&.active': {
                  bgcolor: 'action.selected',
                  color: 'primary.main',
                },
              }}
            >
              {label}
            </Button>
          ))}
        </Stack>
      </Box>
      <Box
        sx={{
          minWidth: 0,
          ...(bounded && {
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }),
        }}
      >
        <Container
          component="header"
          maxWidth="lg"
          sx={{ px: { xs: 2, sm: 3 }, py: 2, flexShrink: 0 }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <Typography variant="subtitle1">
              Make your next move count.
            </Typography>
            <ApiReadiness />
          </Stack>
        </Container>
        <Divider sx={{ flexShrink: 0 }} />
        <Container
          component="main"
          maxWidth="lg"
          sx={{
            px: { xs: 2, sm: 3 },
            py: 3,
            ...(bounded && {
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }),
          }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<JobInbox />} />
            <Route
              path="/discover"
              element={
                <DiscoverJobsPage
                  onViewportLayoutChange={setDiscoveryViewport}
                />
              }
            />
            <Route path="/cv" element={<Dashboard />} />
            <Route path="/jobs" element={<JobInbox />} />
            <Route
              path="/jobs/new"
              element={
                <JobEditor
                  key="new"
                  onViewportLayoutChange={setEditorViewport}
                />
              }
            />
            <Route
              path="/jobs/:id"
              element={<JobEditor onViewportLayoutChange={setEditorViewport} />}
            />
            {UiAcceptancePreview && (
              <Route
                path="/dashboard/ui-check"
                element={
                  <Suspense
                    fallback={
                      <Typography>Loading synthetic preview…</Typography>
                    }
                  >
                    <UiAcceptancePreview />
                  </Suspense>
                }
              />
            )}
            {navigation
              .filter(
                (item) =>
                  !['/dashboard', '/discover', '/cv', '/jobs'].includes(
                    item.path,
                  ),
              )
              .map(({ label, path }) => (
                <Route
                  key={path}
                  path={path}
                  element={<ComingSoon title={label} />}
                />
              ))}
            <Route
              path="*"
              element={
                <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
                  <Typography variant="h4" component="h1">
                    Page not found
                  </Typography>
                  <Typography color="text.secondary">
                    This page does not exist in your workspace.
                  </Typography>
                  <Button component={Link} to="/dashboard" variant="contained">
                    Back to dashboard
                  </Button>
                </Stack>
              }
            />
          </Routes>
        </Container>
      </Box>
    </Box>
  );
}
