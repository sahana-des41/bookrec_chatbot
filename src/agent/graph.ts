import { StateGraph, START, END } from '@langchain/langgraph';
import type { Message, UserPreferences, Book } from '../types';
import { kaggleBooksDataset, DATASET_METADATA } from '../data/books';

export interface ChatState {
  messages: Message[];
  preferences: UserPreferences;
  recommendationCount: number;
}

export const getInitialState = (): ChatState => ({
  messages: [],
  preferences: {
    category: null,
    mood: null,
    keywords: [],
  },
  recommendationCount: 0,
});

const extractKeywords = (text: string): Partial<UserPreferences> => {
  const lowerText = text.toLowerCase();
  const prefs: Partial<UserPreferences> = { keywords: [] };
  
  if (lowerText.includes('fantasy') || lowerText.includes('magic') || lowerText.includes('wizard')) prefs.category = 'Fantasy';
  else if (lowerText.includes('thriller') || lowerText.includes('mystery') || lowerText.includes('crime') || lowerText.includes('murder')) prefs.category = 'Mystery & Thriller';
  else if (lowerText.includes('romance') || lowerText.includes('love') || lowerText.includes('relationship')) prefs.category = 'Romance';
  else if (lowerText.includes('sci-fi') || lowerText.includes('space') || lowerText.includes('scifi') || lowerText.includes('future')) prefs.category = 'Sci-Fi';
  else if (lowerText.includes('self-help') || lowerText.includes('habit') || lowerText.includes('productivity') || lowerText.includes('growth')) prefs.category = 'Self-Help';
  else if (lowerText.includes('history') || lowerText.includes('science') || lowerText.includes('non-fiction') || lowerText.includes('nonfiction')) prefs.category = 'History & Science';
  else if (lowerText.includes('memoir') || lowerText.includes('biography')) prefs.category = 'Biography & Memoir';
  else if (lowerText.includes('psychology') || lowerText.includes('mind')) prefs.category = 'Psychology';
  else if (lowerText.includes('business') || lowerText.includes('work') || lowerText.includes('tech')) prefs.category = 'Business & Technology';

  if (lowerText.includes('emotional') || lowerText.includes('sad') || lowerText.includes('touching') || lowerText.includes('deep')) prefs.mood = 'emotional';
  else if (lowerText.includes('epic') || lowerText.includes('exciting') || lowerText.includes('thrilling') || lowerText.includes('adventurous')) prefs.mood = 'epic';
  else if (lowerText.includes('cozy') || lowerText.includes('wholesome') || lowerText.includes('light') || lowerText.includes('warm')) prefs.mood = 'cozy';
  else if (lowerText.includes('dark') || lowerText.includes('suspenseful') || lowerText.includes('twisty')) prefs.mood = 'suspenseful';
  else if (lowerText.includes('inspiring') || lowerText.includes('motivating')) prefs.mood = 'inspiring';
  else if (lowerText.includes('thought-provoking') || lowerText.includes('intellectual')) prefs.mood = 'thought-provoking';

  const commonKeywords = ['habit', 'dragon', 'space', 'murder', 'love', 'focus', 'mind', 'wizard', 'secret', 'history'];
  commonKeywords.forEach(kw => {
    if (lowerText.includes(kw)) {
      prefs.keywords = [...(prefs.keywords || []), kw];
    }
  });

  return prefs;
};

const extractNode = (state: ChatState): Partial<ChatState> => {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage.role !== 'user') return {};

  const extracted = extractKeywords(lastMessage.content);
  
  const newPreferences: UserPreferences = {
    ...state.preferences,
    category: extracted.category || state.preferences.category,
    mood: extracted.mood || state.preferences.mood,
    keywords: Array.from(new Set([...state.preferences.keywords, ...(extracted.keywords || [])])),
  };

  return { preferences: newPreferences };
};

