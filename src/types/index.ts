export interface Book {
  id: string;
  title: string;
  author: string;
  genre: string;
  description: string;
  coverImage: string;
  moods: string[];
  romanceLevel: 'low' | 'medium' | 'high';
  length: 'short' | 'medium' | 'long';
  format: 'standalone' | 'series';
}

export type Role = 'user' | 'bot';

export interface Message {
  id: string;
  role: Role;
  content: string;
  recommendations?: Book[];
}

export interface UserPreferences {
  genre: string | null;
  mood: string | null;
  romanceLevel: string | null;
  length: string | null;
  format: string | null;
  keywords: string[];
}
