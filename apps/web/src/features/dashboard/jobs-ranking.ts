import type { AnalysisResponse } from './analysis.types';
import type { PublicJob } from './jobs.types';
export interface CvSkill {
  name: string;
  origin: 'evidence-validated CV fact' | 'literal CV skills-section mention';
}
const vocabulary = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Java',
  'SQL',
  'PostgreSQL',
  'MySQL',
  'MariaDB',
  'React',
  'Angular',
  'Vue',
  'Node.js',
  'NestJS',
  'Spring',
  'Docker',
  'Kubernetes',
  'AWS',
  'Azure',
  'Git',
  'Linux',
  'C++',
  'C#',
  '.NET',
  'Go',
  'Rust',
  'PHP',
  'Ruby',
  'Swift',
  'Kotlin',
  'Terraform',
  'GraphQL',
  'MongoDB',
  'Redis',
];
const word = (char: string) => /[\p{L}\p{N}_]/u.test(char);
export function containsSkill(text: string, skill: string): boolean {
  const haystack = text.toLowerCase(),
    needle = skill.toLowerCase();
  if (!needle.trim()) return false;
  let at = haystack.indexOf(needle);
  while (at >= 0) {
    if (
      !word(haystack.charAt(at - 1)) &&
      !word(haystack.charAt(at + needle.length))
    )
      return true;
    at = haystack.indexOf(needle, at + 1);
  }
  return false;
}
export function cvSkills(response: AnalysisResponse | null): CvSkill[] {
  const doc = response?.documents?.cv;
  if (!doc) return [];
  const found: CvSkill[] = [];
  if (doc.partial) {
    for (const fact of doc.partial.fields.skills ?? []) {
      if (
        fact.status === 'VALID' &&
        doc.text.slice(fact.evidence.start, fact.evidence.end) ===
          fact.evidence.quote &&
        doc.text.slice(fact.evidence.valueStart, fact.evidence.valueEnd) ===
          fact.value
      )
        found.push({ name: fact.value, origin: 'evidence-validated CV fact' });
    }
  } else {
    // No AI: only literal, bounded terms inside an explicitly labeled skills
    // section. Do not infer skills from employment, titles, dates or filenames.
    let inSkills = false;
    for (const line of doc.text.split(/\r?\n/u)) {
      const heading =
        /^\s*(?:technical\s+skills?|skills?|technologies|tech(?:nology)?\s+stack|kỹ năng)\s*(?::|$)/iu.exec(
          line,
        );
      if (heading) inSkills = true;
      else if (
        !line.trim() ||
        /^\s*(?:work\s+experience|experience|education|projects|employment|profile|certifications|languages)\s*:?(?:\s|$)/iu.test(
          line,
        )
      )
        inSkills = false;
      if (
        !inSkills ||
        /\b(no|not|without|lack|lacking|learning|beginner|want|wish)\b/iu.test(
          line,
        )
      )
        continue;
      const content = heading ? line.slice(heading[0].length) : line;
      for (const name of vocabulary)
        if (containsSkill(content, name))
          found.push({ name, origin: 'literal CV skills-section mention' });
    }
  }
  return found
    .filter(
      (skill, index) =>
        found.findIndex(
          (other) => other.name.toLowerCase() === skill.name.toLowerCase(),
        ) === index,
    )
    .slice(0, 50);
}
export function rankJobs(
  jobs: readonly PublicJob[],
  skills: readonly CvSkill[],
) {
  return jobs
    .map((job, index) => ({
      job,
      index,
      matchedSkills: skills.filter((skill) =>
        containsSkill(
          `${job.title}\n${job.tags.join('\n')}\n${job.description}`,
          skill.name,
        ),
      ),
    }))
    .sort(
      (a, b) =>
        b.matchedSkills.length - a.matchedSkills.length ||
        (Date.parse(b.job.publishedAt ?? '') || 0) -
          (Date.parse(a.job.publishedAt ?? '') || 0) ||
        a.index - b.index,
    );
}
