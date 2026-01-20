
import { GoogleGenAI, Type } from "@google/genai";
import { RecipeData } from "../types";

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
      description: "List of required ingredients"
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
          imagePrompt: { type: Type.STRING, description: "A simple prompt for a hand-drawn watercolor style illustration of this step. Mention specific ingredients/tools involved." }
        },
        required: ["stepNumber", "description", "imagePrompt"]
      }
    }
  },
  required: ["itemName", "description", "prepTime", "servings", "calories", "ingredients", "tools", "steps"]
};

export const analyzeInput = async (input: string | File): Promise<RecipeData> => {
  const ai = getAI();
  const model = 'gemini-3-pro-preview';
  
  let content;
  if (typeof input === 'string') {
    content = {
      contents: [{ parts: [{ text: `Analyze this dessert, beverage, or coffee: "${input}". Identify the item and provide a detailed recipe in JSON format.` }] }]
    };
  } else {
    const base64Data = await fileToBase64(input);
    content = {
      contents: [{
        parts: [
          { inlineData: { data: base64Data, mimeType: input.type } },
          { text: "Identify this dessert, beverage, or coffee from the image and provide a detailed recipe in JSON format." }
        ]
      }]
    };
  }

  // ai.models.generateContent is used directly to query GenAI with both model and prompt.
  const response = await ai.models.generateContent({
    model,
    contents: content.contents[0],
    config: {
      responseMimeType: "application/json",
      responseSchema: recipeSchema,
      systemInstruction: "You are an expert culinary AI. Provide accurate recipes. For imagePrompt fields, describe a 'hand-drawn baked sweet vector illustration' style, like a watercolor painting on white paper. Focus on minimalist but charming details."
    }
  });

  // Access the text property directly without calling it as a method.
  if (!response.text) throw new Error("Could not parse recipe data");
  return JSON.parse(response.text);
};

export const generateStepIllustration = async (prompt: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: `${prompt}. Style: Hand-drawn, watercolor painting, minimalist vector, on clean white paper background, soft pastel colors, professional food illustration.` }]
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
