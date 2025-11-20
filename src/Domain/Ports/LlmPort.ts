export type LlmParams = {
  prompt: string;
};

export type LlmResponse = {
  description?: string;
  frontmatter?: Record<string, unknown>;
};

export type StreamBriefParams = {
  prompt: string;
};

export interface LlmPort {
  requestEnrichment(params: LlmParams): Promise<LlmResponse | null>;
  requestStreamBrief(params: StreamBriefParams): Promise<string | null>;
}
