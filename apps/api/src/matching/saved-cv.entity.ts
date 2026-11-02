import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'ai_job_hunter', name: 'saved_cvs' })
export class SavedCv {
  @PrimaryColumn({ type: 'uuid' }) ownerId!: string;
  @Column({ type: 'text' }) fileName!: string;
  @Column({ type: 'text', select: false }) text!: string;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
