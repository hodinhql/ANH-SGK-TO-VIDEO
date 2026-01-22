
import { GoogleGenAI, Type } from "@google/genai";
import { AspectRatio, TextbookScript } from "../types";

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const analyzeTextbook = async (content: string, imageBase64?: string, isDirectScript: boolean = false): Promise<TextbookScript> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const systemInstruction = isDirectScript 
    ? `Bạn là một chuyên gia tối ưu hóa kịch bản hình ảnh. Người dùng đã cung cấp kịch bản. 
       Nhiệm vụ: 
       1. Giữ nguyên ý tưởng các phân cảnh người dùng đưa ra. 
       2. Với mỗi phân cảnh, tạo một 'visualPrompt' bằng TIẾNG ANH cực kỳ chi tiết (phong cách 3D Disney/Pixar, ánh sáng volumetric, cực nét).
       3. Nếu kịch bản quá ngắn, hãy chia nhỏ thành 4 cảnh dựa trên nội dung đó.`
    : `Bạn là một biên kịch video giáo dục chuyên nghiệp. 
       Nhiệm vụ: Phân tích nội dung sau và chia thành 4 phân cảnh kịch bản.
       Yêu cầu:
       1. Mỗi cảnh có tiêu đề tiếng Việt và lời dẫn (narration) tiếng Việt.
       2. Tạo 'visualPrompt' bằng TIẾNG ANH mô tả chi tiết hình ảnh phong cách giáo dục 3D chuyên nghiệp.`;

  const parts: any[] = [{ 
    text: `${systemInstruction}
    Nội dung đầu vào: ${content}` 
  }];

  if (imageBase64) {
    parts.unshift({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64.split(',')[1] || imageBase64
      }
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                narration: { type: Type.STRING },
                visualPrompt: { type: Type.STRING }
              },
              required: ["title", "narration", "visualPrompt"]
            }
          }
        },
        required: ["topic", "scenes"]
      }
    }
  });

  const rawJson = JSON.parse(response.text || '{}');
  return {
    topic: rawJson.topic || "Kịch bản tùy chỉnh",
    scenes: (rawJson.scenes || []).map((s: any) => ({
      ...s,
      id: Math.random().toString(36).substr(2, 9),
      status: 'IDLE'
    }))
  };
};

export const generateImage = async (
  prompt: string, 
  aspectRatio: AspectRatio, 
  quality: 'standard' | 'high'
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const modelName = quality === 'high' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

  const response = await ai.models.generateContent({
    model: modelName,
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
        ...(quality === 'high' ? { imageSize: '1K' } : {})
      }
    }
  });

  let imageUrl = '';
  if (response.candidates && response.candidates[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }
  }
  if (!imageUrl) throw new Error("AI không trả về ảnh.");
  return imageUrl;
};

export const generateVideoClip = async (prompt: string, imageBase64?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `Cinematic 3D animation style: ${prompt}`,
    ...(imageBase64 ? {
      image: {
        imageBytes: imageBase64.split(',')[1] || imageBase64,
        mimeType: 'image/jpeg'
      }
    } : {}),
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await delay(10000);
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Không lấy được link video.");
  
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
