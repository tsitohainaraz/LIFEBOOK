// Interface commune à tous les fournisseurs d'IA (Groq, OpenRouter, Anthropic).

export type JsonSchema = { [key: string]: unknown };

/** Outil décrit une seule fois, dans un format neutre (converti pour chaque fournisseur). */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type LlmMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      toolCalls?: ToolCall[];
      /** Contenu brut du fournisseur, renvoyé tel quel au tour suivant (ex. blocs Anthropic). */
      raw?: unknown;
      rawProvider?: string;
    }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

export interface ChatRequest {
  system: string;
  messages: LlmMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
  /** Ignoré par les fournisseurs qui ne l'acceptent pas (Anthropic). */
  temperature?: number;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  provider: string;
  model: string;
  /** Contenu brut de la réponse, à remettre dans l'historique pour un nouveau tour d'outils. */
  raw?: unknown;
  /** Le modèle a refusé de répondre (refus de sécurité). */
  refusal?: boolean;
}

export interface LlmProvider {
  name: string;
  model: string;
  chat(req: ChatRequest): Promise<ChatResult>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }

  /** 429, 5xx ou erreur réseau : on peut essayer le fournisseur de secours. */
  get retryable(): boolean {
    return this.status === undefined || this.status === 429 || this.status >= 500;
  }
}

/** Lecture sûre des arguments JSON d'un appel d'outil. */
export function parseArgs(text: unknown): Record<string, unknown> {
  if (text && typeof text === 'object') return text as Record<string, unknown>;
  if (typeof text !== 'string' || !text.trim()) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
