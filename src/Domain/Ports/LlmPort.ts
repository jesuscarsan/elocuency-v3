export type LlmParams = {
  title: string;
  templateLabel: string;
  currentFrontmatter: Record<string, unknown> | null;
};

export type LlmResponse = {
  description?: string;
  frontmatter?: Record<string, unknown>;
};

export interface LlmPort {
  requestEnrichment(params: LlmParams): Promise<LlmResponse | null>;
}
