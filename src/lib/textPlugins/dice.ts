import { MATERIALS, FONTS, seededRandom, type LetterDesign, type LetterMark, type MarkKind } from '../letterpress/model';
import { DIALOGUE_LAYOUTS, type DialogueStyle } from '../dialogue/model';

export const LETTER_LOCKS = { material: '介质', font: '字体', format: '画幅', layout: '排版', marks: '痕迹', texture: '纹理' } as const;
export type LetterLocks = Partial<Record<keyof typeof LETTER_LOCKS, boolean>>;
export const DIALOGUE_LOCKS = { layout: '形式', font: '字体', density: '间距' } as const;

export function rollLetter(design: LetterDesign, seed: number, locks: LetterLocks = {}): LetterDesign {
  const random = seededRandom(seed), pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  // Generate every candidate before applying locks, so one lock never changes another draw.
  const material = pick(Object.keys(MATERIALS) as LetterDesign['material'][]), font = pick(Object.keys(FONTS) as LetterDesign['font'][]);
  const format = pick(['portrait', 'square', 'tall'] as const);
  const layout = { fontSize: pick([28, 30, 32, 34, 36]), lineHeight: pick([1.65, 1.8, 1.95, 2.1]), inset: pick([80, 100, 120]), align: pick(['left', 'left', 'center', 'right'] as const) };
  const marks: LetterMark[] = Array.from({ length: Math.floor(random() * 4) }, (_, index) => ({
    id: `dice-${seed >>> 0}-${index}`, kind: pick<MarkKind>(['stain', 'stain', 'burn', 'tear', 'blood']), pattern: pick(['drops', 'spray', 'smear'] as const),
    x: pick([.04, .96]), y: .08 + random() * .84, size: .06 + random() * .12, angle: Math.round(random() * 360 - 180) || 0, strength: .15 + random() * .25,
    seed: Math.floor(random() * 4294967296),
  }));
  const texture = Math.floor(random() * 4294967296);
  return { ...design, ...(!locks.material && { material }), ...(!locks.font && { font }), ...(!locks.format && { format }),
    ...(!locks.layout && layout), ...(!locks.marks && { marks }), ...(!locks.texture && { seed: texture }) };
}

export function rollDialogue(style: DialogueStyle, seed: number, locks: Partial<Record<keyof DialogueStyle, boolean>> = {}): DialogueStyle {
  const random = seededRandom(seed), pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];
  const candidate: DialogueStyle = { layout: pick(Object.keys(DIALOGUE_LAYOUTS) as DialogueStyle['layout'][]), font: pick(Object.keys(FONTS) as DialogueStyle['font'][]), density: pick(['compact', 'relaxed']) };
  return { layout: locks.layout ? style.layout : candidate.layout, font: locks.font ? style.font : candidate.font, density: locks.density ? style.density : candidate.density };
}
