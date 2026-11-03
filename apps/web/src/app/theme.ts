import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#176b5b' },
    background: { default: '#f5f7f6' },
  },
  spacing: 8,
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    h4: { fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.3 },
    // Preserve the existing section/body metrics used by CV Match.
    h6: { fontSize: '1.25rem', fontWeight: 500, lineHeight: 1.6 },
    subtitle1: { fontSize: '1rem', fontWeight: 400, lineHeight: 1.75 },
    subtitle2: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.57 },
    body1: { fontSize: '1rem', lineHeight: 1.5 },
    body2: { fontSize: '0.875rem', lineHeight: 1.43 },
    caption: { fontSize: '0.75rem', lineHeight: 1.66 },
    button: { textTransform: 'none' },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
        }),
        sizeSmall: { minHeight: 32 },
        sizeMedium: { minHeight: 36 },
        sizeLarge: { minHeight: 44 },
      },
    },
    MuiToggleButton: {
      styleOverrides: { root: { textTransform: 'none' } },
    },
  },
});
