import { useEffect, useId, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  SvgIcon,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { importUpload, opportunityRequest } from './opportunities-api';
interface SavedCv {
  fileName: string;
  updatedAt: string;
}
interface MatchResult {
  score: number | null;
  recommendation: string;
  explanation: string;
  advice: string;
  analyzedAt: string;
  requirements: {
    requirement: string;
    priority: string;
    category: string;
    jdQuote: string;
    cvQuote: string;
    status: 'EVIDENCED' | 'NOT_EVIDENCED';
  }[];
}
export function CvMatchPanel({
  jobId,
  revision,
}: {
  jobId: string;
  revision: string;
}) {
  const generation = useRef(0);
  const [cv, setCv] = useState<SavedCv | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MatchResult | null>(null);
  const [source, setSource] = useState({ jobId, revision });
  if (source.jobId !== jobId || source.revision !== revision) {
    setSource({ jobId, revision });
    setResult(null);
  }
  useEffect(() => {
    const request = ++generation.current;
    return () => {
      generation.current = request + 1;
    };
  }, [jobId, revision]);
  useEffect(() => {
    let active = true;
    opportunityRequest<SavedCv | null>('/cv/current').then(
      (row) => {
        if (active) setCv(row);
      },
      () => {
        if (active) setError('Could not load saved CV. Check the local API.');
      },
    );
    return () => {
      active = false;
    };
  }, [jobId]);
  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      setCv(
        await opportunityRequest<SavedCv>('/cv/current', {
          method: 'POST',
          body: importUpload({}, file),
        }),
      );
      setResult(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'CV upload failed.');
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/opportunities/${jobId}/match`, {
        method: 'POST',
      }).catch(() => {
        throw new Error(
          'Could not reach the local matching API. Check the local API and retry; no new fit score was produced.',
        );
      });
      const value: unknown = await response.json().catch(() => {
        throw new Error(
          'The local API returned unreadable matching output. Retry; no new fit score was produced.',
        );
      });
      if (!response.ok) {
        const code =
          value && typeof value === 'object' && 'errorCode' in value
            ? value.errorCode
            : null;
        const messages: Record<string, string> = {
          CV_MATCH_CV_UNAVAILABLE:
            'Saved CV text is missing or empty. Save a readable CV again before analyzing.',
          CV_MATCH_TIMEOUT:
            'Local matching timed out. Check Ollama and retry; no new fit score was produced.',
          CV_MATCH_INVALID_OUTPUT:
            'Local model returned invalid matching output. Retry; no new fit score was produced.',
          CV_MATCH_INCOMPLETE:
            'Local model returned an incomplete assessment. Retry; no new fit score was produced.',
          CV_MATCH_EVIDENCE_REJECTED:
            'Evidence could not be verified against the saved sources. Retry; no new fit score was produced.',
        };
        throw new Error(
          typeof code === 'string' && messages[code]
            ? messages[code]
            : 'CV matching failed. Check your saved CV, saved job requirements and local Ollama service, then retry.',
        );
      }
      if (!isMatchResult(value))
        throw new Error(
          'The API returned an invalid matching result. Retry; no new fit score was produced.',
        );
      if (request === generation.current) setResult(value);
    } catch (error) {
      if (request === generation.current)
        setError(
          error instanceof Error
            ? error.message
            : 'CV matching failed. Check the local API and retry.',
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{
            justifyContent: 'space-between',
            alignItems: { sm: 'flex-start' },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="h2">
              CV–JD match
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Your documented experience, compared with this opportunity.
            </Typography>
          </Box>
          <Button
            variant={result ? 'outlined' : 'contained'}
            disableElevation
            disabled={busy || !cv}
            onClick={() => void analyze()}
            sx={{
              textTransform: 'none',
              flexShrink: 0,
              alignSelf: 'flex-start',
            }}
          >
            {result ? 'Reanalyze CV Match' : 'Analyze CV Match'}
          </Button>
        </Stack>
        <Box>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ alignItems: 'center', flexWrap: 'wrap' }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ overflowWrap: 'anywhere', minWidth: 0 }}
            >
              {cv ? `Saved CV: ${cv.fileName}` : 'No saved CV yet.'}
            </Typography>
            <Button
              component="label"
              size="small"
              disabled={busy}
              sx={{ textTransform: 'none', flexShrink: 0 }}
            >
              {cv ? 'Replace CV' : 'Save CV'}
              <input
                disabled={busy}
                hidden
                type="file"
                accept=".pdf,.docx"
                aria-label="Save CV for matching"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Uses the latest saved CV and job, not unsaved edits. Files parse
            locally; analysis sends them to local Ollama.
          </Typography>
        </Box>
        {busy && (
          <Stack direction="row" spacing={1} role="status">
            <CircularProgress size={20} />
            <Typography>Processing locally…</Typography>
          </Stack>
        )}
        {error && (
          <Alert severity="error">
            {error}
            {result &&
              ' The last successful result is retained below; it does not reflect this failed attempt.'}
          </Alert>
        )}
        {busy && result && (
          <Typography variant="caption">
            Previous successful result shown while reanalysis is running.
          </Typography>
        )}
        {result && <MatchContent key={result.analyzedAt} result={result} />}
      </Stack>
    </Paper>
  );
}

function MatchIcon({ kind }: { kind: 'matched' | 'gap' | 'expand' }) {
  return (
    <SvgIcon
      fontSize="small"
      sx={{
        flexShrink: 0,
        color: kind === 'matched' ? 'success.main' : 'text.secondary',
      }}
    >
      <path
        d={
          kind === 'matched'
            ? 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.4-1.4 3.6 3.6 7.6-7.6L19 8l-9 9z'
            : kind === 'expand'
              ? 'm7.4 8.6 4.6 4.6 4.6-4.6L18 10l-6 6-6-6z'
              : 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-4-9h8v2H8z'
        }
      />
    </SvgIcon>
  );
}

function MatchContent({ result }: { result: MatchResult }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [target, setTarget] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  function inspect(index: number) {
    setSelected(index);
    setFilter('all');
    setExpanded((previous) => new Set(previous).add(index));
    setTarget(index);
  }
  return (
    <Stack spacing={3} sx={{ minWidth: 0 }}>
      <MatchOverview result={result} onInspect={inspect} />
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Not evidenced in this CV does not mean you do not possess the
          qualification.
        </Typography>
        <RequirementsList
          requirements={result.requirements}
          filter={filter}
          onFilter={setFilter}
          expanded={expanded}
          onExpand={(index, open) =>
            setExpanded((previous) => {
              const next = new Set(previous);
              if (open) next.add(index);
              else next.delete(index);
              return next;
            })
          }
          selected={selected}
          target={target}
          onNavigated={() => setTarget(null)}
        />
      </Box>
      <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
        <Typography
          variant="subtitle1"
          component="h3"
          sx={{ fontWeight: 600, mb: 1 }}
        >
          Application advice
        </Typography>
        <Typography variant="body2">{result.advice}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Results are held on this page. Reanalyze after saving CV or job changes.
        Review all evidence before relying on this advice.
      </Typography>
    </Stack>
  );
}

type PreviewRequirement = {
  item: MatchResult['requirements'][number];
  index: number;
};
function MatchOverview({
  result,
  onInspect,
}: {
  result: MatchResult;
  onInspect: (index: number) => void;
}) {
  const rows = result.requirements.map((item, index) => ({ item, index }));
  const matched = rows.filter(({ item }) => item.status === 'EVIDENCED');
  const gaps = rows.filter(({ item }) => item.status === 'NOT_EVIDENCED');
  const requiredGaps = gaps.filter(({ item }) => item.priority === 'required');
  const preferredGaps = gaps.filter(
    ({ item }) => item.priority === 'preferred',
  );
  const strengths = [...matched].sort(
    (a, b) =>
      Number(b.item.priority === 'required') -
      Number(a.item.priority === 'required'),
  );
  const explanationId = useId();
  return (
    <Stack spacing={3}>
      <Box
        sx={{ bgcolor: 'action.hover', borderRadius: 1, p: { xs: 2, sm: 3 } }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'minmax(0, 1fr) minmax(0, 1fr)',
            },
            gap: 2,
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography variant="subtitle2">Documented fit</Typography>
            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}
            >
              <Typography
                variant="h3"
                component="p"
                sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                aria-label={`Fit score: ${result.score === null ? 'Not enough evidence' : `${result.score}/100`} (heuristic)`}
              >
                {result.score === null ? '—' : result.score}
                {result.score !== null && (
                  <Typography
                    component="span"
                    variant="body1"
                    color="text.secondary"
                  >
                    {' '}
                    / 100
                  </Typography>
                )}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                label={result.recommendation}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Heuristic evidence coverage · Not a hiring probability
            </Typography>
          </Box>
          <Box>
            <Stack
              direction="row"
              spacing={2}
              useFlexGap
              aria-label="Requirement counts"
              sx={{ flexWrap: 'wrap', mb: 1.5 }}
            >
              <Typography variant="body2">Matched: {matched.length}</Typography>
              <Typography variant="body2">Unverified: {gaps.length}</Typography>
              <Typography variant="body2" color="text.secondary">
                Total: {rows.length}
              </Typography>
            </Stack>
            {result.score === null ? (
              <Typography variant="body2" color="text.secondary">
                Not enough evidence
              </Typography>
            ) : (
              <LinearProgress
                variant="determinate"
                value={result.score}
                aria-label="Heuristic fit score"
                color="inherit"
                sx={{
                  height: 6,
                  borderRadius: 1,
                  color: 'text.secondary',
                  bgcolor: 'action.disabledBackground',
                }}
              />
            )}
          </Box>
        </Box>
        <Accordion
          disableGutters
          elevation={0}
          square
          sx={{
            bgcolor: 'transparent',
            mt: 1,
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary
            id={`${explanationId}-summary`}
            aria-controls={`${explanationId}-details`}
            expandIcon={<MatchIcon kind="expand" />}
            sx={{ px: 0 }}
          >
            <Typography variant="body2" color="text.secondary">
              How to read this analysis
            </Typography>
          </AccordionSummary>
          <AccordionDetails
            id={`${explanationId}-details`}
            sx={{ px: 0, pt: 0, pb: 0 }}
          >
            <Typography variant="body2" color="text.secondary">
              {result.explanation}
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'repeat(2, minmax(0, 1fr))',
          },
          gap: 3,
        }}
      >
        <RequirementPreview
          title="Key strengths"
          items={strengths}
          empty="No verified matches yet."
          hint="Verified in your CV"
          onInspect={onInspect}
        />
        <RequirementPreview
          title={requiredGaps.length ? 'Required gaps' : 'Preferred gaps'}
          items={requiredGaps.length ? requiredGaps : preferredGaps}
          empty="No unverified requirements reported."
          hint={
            requiredGaps.length
              ? 'Required qualifications not evidenced in your CV'
              : 'No required gaps reported. Preferred qualifications to review.'
          }
          onInspect={onInspect}
        />
      </Box>
    </Stack>
  );
}

function RequirementPreview({
  title,
  hint,
  items,
  empty,
  onInspect,
}: {
  title: string;
  hint: string;
  items: PreviewRequirement[];
  empty: string;
  onInspect: (index: number) => void;
}) {
  return (
    <Box component="section" aria-label={title} sx={{ minWidth: 0 }}>
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {hint}
      </Typography>
      {items.length ? (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, mb: 0, mt: 1 }}>
          {items.slice(0, 3).map(({ item, index }) => (
            <Box component="li" key={index}>
              <Button
                fullWidth
                onClick={() => onInspect(index)}
                aria-label={`View evidence: ${item.requirement}`}
                sx={{
                  textTransform: 'none',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  color: 'text.primary',
                  px: 0.5,
                  py: 1,
                  gap: 1,
                  alignItems: 'flex-start',
                }}
              >
                <MatchIcon
                  kind={item.status === 'EVIDENCED' ? 'matched' : 'gap'}
                />
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ overflowWrap: 'anywhere', minWidth: 0 }}
                >
                  {item.requirement}
                </Typography>
              </Button>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {empty}
        </Typography>
      )}
      {items.length > 3 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1 }}
        >
          First 3 of {items.length} · Full evidence below
        </Typography>
      )}
    </Box>
  );
}

function isMatchResult(value: unknown): value is MatchResult {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<MatchResult>;
  return (
    (row.score === null ||
      (typeof row.score === 'number' &&
        Number.isInteger(row.score) &&
        row.score >= 0 &&
        row.score <= 100)) &&
    ['Apply', 'Consider', 'Low Fit'].includes(row.recommendation ?? '') &&
    typeof row.explanation === 'string' &&
    typeof row.advice === 'string' &&
    Array.isArray(row.requirements) &&
    row.requirements.length > 0 &&
    row.requirements.every(
      (item) =>
        item &&
        typeof item.requirement === 'string' &&
        typeof item.jdQuote === 'string' &&
        item.jdQuote.trim() &&
        typeof item.cvQuote === 'string' &&
        ['required', 'preferred'].includes(item.priority) &&
        ['skill', 'experience', 'domain'].includes(item.category) &&
        (item.status === 'NOT_EVIDENCED' ||
          (item.status === 'EVIDENCED' && item.cvQuote.trim())),
    )
  );
}

function RequirementsList({
  requirements,
  filter,
  onFilter,
  expanded,
  onExpand,
  selected,
  target,
  onNavigated,
}: {
  requirements: MatchResult['requirements'];
  filter: string;
  onFilter: (filter: string) => void;
  expanded: Set<number>;
  onExpand: (index: number, open: boolean) => void;
  selected: number | null;
  target: number | null;
  onNavigated: () => void;
}) {
  const items = requirements
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        filter === 'all' ||
        (filter === 'matched'
          ? item.status === 'EVIDENCED'
          : item.status === 'NOT_EVIDENCED'),
    )
    .sort(
      (a, b) =>
        Number(b.item.priority === 'required') -
          Number(a.item.priority === 'required') ||
        Number(b.item.status === 'NOT_EVIDENCED') -
          Number(a.item.status === 'NOT_EVIDENCED') ||
        a.index - b.index,
    );
  return (
    <Box component="section" aria-label="Requirements" sx={{ minWidth: 0 }}>
      <Typography
        component="h3"
        variant="subtitle1"
        sx={{ fontWeight: 700, mb: 1 }}
      >
        Requirements
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Review every match and gap. Open a requirement to compare the original
        CV and JD evidence.
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={filter}
        aria-label="Filter requirements"
        onChange={(_event, value: string | null) => {
          if (value) onFilter(value);
        }}
        sx={{
          mb: 1.5,
          flexWrap: 'wrap',
          '& .MuiToggleButton-root': { textTransform: 'none' },
        }}
      >
        <ToggleButton value="all" aria-label="All">
          All ({requirements.length})
        </ToggleButton>
        <ToggleButton value="matched" aria-label="Matched">
          Matched (
          {requirements.filter((item) => item.status === 'EVIDENCED').length})
        </ToggleButton>
        <ToggleButton value="unverified" aria-label="Unverified">
          Unverified (
          {
            requirements.filter((item) => item.status === 'NOT_EVIDENCED')
              .length
          }
          )
        </ToggleButton>
      </ToggleButtonGroup>
      {items.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No {filter === 'matched' ? 'matched' : 'unverified'} requirements
          reported.
        </Typography>
      )}
      <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
        {items.map(({ item, index }) => (
          <RequirementCard
            key={index}
            item={item}
            expanded={expanded.has(index)}
            onExpand={(open) => onExpand(index, open)}
            selected={selected === index}
            targeted={target === index}
            onNavigated={onNavigated}
          />
        ))}
      </Box>
    </Box>
  );
}
function RequirementCard({
  item,
  expanded,
  onExpand,
  selected,
  targeted,
  onNavigated,
}: {
  item: MatchResult['requirements'][number];
  expanded: boolean;
  onExpand: (open: boolean) => void;
  selected: boolean;
  targeted: boolean;
  onNavigated: () => void;
}) {
  const id = useId();
  const summaryRef = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    // MUI's entered callback signals that the evidence has its final height.
    // This also handles clicking an already-open row without a new transition.
    if (!targeted || !expanded || !entered) return;
    summaryRef.current?.scrollIntoView?.({
      block: 'start',
      inline: 'nearest',
      behavior: 'instant',
    });
    summaryRef.current?.focus({ preventScroll: true });
    onNavigated();
  }, [targeted, expanded, entered, onNavigated]);
  const matched = item.status === 'EVIDENCED';
  return (
    <Accordion
      square
      expanded={expanded}
      onChange={(_, open) => onExpand(open)}
      disableGutters
      elevation={0}
      slotProps={{
        transition: {
          unmountOnExit: true,
          appear: true,
          timeout: targeted ? 0 : undefined,
          onEntered: () => setEntered(true),
          onExit: () => setEntered(false),
        },
      }}
      sx={{
        minWidth: 0,
        borderBottom: 1,
        borderColor: 'divider',
        '&.Mui-expanded': { m: 0 },
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary
        ref={(node) => {
          summaryRef.current = node;
        }}
        aria-current={selected ? 'true' : undefined}
        id={`${id}-summary`}
        aria-controls={`${id}-evidence`}
        aria-label={`${matched ? 'Matched' : 'Unverified'}: ${item.requirement}`}
        expandIcon={<MatchIcon kind="expand" />}
        sx={{
          px: 1,
          minHeight: 64,
          bgcolor: selected ? 'action.selected' : undefined,
          boxShadow: selected
            ? (theme) => `inset 3px 0 0 ${theme.palette.primary.main}`
            : undefined,
          '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
          '& .MuiAccordionSummary-content, & .MuiAccordionSummary-content.Mui-expanded':
            { my: 1 },
          '&.Mui-focusVisible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
          '& .MuiAccordionSummary-content': { minWidth: 0 },
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{ minWidth: 0, width: '100%', pr: 1, alignItems: 'flex-start' }}
        >
          <Box
            role="img"
            aria-label={matched ? 'Matched' : 'Unverified'}
            sx={{ display: 'flex', pt: 0.25 }}
          >
            <MatchIcon kind={matched ? 'matched' : 'gap'} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="body1"
              sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}
            >
              {item.requirement}
            </Typography>
            <Stack
              direction="row"
              spacing={2}
              useFlexGap
              sx={{ flexWrap: 'wrap', mt: 0.5 }}
            >
              <Typography variant="body2" color="text.secondary">
                {item.priority === 'required' ? 'Required' : 'Preferred'}
                {item.category !== 'skill' && (
                  <>
                    {' '}
                    · {item.category === 'experience' ? 'Experience' : 'Domain'}
                  </>
                )}
              </Typography>
              <Typography
                variant="body2"
                color={matched ? 'success.main' : 'text.secondary'}
              >
                {matched ? 'Matched' : 'Unverified'}
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </AccordionSummary>
      <AccordionDetails
        id={`${id}-evidence`}
        sx={{
          minWidth: 0,
          px: { xs: 1.5, sm: 4 },
          py: 1.5,
          bgcolor: 'action.hover',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(2, minmax(0, 1fr))',
            },
            gap: 2,
          }}
        >
          <EvidenceQuote source="JD evidence" quote={item.jdQuote} />
          {matched ? (
            <EvidenceQuote source="CV evidence" quote={item.cvQuote} />
          ) : (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Your CV
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Not evidenced in CV
              </Typography>
            </Box>
          )}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
function EvidenceQuote({
  source,
  quote,
}: {
  source: 'CV evidence' | 'JD evidence';
  quote: string;
}) {
  return (
    <Box>
      <Typography variant="subtitle2">
        {source === 'CV evidence' ? 'Your CV' : 'Job description'}
      </Typography>
      <Box
        component="blockquote"
        aria-label={source}
        tabIndex={0}
        sx={{
          m: 0,
          mt: 0.5,
          p: 0,
          color: 'text.secondary',
          maxHeight: '12rem',
          overflowY: 'auto',
          overflowWrap: 'anywhere',
          whiteSpace: 'pre-wrap',
          typography: 'body2',
        }}
      >
        {quote}
      </Box>
    </Box>
  );
}
