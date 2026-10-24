export const AI_PROVIDER = Symbol('AI_PROVIDER');

// Application-owned JSON Schema; validated at runtime before transport.
export type OutputSchema = Readonly<Record<string, unknown>>;
export interface GenerationRequest {
  readonly prompt: string;
  readonly schema: OutputSchema;
}
export interface AiProvider {
  generate(request: GenerationRequest): Promise<string>;
}
