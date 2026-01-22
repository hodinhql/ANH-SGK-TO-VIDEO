
export enum AspectRatio {
  SQUARE = '1:1',
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16'
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface Scene {
  id: string;
  title: string;
  narration: string;
  visualPrompt: string;
  imageUrl?: string;
  videoUrl?: string;
  status: GenerationStatus;
}

export interface TextbookScript {
  topic: string;
  scenes: Scene[];
}

export interface GeneratedImage {
  id: string;
  prompt: string;
  status: GenerationStatus;
  url?: string;
  error?: string;
  createdAt: number;
}

export interface GenerationSettings {
  aspectRatio: AspectRatio;
  quality: 'standard' | 'high';
}
