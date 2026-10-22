import { Box, Paper, Stack, Typography } from '@mui/material';

export function Dashboard() {
  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="overline" color="primary">
          Your workspace
        </Typography>
        <Typography variant="h4" component="h1">
          Dashboard
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          A clearer view of your next career move.
        </Typography>
      </Box>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Your workspace is ready to grow
        </Typography>
        <Typography color="text.secondary">
          There are no candidates, saved jobs, or matches yet. These features
          are coming soon; uploads and AI matching are not available yet.
        </Typography>
      </Paper>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 2,
        }}
      >
        {[
          ['Candidates', 'Keep professional profiles together.'],
          ['Jobs', 'Organize opportunities worth exploring.'],
          ['Matches', 'Understand how a profile fits a role.'],
        ].map(([title, description]) => (
          <Paper key={title} variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" component="h2">
              {title}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {description}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 3 }}
            >
              Coming soon
            </Typography>
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}
