// Anthropic (offre premium seulement, si ANTHROPIC_API_KEY existe) : SDK officiel @anthropic-ai/sdk.
// Le client est injectable pour les tests (objets simulés) ; en production il est créé à la demande.
import { toAnthropicTools } from './tools.ts';
import { LlmError, parseArgs, type ChatRequest, type ChatResult, type LlmMessage, type LlmProvider } from './types.ts';

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';
const SDK = 'npm:@anthropic-ai/sdk@0.137.0';

/** Bloc de contenu tel que renvoyé par l'API (texte, appel d'outil, réflexion, bascule de modèle…). */
export interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  [key: string]: unknown;
}

interface AnthropicResponse {
  model: string;
  content: AnthropicBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

/** Partie du client SDK utilisée ici (client.beta.messages.create). */
export interface AnthropicClientLike {
  beta: { messages: { create(params: Record<string, unknown>): Promise<AnthropicResponse> } };
}

type AnthropicContent = string | AnthropicBlock[];

/** Conversion de l'historique neutre ; les blocs bruts d'Anthropic (dont la réflexion) sont renvoyés tels quels. */
export function toAnthropicMessages(messages: LlmMessage[]): { role: 'user' | 'assistant'; content: AnthropicContent }[] {
  const out: { role: 'user' | 'assistant'; content: AnthropicContent }[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      if (m.rawProvider === 'anthropic' && Array.isArray(m.raw)) out.push({ role: 'assistant', content: m.raw as AnthropicBlock[] });
      else {
        const blocks: AnthropicBlock[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.arguments });
        out.push({ role: 'assistant', content: blocks.length ? blocks : '' });
      }
    } else {
      // Tous les résultats d'outils d'un tour vont dans un seul message utilisateur.
      const block: AnthropicBlock = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content, ...(m.isError ? { is_error: true } : {}) };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) last.content.push(block);
      else out.push({ role: 'user', content: [block] });
    }
  }
  return out;
}

export function parseAnthropicResponse(r: AnthropicResponse): ChatResult {
  const text = r.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  const toolCalls = r.content
    .filter((b) => b.type === 'tool_use')
    .map((b, i) => ({ id: b.id ?? `toolu_${i}`, name: b.name ?? '', arguments: parseArgs(b.input) }));
  return {
    text,
    toolCalls,
    usage: { inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0 },
    provider: 'anthropic',
    model: r.model,
    raw: r.content,
    refusal: r.stop_reason === 'refusal',
  };
}

export function makeAnthropic(opts: { apiKey: string; model?: string; client?: AnthropicClientLike }): LlmProvider {
  const model = opts.model || ANTHROPIC_DEFAULT_MODEL;
  let client: AnthropicClientLike | undefined = opts.client;
  const getClient = async (): Promise<AnthropicClientLike> => {
    if (!client) {
      const mod = await import(SDK);
      const Anthropic = mod.default as new (o: { apiKey: string }) => AnthropicClientLike;
      client = new Anthropic({ apiKey: opts.apiKey });
    }
    return client;
  };
  return {
    name: 'anthropic',
    model,
    async chat(req: ChatRequest): Promise<ChatResult> {
      const c = await getClient();
      try {
        const res = await c.beta.messages.create({
          model,
          max_tokens: 16000,
          system: req.system,
          messages: toAnthropicMessages(req.messages),
          ...(req.tools?.length ? { tools: toAnthropicTools(req.tools), tool_choice: { type: 'auto' } } : {}),
          // Réflexion adaptative (toujours active sur ce modèle) ; effort explicite pour une assistante de planification.
          output_config: { effort: 'medium' },
          // Repli côté serveur : en cas de refus, l'API relance la même requête sur un autre modèle.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });
        return parseAnthropicResponse(res);
      } catch (e) {
        const status = typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : undefined;
        throw new LlmError(`Anthropic : ${e instanceof Error ? e.message : String(e)}`, 'anthropic', status);
      }
    },
  };
}
