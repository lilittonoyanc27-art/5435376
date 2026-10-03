export type TenseType = 'Presente' | 'Pretérito Perfecto' | 'Presente + Pretérito Perfecto';

export type CategoryType = 'cine' | 'tienda' | 'camino' | 'supermercado';

export interface OptionItem {
  id: 'A' | 'B' | 'C' | 'D';
  es: string;
  ru: string;
}

export interface QuestionData {
  id: number;
  category: CategoryType;
  categoryTitleEs: string;
  categoryTitleRu: string;
  tense: TenseType;
  tenseExplanationRu: string;
  questionEs: string;
  questionRu: string;
  options: OptionItem[];
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanationRu: string;
  prizeMoney: number;
}

export type GameMode = 'ladder' | 'marathon' | 'category';

export interface LifelinesState {
  fiftyFiftyUsed: boolean;
  phoneFriendUsed: boolean;
  askAudienceUsed: boolean;
}

export interface FriendAdvice {
  friendName: string;
  confidence: number;
  messageEs: string;
  messageRu: string;
  suggestedAnswer: 'A' | 'B' | 'C' | 'D';
}

export interface AudienceStats {
  A: number;
  B: number;
  C: number;
  D: number;
}
