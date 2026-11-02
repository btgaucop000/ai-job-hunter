import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RequirementInputs } from '../src/features/inbox/RequirementInputs';

test('qualifications are separate editable groups while preserving one canonical saved value', () => {
  const change = vi.fn();
  const value =
    "RESTful API\nBachelor's degree in Computer Science\nEnglish reading comprehension\nSecurity mindset — ability to think like an attacker";
  const { rerender } = render(
    <RequirementInputs
      label="Required skills"
      value={value}
      onChange={change}
      error={false}
      maxLength={10000}
    />,
  );
  expect(screen.getByLabelText('Required skills')).toHaveValue('RESTful API');
  expect(screen.getByLabelText('Required education requirements')).toHaveValue(
    "Bachelor's degree in Computer Science",
  );
  expect(screen.getByLabelText('Required language requirements')).toHaveValue(
    'English reading comprehension',
  );
  expect(
    screen.getByLabelText('Required collaboration and soft-skill requirements'),
  ).toHaveValue('Security mindset — ability to think like an attacker');
  fireEvent.change(screen.getByLabelText('Required skills'), {
    target: { value: 'RESTful API\nDocker' },
  });
  const saved = change.mock.lastCall![0] as string;
  expect(saved).toContain('Docker');
  expect(saved).toContain('English reading');
  expect(saved).toContain("Bachelor's degree");
  expect(saved).toContain('Security mindset');
  rerender(
    <RequirementInputs
      label="Required skills"
      value={saved}
      onChange={change}
      error={false}
      maxLength={10000}
    />,
  );
  fireEvent.change(screen.getByLabelText('Required language requirements'), {
    target: { value: '' },
  });
  expect(screen.getByLabelText('Required language requirements')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Required language requirements'), {
    target: { value: 'English technical reading (manually reviewed)' },
  });
  expect(change.mock.lastCall![0]).toContain('Docker');
  expect(change.mock.lastCall![0]).toContain(
    'English technical reading (manually reviewed)',
  );
});

test('preferred concepts/integration labels stay intact and new extraction refreshes groups', () => {
  const { rerender } = render(
    <RequirementInputs
      label="Preferred skills"
      value="React Native"
      onChange={() => {}}
      error={false}
      maxLength={10000}
    />,
  );
  rerender(
    <RequirementInputs
      label="Preferred skills"
      value={'integration experience (AWS KMS, GCP KMS)\nEnglish communication'}
      onChange={() => {}}
      error={false}
      maxLength={10000}
    />,
  );
  expect(screen.getByLabelText('Preferred skills')).toHaveValue(
    'integration experience (AWS KMS, GCP KMS)',
  );
  expect(screen.getByLabelText('Preferred language requirements')).toHaveValue(
    'English communication',
  );
});

test('Viettel-style language and optional certificate clauses stay separate from technical skills', () => {
  render(
    <>
      <RequirementInputs
        label="Required skills"
        value={
          'Java\nTrình độ ngoại ngữ: TOEIC 550 / IELTS 5.5\nTốt nghiệp Đại học ngành máy tính'
        }
        onChange={() => {}}
        error={false}
        maxLength={10000}
      />
      <RequirementInputs
        label="Preferred skills"
        value="ưu tiên ứng viên có chứng chỉ ngoại ngữ quốc tế"
        onChange={() => {}}
        error={false}
        maxLength={10000}
      />
    </>,
  );
  expect(screen.getByLabelText('Required skills')).toHaveValue('Java');
  expect(screen.getByLabelText('Required language requirements')).toHaveValue(
    'Trình độ ngoại ngữ: TOEIC 550 / IELTS 5.5',
  );
  expect(screen.getByLabelText('Preferred language requirements')).toHaveValue(
    'ưu tiên ứng viên có chứng chỉ ngoại ngữ quốc tế',
  );
  expect(screen.getByLabelText('Required education requirements')).toHaveValue(
    'Tốt nghiệp Đại học ngành máy tính',
  );
});

test('preferred university names remain education qualifications rather than telecom technologies', () => {
  render(
    <RequirementInputs
      label="Preferred skills"
      value="Đặc biệt ưu tiên Học viện Công nghệ Viễn thông"
      onChange={() => {}}
      error={false}
      maxLength={10000}
    />,
  );
  expect(screen.getByLabelText('Preferred skills')).toHaveValue('');
  expect(screen.getByLabelText('Preferred education requirements')).toHaveValue(
    'Đặc biệt ưu tiên Học viện Công nghệ Viễn thông',
  );
});
