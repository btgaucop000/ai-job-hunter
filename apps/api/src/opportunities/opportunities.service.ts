import {
  duplicateJob,
  normalizedUrl,
  type DiscoveredJob,
} from '../discovery/discovery.js';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { JobImportService } from './job-import.service.js';
import type { JobDocument } from './job-import.upload.js';
import { fullDescription } from './job-import.contract.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from './opportunity.entity.js';
import { validateOpportunity } from './opportunity.validation.js';
// Local single-user identity only. Never accept owner identifiers from callers.
export const LOCAL_OWNER_ID = '00000000-0000-4000-8000-000000000001';
@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly rows: Repository<Opportunity>,
    private readonly imports: JobImportService,
  ) {}
  list() {
    return this.rows.find({
      where: { ownerId: LOCAL_OWNER_ID },
      order: { updatedAt: 'DESC', id: 'ASC' },
    });
  }
  async get(id: string) {
    const row = await this.rows.findOneBy({ id, ownerId: LOCAL_OWNER_ID });
    if (!row) throw new NotFoundException('Opportunity not found');
    return row;
  }
  async document(id: string): Promise<JobDocument> {
    const row = await this.rows.findOne({
      where: { id, ownerId: LOCAL_OWNER_ID },
      select: {
        id: true,
        documentName: true,
        documentType: true,
        documentBytes: true,
      },
    });
    if (!row?.documentBytes || !row.documentName || !row.documentType)
      throw new NotFoundException('JD document not found');
    return {
      bytes: row.documentBytes,
      fileName: row.documentName,
      mediaType: row.documentType,
    };
  }
  async importDiscovered(jobs: DiscoveredJob[]) {
    return this.rows.manager.transaction(async (manager) => {
      // Serialize imports across API processes; existing/manual jobs are never updated.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('job-discovery'), hashtext($1))",
        [LOCAL_OWNER_ID],
      );
      const rows = manager.getRepository(Opportunity);
      const existing = await rows.find({ where: { ownerId: LOCAL_OWNER_ID } });
      let imported = 0;
      let duplicatesSkipped = 0;
      let remaining = 0;
      const importedIds: string[] = [];
      for (const job of jobs) {
        if (existing.some((row) => duplicateJob(job, row))) {
          duplicatesSkipped++;
          continue;
        }
        if (imported >= 50) {
          remaining++;
          continue;
        }
        const fields = validateOpportunity({
          title: job.title,
          company: job.company,
          location: job.location,
          workMode: job.workMode,
          seniority: job.seniority,
          skills: job.skills,
          preferredSkills: job.preferredSkills,
          description: job.description,
          originalLink: job.originalLink,
          source: 'Website',
          status: 'SAVED',
          contactNotes: '',
          notes: '',
          contactDates: [],
          followUpDate: null,
        });
        const row = await rows.save(
          rows.create({
            ...fields,
            ownerId: LOCAL_OWNER_ID,
            jdText: '',
            discovery: job.discovery,
            documentName: null,
            documentType: null,
            documentBytes: null,
          }),
        );
        existing.push(row);
        importedIds.push(row.id);
        imported++;
      }
      return { imported, duplicatesSkipped, remaining, importedIds };
    });
  }
  async create(input: unknown, document?: JobDocument) {
    const parsed = document ? await this.imports.parse(document) : null;
    const fields = validateOpportunity(input, parsed?.source.text ?? '');
    const urlKey = normalizedUrl(fields.originalLink);
    if (urlKey) {
      const existing = await this.list();
      if (existing.some((job) => normalizedUrl(job.originalLink) === urlKey))
        throw new ConflictException(
          'This job URL is already saved. Open the existing job in Job Inbox; its fields have not been changed.',
        );
    }
    const row = await this.rows.save(
      this.rows.create({
        ...fields,
        description:
          fields.description ||
          fullDescription(fields.postText, parsed?.source.text ?? ''),
        ownerId: LOCAL_OWNER_ID,
        jdText: parsed?.source.text ?? '',
        documentName: document?.fileName ?? null,
        documentType: document?.mediaType ?? null,
        documentBytes: document?.bytes ?? null,
      }),
    );
    return this.get(row.id);
  }
  async update(id: string, input: unknown, document?: JobDocument) {
    const row = await this.get(id);
    if (document && row.documentName)
      throw new BadRequestException(
        'The original JD is preserved. Create another opportunity for a different document.',
      );
    const parsed = document ? await this.imports.parse(document) : null;
    const jdText = parsed?.source.text ?? row.jdText;
    // Older tracker clients may omit new import fields; preserve the saved sources.
    const inherited = {
      company: row.company,
      agency: row.agency,
      location: row.location,
      workMode: row.workMode,
      employmentType: row.employmentType,
      seniority: row.seniority,
      skills: row.skills,
      experience: row.experience,
      preferredSkills: row.preferredSkills,
      domain: row.domain,
      salary: row.salary,
      postText: row.postText,
      importReview: row.importReview,
    };
    const editable =
      input && typeof input === 'object' && !Array.isArray(input)
        ? { ...inherited, ...input }
        : input;
    const fields = validateOpportunity(editable, jdText);
    Object.assign(row, fields, { jdText });
    if (document)
      Object.assign(row, {
        documentName: document.fileName,
        documentType: document.mediaType,
        documentBytes: document.bytes,
      });
    await this.rows.save(row);
    return this.get(id);
  }
}