const askQuestionNode = (state: ChatState): Partial<ChatState> => {
  const p = state.preferences;
  let responseText = "I'm curating recommendations directly from the Kaggle 15K+ Books dataset! ";
  
  if (!p.category && !p.mood) {
    responseText += "What category or genre are you interested in today? We have Fantasy, Sci-Fi, Thrillers, Romance, Self-Help, Psychology, and more.";
  } else if (p.category && !p.mood) {
    responseText += `Great choice! For ${p.category} books, what kind of vibe or mood are you looking for? (e.g., epic, cozy, emotional, thrilling, or thought-provoking)`;
  } else {
    responseText += "Would you like something light and quick, or an epic masterpiece?";
  }

  const newMessage: Message = {
    id: Date.now().toString(),
    role: 'bot',
    content: responseText
  };

  return {
    messages: [...state.messages, newMessage]
  };
};

const recommendNode = (state: ChatState): Partial<ChatState> => {
  const p = state.preferences;
  const lastUserMsg = state.messages[state.messages.length - 1]?.content.toLowerCase() || '';

  let scoredBooks = kaggleBooksDataset.map(book => {
    let score = 0;
    let matchReasons: string[] = [];

    if (p.category && book.category.toLowerCase().includes(p.category.toLowerCase())) {
      score += 4;
      matchReasons.push(`Matches category: ${book.category}`);
    }
    
    if (p.mood && book.moods.some(m => m.toLowerCase() === p.mood?.toLowerCase())) {
      score += 3;
      matchReasons.push(`Fits your ${p.mood} mood`);
    }

    p.keywords.forEach(kw => {
      if (book.title.toLowerCase().includes(kw) || book.description.toLowerCase().includes(kw)) {
        score += 2;
      }
    });

    if (book.rating && book.rating >= 4.5) {
      score += 1;
    }

    if (matchReasons.length === 0) {
      matchReasons.push(`Popular choice in Kaggle dataset (${DATASET_METADATA.name})`);
    }

    return { book, score, reason: matchReasons.join(' • ') };
  });

  scoredBooks.sort((a, b) => b.score - a.score || (b.book.rating || 0) - (a.book.rating || 0));
  
  const selected = scoredBooks.slice(0, 3);

  const recommendations: Book[] = selected.map(sb => ({
    ...sb.book,
    description: `${sb.book.description}\n\n*Why it matches: ${sb.reason}*`
  }));

  let messageText = `Here are 3 top recommendations sourced from the **${DATASET_METADATA.name}**:`;
  if (p.category) {
    messageText = `Based on your request for **${p.category}**${p.mood ? ` with a **${p.mood}** vibe` : ''}, here are curated picks from our 15,000+ Kaggle book index:`;
  } else if (lastUserMsg.includes('surprise')) {
    messageText = `Here is a special selection of high-rated gems from our 15K Kaggle dataset:`;
  }

  const newMessage: Message = {
    id: Date.now().toString(),
    role: 'bot',
    content: messageText,
    recommendations
  };

  return {
    messages: [...state.messages, newMessage],
    recommendationCount: state.recommendationCount + 1,
    preferences: getInitialState().preferences 
  };
};

const shouldRecommend = (state: ChatState): string => {
  const p = state.preferences;
  const lastMsg = state.messages[state.messages.length - 1]?.content.toLowerCase() || '';
  
  const hasCategoryOrMood = Boolean(p.category || p.mood);
  const isDirectRequest = lastMsg.includes('recommend') || lastMsg.includes('book') || lastMsg.includes('surprise') || lastMsg.includes('give me') || lastMsg.includes('suggest');
  
  if (hasCategoryOrMood || isDirectRequest) {
    return 'recommend';
  }
  return 'ask_question';
};

const workflow = new StateGraph<ChatState>({
  channels: {
    messages: {
      value: (x: Message[], y: Message[]) => x.concat(y),
      default: () => [],
    },
    preferences: {
      value: (_x: UserPreferences, y: UserPreferences) => y,
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

export const app = workflow.compile();
