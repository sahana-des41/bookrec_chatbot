import type { Book } from '../types';

export const mockBooks: Book[] = [
  {
    id: '1',
    title: 'The Invisible Life of Addie LaRue',
    author: 'V.E. Schwab',
    genre: 'Fantasy',
    description: 'A young woman makes a Faustian bargain to live forever but is cursed to be forgotten by everyone she meets.',
    coverImage: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=200&h=300&fit=crop',
    moods: ['emotional', 'bittersweet', 'atmospheric'],
    romanceLevel: 'medium',
    length: 'medium',
    format: 'standalone'
  },
  {
    id: '2',
    title: 'The Silent Patient',
    author: 'Alex Michaelides',
    genre: 'Thriller',
    description: 'A famous painter shoots her husband five times in the face and then never speaks another word.',
    coverImage: 'https://images.unsplash.com/photo-1614544048536-0d28caf77f41?q=80&w=200&h=300&fit=crop',
    moods: ['suspenseful', 'dark', 'twisty'],
    romanceLevel: 'low',
    length: 'medium',
    format: 'standalone'
  },
  {
    id: '3',
    title: 'Mistborn: The Final Empire',
    author: 'Brandon Sanderson',
    genre: 'Fantasy',
    description: 'A brilliant thief and a powerful street urchin plan a heist to overthrow a dark lord.',
    coverImage: 'https://images.unsplash.com/photo-1629196914283-cf2d212a4505?q=80&w=200&h=300&fit=crop',
    moods: ['action-packed', 'epic'],
    romanceLevel: 'low',
    length: 'long',
    format: 'series'
  },
  {
    id: '4',
    title: 'Beach Read',
    author: 'Emily Henry',
    genre: 'Romance',
    description: 'Two writers spend the summer in neighboring beach houses and challenge each other to write in the other\'s genre.',
    coverImage: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?q=80&w=200&h=300&fit=crop',
    moods: ['lighthearted', 'funny', 'emotional'],
    romanceLevel: 'high',
    length: 'medium',
    format: 'standalone'
  },
  {
    id: '5',
    title: 'The House in the Cerulean Sea',
    author: 'TJ Klune',
    genre: 'Fantasy',
    description: 'A magical island, a group of dangerous magical children, and a caseworker who learns what it means to be a family.',
    coverImage: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=200&h=300&fit=crop',
    moods: ['cozy', 'wholesome', 'emotional'],
    romanceLevel: 'low',
    length: 'medium',
    format: 'standalone'
  },
  {
    id: '6',
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    genre: 'Sci-Fi',
    description: 'An astronaut wakes up alone on a spaceship with amnesia and must save Earth from an extinction-level event.',
    coverImage: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=200&h=300&fit=crop',
    moods: ['funny', 'suspenseful', 'science-focused'],
    romanceLevel: 'low',
    length: 'medium',
    format: 'standalone'
  },
  {
    id: '7',
    title: 'A Court of Thorns and Roses',
    author: 'Sarah J. Maas',
    genre: 'Fantasy',
    description: 'A huntress is dragged into a magical realm and falls for a mysterious fae lord.',
    coverImage: 'https://images.unsplash.com/photo-1533613220915-609f661a6fe1?q=80&w=200&h=300&fit=crop',
    moods: ['action-packed', 'dramatic'],
    romanceLevel: 'high',
    length: 'medium',
    format: 'series'
  }
];
