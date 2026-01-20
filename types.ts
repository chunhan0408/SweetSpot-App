
export interface RecipeStep {
  stepNumber: number;
  description: string;
  imagePrompt: string;
}

export interface RecipeData {
  itemName: string;
  description: string;
  prepTime: string;
  servings: string;
  calories: string;
  ingredients: string[];
  tools: string[];
  steps: RecipeStep[];
}

export interface IllustrationState {
  [key: number]: {
    url: string | null;
    loading: boolean;
    error: string | null;
  };
}

export type ProficiencyLevel = 'Beginner' | 'Intermediate' | 'Professional';

export interface ProficiencyLevels {
  dessert: ProficiencyLevel;
  beverage: ProficiencyLevel;
  coffee: ProficiencyLevel;
}

export interface DiaryEntry {
  id: string;
  photo: string;
  text: string;
  date: string;
}

export interface UserProfile {
  avatar: string | null;
  levels: ProficiencyLevels;
  diaries: DiaryEntry[];
}
