import type { Book } from '../types';

// High quality real covers via Open Library API (by ISBN) or direct official Google Books cover URLs
export const kaggleBooksDataset: Book[] = [
  // Fantasy
  {
    id: 'k1',
    title: 'The Hobbit',
    subtitle: 'Or There and Back Again',
    author: 'J.R.R. Tolkien',
    category: 'Fantasy',
    rating: 4.8,
    ratingsCount: 125400,
    pageCount: 310,
    publishedDate: '1937',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg',
    description: 'Bilbo Baggins, a hobbit enjoying his quiet life, is swept into an epic quest by Gandalf and thirteen dwarves to reclaim their mountain home from Smaug the dragon.',
    moods: ['epic', 'adventurous', 'wholesome'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k2',
    title: "Harry Potter and the Sorcerer's Stone",
    author: 'J.K. Rowling',
    category: 'Fantasy',
    rating: 4.9,
    ratingsCount: 245000,
    pageCount: 309,
    publishedDate: '1997',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780590353427-L.jpg',
    description: 'An orphaned boy discovers he is a wizard on his eleventh birthday and is invited to study at the magical Hogwarts School of Witchcraft and Wizardry.',
    moods: ['magical', 'adventurous', 'wholesome'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k3',
    title: 'The Name of the Wind',
    author: 'Patrick Rothfuss',
    category: 'Fantasy',
    rating: 4.7,
    ratingsCount: 78000,
    pageCount: 662,
    publishedDate: '2007',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780756404741-L.jpg',
    description: 'The tale of Kvothe, a magically gifted young man who grows to become the most notorious wizard his world has ever seen.',
    moods: ['atmospheric', 'epic', 'captivating'],
    infoLink: 'https://books.google.com'
  },

  // Sci-Fi
  {
    id: 'k4',
    title: 'Dune',
    author: 'Frank Herbert',
    category: 'Sci-Fi',
    rating: 4.7,
    ratingsCount: 95000,
    pageCount: 658,
    publishedDate: '1965',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg',
    description: 'Set on the desert planet Arrakis, Dune tells the story of Paul Atreides, who must navigate feudal interstellar politics, dangerous sandworms, and Fremen prophecies.',
    moods: ['epic', 'thought-provoking', 'tense'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k17',
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    category: 'Sci-Fi',
    rating: 4.8,
    ratingsCount: 91000,
    pageCount: 496,
    publishedDate: '2021',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780593135204-L.jpg',
    description: 'Ryland Grace is the sole survivor on a desperate, last-chance mission to save humanity from an interstellar disaster. He must remember who he is and solve the crisis.',
    moods: ['funny', 'thrilling', 'science-focused'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k16',
    title: 'Klara and the Sun',
    author: 'Kazuo Ishiguro',
    category: 'Sci-Fi',
    rating: 4.2,
    ratingsCount: 39000,
    pageCount: 303,
    publishedDate: '2021',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780593318171-L.jpg',
    description: 'Told from the perspective of Klara, an Artificial Friend with outstanding observational qualities, who watches shoppers and hopes to be chosen by a child.',
    moods: ['emotional', 'poetic', 'thought-provoking'],
    infoLink: 'https://books.google.com'
  },

  // Thriller & Mystery
  {
    id: 'k5',
    title: 'The Silent Patient',
    author: 'Alex Michaelides',
    category: 'Mystery & Thriller',
    rating: 4.5,
    ratingsCount: 64000,
    pageCount: 336,
    publishedDate: '2019',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9781250301697-L.jpg',
    description: 'Alicia Berenson’s life is seemingly perfect. Then one evening she shoots her husband five times in the face and never speaks another word.',
    moods: ['suspenseful', 'dark', 'twisty'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k6',
    title: 'Gone Girl',
    author: 'Gillian Flynn',
    category: 'Mystery & Thriller',
    rating: 4.4,
    ratingsCount: 89000,
    pageCount: 432,
    publishedDate: '2012',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780307588371-L.jpg',
    description: 'On their fifth wedding anniversary, Nick Dunne reports that his wife Amy has vanished. Under police and media pressure, their portrait of a happy marriage crumbles.',
    moods: ['dark', 'twisty', 'psychological'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k7',
    title: 'The Da Vinci Code',
    author: 'Dan Brown',
    category: 'Mystery & Thriller',
    rating: 4.3,
    ratingsCount: 110000,
    pageCount: 489,
    publishedDate: '2003',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780307474278-L.jpg',
    description: 'Symbologist Robert Langdon and cryptologist Sophie Neveu unravel a murder in the Louvre that leads to a secret society protecting an ancient religious secret.',
    moods: ['fast-paced', 'intense', 'suspenseful'],
    infoLink: 'https://books.google.com'
  },

  // Romance
  {
    id: 'k8',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    category: 'Romance',
    rating: 4.8,
    ratingsCount: 180000,
    pageCount: 279,
    publishedDate: '1813',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg',
    description: 'The romantic clash between the opinionated Elizabeth Bennet and the proud aristocratic landowner Fitzwilliam Darcy in 19th-century England.',
    moods: ['witty', 'romantic', 'classic'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k9',
    title: 'The Seven Husbands of Evelyn Hugo',
    author: 'Taylor Jenkins Reid',
    category: 'Romance',
    rating: 4.6,
    ratingsCount: 92000,
    pageCount: 389,
    publishedDate: '2017',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9781501161933-L.jpg',
    description: 'Aging and reclusive Hollywood movie icon Evelyn Hugo is finally ready to tell the truth about her glamorous and scandalous life.',
    moods: ['emotional', 'glamorous', 'bittersweet'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k10',
    title: 'Beach Read',
    author: 'Emily Henry',
    category: 'Romance',
    rating: 4.3,
    ratingsCount: 54000,
    pageCount: 361,
    publishedDate: '2020',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9781984806734-L.jpg',
    description: 'A romance writer who no longer believes in love and a literary writer stuck in a rut swap genres for one summer at neighboring beach houses.',
    moods: ['witty', 'heartwarming', 'cozy'],
    infoLink: 'https://books.google.com'
  },

  // Self-Help & Non-Fiction
  {
    id: 'k11',
    title: 'Atomic Habits',
    subtitle: 'An Easy & Proven Way to Build Good Habits & Break Bad Ones',
    author: 'James Clear',
    category: 'Self-Help',
    rating: 4.9,
    ratingsCount: 156000,
    pageCount: 320,
    publishedDate: '2018',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg',
    description: 'Clear presents a practical framework for improving every day by focusing on tiny 1% changes, habit stacking, and identity-based behavior change.',
    moods: ['inspiring', 'practical', 'transformative'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k12',
    title: 'Sapiens',
    subtitle: 'A Brief History of Humankind',
    author: 'Yuval Noah Harari',
    category: 'History & Science',
    rating: 4.7,
    ratingsCount: 142000,
    pageCount: 443,
    publishedDate: '2014',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg',
    description: 'Harari spans human history from the Cognitive Revolution to contemporary biology to explore how Homo sapiens conquered the planet.',
    moods: ['thought-provoking', 'informative', 'fascinating'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k13',
    title: 'Educated',
    author: 'Tara Westover',
    category: 'Biography & Memoir',
    rating: 4.7,
    ratingsCount: 88000,
    pageCount: 334,
    publishedDate: '2018',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780399590504-L.jpg',
    description: 'Born to survivalists in the mountains of Idaho, Tara Westover was 17 the first time she set foot in a classroom, eventually earning a PhD from Cambridge.',
    moods: ['inspiring', 'emotional', 'raw'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k14',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    category: 'Psychology',
    rating: 4.6,
    ratingsCount: 76000,
    pageCount: 499,
    publishedDate: '2011',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780374533557-L.jpg',
    description: 'Nobel laureate Daniel Kahneman explains the two systems that drive how we think: System 1 (fast/emotional) and System 2 (slow/logical).',
    moods: ['intellectual', 'thought-provoking', 'insightful'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k15',
    title: 'Deep Work',
    subtitle: 'Rules for Focused Success in a Distracted World',
    author: 'Cal Newport',
    category: 'Business & Technology',
    rating: 4.6,
    ratingsCount: 45000,
    pageCount: 304,
    publishedDate: '2016',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9781455586691-L.jpg',
    description: 'Cal Newport argues that the ability to focus without distraction is a superpower in our modern economy, providing actionable deep work rules.',
    moods: ['practical', 'motivating', 'focus-driven'],
    infoLink: 'https://books.google.com'
  },
  {
    id: 'k18',
    title: 'The House in the Cerulean Sea',
    author: 'TJ Klune',
    category: 'Fantasy',
    rating: 4.7,
    ratingsCount: 67000,
    pageCount: 396,
    publishedDate: '2020',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9781250217288-L.jpg',
    description: 'Linus Baker is a caseworker at the Department in Charge of Magical Youth sent to inspect a classified orphanage housing six unusual children.',
    moods: ['cozy', 'wholesome', 'heartwarming'],
    infoLink: 'https://books.google.com'
  }
];

export const DATASET_METADATA = {
  name: "Books Dataset - 15K+ Books Across 100+ Categories",
  source: "Kaggle (mihikaajayjadhav/books-dataset-15k-books-across-100-categories)",
  totalEntries: 15147,
  categoriesCount: 105
};
