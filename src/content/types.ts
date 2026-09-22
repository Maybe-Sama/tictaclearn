/**
 * Generic learning content. The rhythm engine only knows about "a prompt the
 * player must recognise" and "an answer label that travels on the beat".
 * Flags -> country, country -> capital today; word -> translation, etc. later.
 */
export interface LearningItem {
  id: string;
  /** Country name (shown as the answer in Banderas, as the caption in Capitales). */
  country: string;
  /** Answer label when it differs from the country (e.g. the capital). */
  answer?: string;
  /** Tempting wrong answers that belong to this item (e.g. SÍDNEY for Australia). */
  decoys?: string[];
  /** Key used by the pack's prompt renderer. */
  flagAsset: string;
  /** 1 (easy) .. 3 (hard). */
  difficulty: number;
  /** Teaching wave: group 1 first, group 2 later, group 3 = Groove 2. */
  group: number;
}

export type LevelId = 1 | 2;

export interface LevelDef {
  /** e.g. "BEAT 2 · TRAMPAS" */
  name: string;
  items: string[];
  /** Which hand-written teaching section opens Groove 2. */
  intro?: 'twins' | 'traps';
  mixTitle?: string;
  mixSub?: string;
  finalSub?: string;
}

export interface ContentPack {
  id: string;
  title: string;
  /** Menu label, e.g. "Banderas". */
  subtitle: string;
  items: LearningItem[];
  levels: Record<LevelId, LevelDef>;
  /** Plural noun for results: "banderas", "capitales". */
  noun: string;
  /** What you hit: "país", "capital". */
  answerNoun: string;
  /** One-line rule shown in the menu. */
  rule: string;
  /** Markup of the thing to recognise (an SVG flag here). */
  renderPrompt(item: LearningItem): string;
  /** Optional text stuck under the prompt (the country name in Capitales). */
  promptCaption?(item: LearningItem): string;
  /** Text that lands on the beat. */
  answerLabel(item: LearningItem): string;
  byId(id: string): LearningItem;
}
