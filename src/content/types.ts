/**
 * Generic learning content. The rhythm engine only knows about "a prompt the
 * player must recognise" and "an answer label that travels on the beat".
 * Flags -> country today; country -> capital, word -> translation, etc. later.
 */
export interface LearningItem {
  id: string;
  /** Answer label shown on the rhythm lane. */
  country: string;
  /** Key used by the pack's prompt renderer. */
  flagAsset: string;
  /** 1 (easy) .. 3 (hard). */
  difficulty: number;
  /** Teaching wave: group 1 is introduced first, group 2 later. */
  group: number;
}

export interface ContentPack {
  id: string;
  title: string;
  subtitle: string;
  items: LearningItem[];
  /** Markup of the thing to recognise (an SVG flag here). */
  renderPrompt(item: LearningItem): string;
  /** Text that lands on the beat. */
  answerLabel(item: LearningItem): string;
  byId(id: string): LearningItem;
}
