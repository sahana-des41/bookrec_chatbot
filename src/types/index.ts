export interface Book {
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  category: string;
  description: string;
  coverImage: string;
  rating?: number;
  ratingsCount?: number;
  pageCount?: number;
  publishedDate?: string;
  previewLink?: string;
  infoLink?: string;
  moods: string[];
  romanceLevel?: 'low' | 'medium' | 'high';
  length?: 'short' | 'medium' | 'long';
  format?: 'standalone' | 'series';
}

export type Role = 'user' | 'bot';

export interface Message {
  id: string;
  role: Role;
  content: string;
  recommendations?: Book[];
}

export interface UserPreferences {
  category: string | null;
  mood: string | null;
  keywords: string[];
}

