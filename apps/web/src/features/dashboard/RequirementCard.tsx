import {
  Box,
  Chip,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useId } from 'react';
import type { RequirementResult } from './analysis.types';
import type { RequirementFeedback } from './requirement-feedback';

const plainText = {
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
} as const;
export function RequirementCard({
  item,
  position,
  feedback,
  onFeedbackChange,
}: {
  item: RequirementResult;
  position: number;
  feedback: RequirementFeedback | null;
  onFeedbackChange: (value: RequirementFeedback | null) => void;
}) {
  const feedbackLabelId = useId();

  return (
    <Paper component="article" variant="outlined" sx={{ p: 2, minWidth: 0 }}>
      <Stack spacing={1}>
        <Typography component="h3" variant="h6" sx={plainText}>
          {item.originalTexts.join('\n')}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Chip label={item.status} size="small" />
          <Chip label={item.evaluability} size="small" />
          <Chip
            label={
              item.includedInScore ? 'Included in score' : 'Excluded from score'
            }
            size="small"
          />
        </Stack>
        <Typography>Priority: {item.priority}</Typography>
        {item.status === 'MISSING_EVIDENCE' && (
          <Typography>
            {item.evaluability === 'EVALUABLE'
              ? 'No usable supporting evidence found.'
              : 'This requirement could not be evaluated.'}{' '}
            This does not establish that the candidate lacks the skill.
          </Typography>
        )}
        <Typography sx={plainText}>{item.explanation.text}</Typography>
        {item.uncertainty.length > 0 && (
          <Typography sx={plainText}>
            Uncertainty: {item.uncertainty.join(', ')}
          </Typography>
        )}
        <Box>
          <Typography id={feedbackLabelId} variant="body2" sx={{ mb: 1 }}>
            Feedback for requirement {position}
          </Typography>
          <ToggleButtonGroup
            aria-labelledby={feedbackLabelId}
            exclusive
            size="small"
            value={feedback}
            onChange={(_event, value: RequirementFeedback | null) => {
              onFeedbackChange(value);
            }}
          >
            <ToggleButton value="CORRECT">Correct</ToggleButton>
            <ToggleButton value="INCORRECT">Incorrect</ToggleButton>
            <ToggleButton value="UNSURE">Unsure</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box component="details">
          <Box component="summary" sx={{ cursor: 'pointer' }}>
            Evidence ({item.evidence.length}) and matching details
          </Box>
          {item.evidence.length === 0 && (
            <Typography>
              No evidence links returned for this requirement.
            </Typography>
          )}
          {item.evidence.map((link, index) => (
            <Box key={index} sx={{ my: 2 }}>
              <Typography>
                {link.document.toUpperCase()} evidence — {link.role}
              </Typography>
              <Box
                component="blockquote"
                sx={{
                  ...plainText,
                  m: 0,
                  pl: 2,
                  borderLeft: 2,
                  borderColor: 'divider',
                }}
              >
                {link.reference.quote}
              </Box>
              <Typography variant="caption" sx={plainText}>
                Segment: {link.reference.segmentId}; UTF-16 offsets:{' '}
                {link.reference.start}–{link.reference.end}; field:{' '}
                {link.factPath}
              </Typography>
            </Box>
          ))}
          <Typography sx={plainText}>
            Requirement ID: {item.id || 'Not supplied'}; JD indexes:{' '}
            {item.jdRequirementIndexes.join(', ')}; category:{' '}
            {item.category ?? 'Unclassified'}; canonical term:{' '}
            {item.canonicalTerm ?? 'Not available'}
          </Typography>
          <Typography>
            Predicate: {item.predicate}; minimum months:{' '}
            {item.minimumMonths ?? 'Not stated'}; observed months:{' '}
            {item.observedMonths ?? 'Unknown'}
          </Typography>
          <Typography>
            Importance weight: {item.importanceWeight}; credit:{' '}
            {item.credit ?? 'Not calculable'}
          </Typography>
          <Typography sx={plainText}>
            Rules: {item.ruleIds.join(', ') || 'None'}; explanation code:{' '}
            {item.explanation.code}
          </Typography>
          {Object.entries(item.explanation.params).map(([key, value]) => (
            <Typography key={key} sx={plainText}>
              {key}: {value}
            </Typography>
          ))}
        </Box>
      </Stack>
    </Paper>
  );
}
