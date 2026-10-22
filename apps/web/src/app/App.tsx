import {
  Box,
  Button,
  Container,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Dashboard } from '../features/dashboard/Dashboard';
import { ApiReadiness } from '../features/health/ApiReadiness';

const navigation = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Candidates', path: '/candidates' },
  { label: 'Jobs', path: '/jobs' },
  { label: 'Matches', path: '/matches' },
  { label: 'Settings', path: '/settings' },
];
function ComingSoon({ title }: { title: string }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        {title}
      </Typography>
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
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '230px minmax(0, 1fr)' },
        gridTemplateRows: { xs: 'auto 1fr', md: '1fr' },
      }}
    >
      <Box
        component="aside"
        sx={{
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
      <Box sx={{ minWidth: 0 }}>
        <Stack
          component="header"
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ px: { xs: 3, md: 5 }, py: 2, justifyContent: 'space-between' }}
        >
          <Typography variant="subtitle1">
            Make your next move count.
          </Typography>
          <ApiReadiness />
        </Stack>
        <Divider />
        <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            {navigation.slice(1).map(({ label, path }) => (
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
