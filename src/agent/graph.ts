import { StateGraph, START, END } from '@langchain/langgraph';
import type { Message, UserPreferences } from '../types';
import { mockBooks } from '../data/books';

// 1. Define the state for the graph
export interface ChatState {
  messages: Message[];
  preferences: UserPreferences;
  recommendationCount: number;
}

// Initial state builder
export const getInitialState = (): ChatState => ({
  messages: [],
  preferences: {
    genre: null,
    mood: null,
    romanceLevel: null,
    length: null,
    format: null,
    keywords: [],
  },
  recommendationCount: 0,
});

// Helper to simulate LLM keyword extraction (since we don't have a real LLM connected)
const extractKeywords = (text: string): Partial<UserPreferences> => {
  const lowerText = text.toLowerCase();
  const prefs: Partial<UserPreferences> = { keywords: [] };
  
  if (lowerText.includes('fantasy')) prefs.genre = 'Fantasy';
  else if (lowerText.includes('thriller') || lowerText.includes('mystery')) prefs.genre = 'Thriller';
  else if (lowerText.includes('romance')) prefs.genre = 'Romance';
  else if (lowerText.includes('sci-fi') || lowerText.includes('space')) prefs.genre = 'Sci-Fi';

  if (lowerText.includes('emotional') || lowerText.includes('sad')) prefs.mood = 'emotional';
  if (lowerText.includes('action') || lowerText.includes('exciting')) prefs.mood = 'action-packed';
  if (lowerText.includes('cozy') || lowerText.includes('wholesome')) prefs.mood = 'cozy';

  if (lowerText.includes('no romance') || lowerText.includes('low romance')) prefs.romanceLevel = 'low';
  if (lowerText.includes('spicy') || lowerText.includes('high romance')) prefs.romanceLevel = 'high';

  if (lowerText.includes('short')) prefs.length = 'short';
  if (lowerText.includes('long')) prefs.length = 'long';

  if (lowerText.includes('series')) prefs.format = 'series';
  if (lowerText.includes('standalone')) prefs.format = 'standalone';

  // Fallback keyword collection for simple scoring
  ['magic', 'murder', 'love', 'space', 'funny', 'dark'].forEach(kw => {
    if (lowerText.includes(kw)) {
      prefs.keywords = [...(prefs.keywords || []), kw];
    }
  });

  return prefs;
};

// 2. Define the nodes

// Node 1: Extract Preferences from the latest user message
const extractNode = (state: ChatState): Partial<ChatState> => {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage.role !== 'user') return {};

  const extracted = extractKeywords(lastMessage.content);
  
  // Merge new preferences with existing
  const newPreferences: UserPreferences = {
    ...state.preferences,
    genre: extracted.genre || state.preferences.genre,
    mood: extracted.mood || state.preferences.mood,
    romanceLevel: extracted.romanceLevel || state.preferences.romanceLevel,
    length: extracted.length || state.preferences.length,
    format: extracted.format || state.preferences.format,
    keywords: [...state.preferences.keywords, ...(extracted.keywords || [])],
  };

  return { preferences: newPreferences };
};

// Node 2: Ask a follow-up question
const askQuestionNode = (state: ChatState): Partial<ChatState> => {
  const p = state.preferences;
  let question = "Tell me more about what you like!";
  
  if (!p.genre) {
    question = "Do you have a favorite genre in mind? (like Fantasy, Thriller, Sci-Fi, or Romance)";
  } else if (!p.mood) {
    question = `A ${p.genre} book! Do you want something emotional, cozy, or action-packed?`;
  } else if (!p.format) {
    question = "Are you looking for a quick standalone or a long series to dive into?";
  }

  const newMessage: Message = {
    id: Date.now().toString(),
    role: 'bot',
    content: question
  };

  return {
    messages: [...state.messages, newMessage]
  };
};

// Node 3: Generate Recommendations
const recommendNode = (state: ChatState): Partial<ChatState> => {
  const p = state.preferences;
  
  // Simple scoring algorithm
  let scoredBooks = mockBooks.map(book => {
    let score = 0;
    let matchReasons: string[] = [];

    if (p.genre && book.genre.toLowerCase() === p.genre.toLowerCase()) {
      score += 3;
      matchReasons.push(`Matches your genre (${book.genre})`);
    }
    
    if (p.mood && book.moods.includes(p.mood)) {
      score += 2;
      matchReasons.push(`Fits the ${p.mood} mood`);
    }

    if (p.romanceLevel && book.romanceLevel === p.romanceLevel) {
      score += 1;
    }

    if (p.format && book.format === p.format) {
      score += 1;
    }

    // Default reason if no exact matches but still recommended
    if (matchReasons.length === 0) {
      matchReasons.push("Highly rated in our library");
    }

    return { book, score, reason: matchReasons.join(' and ') };
  });

  // Sort and pick top 3
  scoredBooks.sort((a, b) => b.score - a.score);
  const recommendations = scoredBooks.slice(0, 3).map(sb => ({
    ...sb.book,
    // Using a temporary hack to pass the match reason back.
    // In a real app we'd extend the Book type or return a Match object
    description: `${sb.book.description} \n\n*Why it matches: ${sb.reason}*`
  }));

  const newMessage: Message = {
    id: Date.now().toString(),
    role: 'bot',
    content: "Here are some books I think you'll love:",
    recommendations
  };

  return {
    messages: [...state.messages, newMessage],
    recommendationCount: state.recommendationCount + 1,
    // Reset preferences slightly to allow new searches without full clearing
    preferences: getInitialState().preferences 
  };
};

// 3. Define the edges / routing logic
const shouldRecommend = (state: ChatState): string => {
  const p = state.preferences;
  
  // We recommend if we have at least 2 key pieces of information,
  // or if the user explicitly says "surprise me" (handled here simply as a low threshold)
  const hasEnoughInfo = [p.genre, p.mood, p.format].filter(Boolean).length >= 2;
  const isSurprise = state.messages[state.messages.length - 1].content.toLowerCase().includes('surprise');
  
  if (hasEnoughInfo || isSurprise) {
    return 'recommend';
  }
  return 'ask_question';
};

// 4. Build the Graph
const workflow = new StateGraph<ChatState>({
  channels: {
    messages: {
      value: (x: Message[], y: Message[]) => x.concat(y),
      default: () => [],
    },
    preferences: {
      value: (_x: UserPreferences, y: UserPreferences) => y, // overwrite
      default: () => getInitialState().preferences,
    },
    recommendationCount: {
      value: (_x: number, y: number) => y,
      default: () => 0,
    }
  }
})
  .addNode("extract", extractNode)
  .addNode("ask_question", askQuestionNode)
  .addNode("recommend", recommendNode)
  
  .addEdge(START, "extract")
  .addConditionalEdges("extract", shouldRecommend)
  .addEdge("ask_question", END)
  .addEdge("recommend", END);

// Export the compiled graph
export const app = workflow.compile();
