
import { GoogleGenAI, Type } from "@google/genai";
import { RecipeData, ProficiencyLevel } from "./types";

// Always use a named parameter for apiKey and strictly use process.env.API_KEY.
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const recipeSchema = {
  type: Type.OBJECT,
  properties: {
    itemName: { type: Type.STRING, description: "Name of the food or drink item" },
    description: { type: Type.STRING, description: "Short appetizing description" },
    prepTime: { type: Type.STRING, description: "Preparation time, e.g., '32 MINS'" },
    servings: { type: Type.STRING, description: "Number of people, e.g., '2 PEOPLE'" },
    calories: { type: Type.STRING, description: "Calories per serving, e.g., '230 CALORIES'" },
    ingredients: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of required ingredients, scaled to the requested servings and size"
    },
    tools: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of required kitchen tools"
    },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stepNumber: { type: Type.INTEGER },
          description: { type: Type.STRING },
          imagePrompt: { type: Type.STRING, description: "A simple prompt for a hand-drawn watercolor style illustration of this step." }
        },
        required: ["stepNumber", "description", "imagePrompt"]
      }
    }
  },
  required: ["itemName", "description", "prepTime", "servings", "calories", "ingredients", "tools", "steps"]
};

export const analyzeInput = async (input: string | File, proficiency: ProficiencyLevel, servings: number, size?: string): Promise<RecipeData> => {
  const ai = getAI();
  const model = 'gemini-3-pro-preview';
  
  let content;
  const sizeContext = size ? ` Scale the ingredients for a ${size} cup size per serving.` : '';
  const levelContext = `The user is at a "${proficiency}" level. Scale the recipe for ${servings} people.${sizeContext} ${
    proficiency === 'Beginner' ? 'Provide simple, detailed steps and common ingredients.' : 
    proficiency === 'Professional' ? 'Use technical terminology and advanced techniques.' : 
    'Provide a standard, high-quality recipe.'
  }`;

  if (typeof input === 'string') {
    content = {
      contents: [{ parts: [{ text: `Analyze this sweet: "${input}". ${levelContext} Identify and provide recipe JSON.` }] }]
    };
  } else {
    const base64Data = await fileToBase64(input);
    content = {
      contents: [{
        parts: [
          { inlineData: { data: base64Data, mimeType: input.type } },
          { text: `Identify this sweet from the image. ${levelContext} Provide recipe JSON.` }
        ]
      }]
    };
  }

  const response = await ai.models.generateContent({
    model,
    contents: content.contents[0],
    config: {
      responseMimeType: "application/json",
      responseSchema: recipeSchema,
      systemInstruction: "You are an expert culinary AI. Provide accurate recipes. For imagePrompt, describe a subject ISOLATED ON A PURE WHITE BACKGROUND, hand-drawn watercolor style."
    }
  });

  if (!response.text) throw new Error("Could not parse recipe data");
  return JSON.parse(response.text);
};

export const generateHeroImage = async (itemName: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: `A professional, appetizing, high-resolution food photograph of ${itemName}. Gourmet presentation, soft natural sunlight, shallow depth of field, minimalist aesthetic, clean tabletop background.` }]
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      }
    }
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Hero image failed.");
};

export const generateStepIllustration = async (prompt: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: `${prompt}. Style: Hand-drawn watercolor, vector, ISOLATED ON PURE WHITE BACKGROUND, NO BACKGROUND elements, soft pastel colors.` }]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No illustration could be generated.");
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64String = result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};
