import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type { Message, UserPreferences, Book } from '../types';
import { kaggleBooksDataset } from '../data/books';

export interface ChatState {
  messages: Message[];
  preferences: UserPreferences;
  recommendationCount: number;
  recommendedBookIds: string[];
  rejectedBookIds: string[];
}

export const getInitialState = (): ChatState => ({
  messages: [],
  preferences: {
    category: null,
    mood: null,
    keywords: [],
    genres: [],
    themes: [],
    tone: [],
    characterPreferences: [],
    preferredLength: undefined,
    dislikedGenres: [],
    dislikedThemes: [],
    favoriteAuthors: [],
    favoriteBooks: [],
    preferredRating: undefined,
    otherPreferences: []
  },
  recommendationCount: 0,
  recommendedBookIds: [],
  rejectedBookIds: [],
});

const getGeminiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_google_ai_studio_api_key_here')) return null;
  return new GoogleGenAI({ apiKey });
};

// Fallback rule-based parsing in case API fails or key is missing
const fallbackExtractKeywords = (text: string, current: UserPreferences): UserPreferences => {
  const lowerText = text.toLowerCase();
  const updated = { ...current };

  if (lowerText.includes('fantasy') || lowerText.includes('magic')) {
    updated.category = 'Fantasy';
    updated.genres = Array.from(new Set([...(updated.genres || []), 'fantasy']));
  }
  if (lowerText.includes('thriller') || lowerText.includes('mystery')) {
    updated.category = 'Mystery & Thriller';
    updated.genres = Array.from(new Set([...(updated.genres || []), 'mystery', 'thriller']));
  }
  if (lowerText.includes('romance') || lowerText.includes('love')) {
    updated.category = 'Romance';
    updated.genres = Array.from(new Set([...(updated.genres || []), 'romance']));
  }
  if (lowerText.includes('short') || lowerText.includes('weekend')) {
    updated.preferredLength = 'short';
  }

  // extract simple keywords
  const words = lowerText.split(/\s+/).filter(w => w.length > 4);
  updated.keywords = Array.from(new Set([...updated.keywords, ...words]));

  return updated;
};

// Node: Extract structured preferences from conversation history using Gemini
export const extractNode = async (state: ChatState): Promise<Partial<ChatState>> => {
  const ai = getGeminiClient();
  if (!ai) {
    const lastUserMsg = state.messages[state.messages.length - 1]?.content || '';
    return { preferences: fallbackExtractKeywords(lastUserMsg, state.preferences) };
  }

  try {
    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        genres: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of liked book genres/categories mentioned or implied (e.g. fantasy, romance, mystery, self-help, etc.)"
        },
        themes: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Themes or plot elements (e.g. magic, wizard, habit, space, strong female protagonist)"
        },
        tone: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Tone/mood (e.g. dark, emotional, light, funny, exciting, twisty)"
        },
        characterPreferences: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Preferences regarding characters (e.g. strong female protagonist, anti-hero)"
        },
        preferredLength: {
          type: Type.STRING,
          enum: ["short", "medium", "long"],
          description: "Preferred length of the book"
        },
        dislikedGenres: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Genres the user explicitly wants to avoid or does not like"
        },
        dislikedThemes: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Themes or tropes the user wants to avoid"
        },
        favoriteAuthors: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        favoriteBooks: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        otherPreferences: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Any other positive search preferences"
        }
      }
    };

    // We pass the conversation context to extract the running model of preferences
    const historyContext = state.messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const prompt = `Given the conversation history, analyze the user's running search preferences. Update the accumulated preferences accordingly. Return ONLY a JSON object matching the requested schema.

Conversation History:
${historyContext}

Current state of preferences before this turn:
${JSON.stringify(state.preferences, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text);
      
      // Merge preferences carefully
      const newPrefs: UserPreferences = {
        category: parsed.genres?.[0] ? parsed.genres[0] : state.preferences.category,
        mood: parsed.tone?.[0] ? parsed.tone[0] : state.preferences.mood,
        keywords: Array.from(new Set([
          ...state.preferences.keywords,
          ...(parsed.themes || []),
          ...(parsed.tone || [])
        ])),
        genres: Array.from(new Set([...(state.preferences.genres || []), ...(parsed.genres || [])])),
        themes: Array.from(new Set([...(state.preferences.themes || []), ...(parsed.themes || [])])),
        tone: Array.from(new Set([...(state.preferences.tone || []), ...(parsed.tone || [])])),
        characterPreferences: Array.from(new Set([...(state.preferences.characterPreferences || []), ...(parsed.characterPreferences || [])])),
        preferredLength: parsed.preferredLength || state.preferences.preferredLength,
        dislikedGenres: Array.from(new Set([...(state.preferences.dislikedGenres || []), ...(parsed.dislikedGenres || [])])),
        dislikedThemes: Array.from(new Set([...(state.preferences.dislikedThemes || []), ...(parsed.dislikedThemes || [])])),
        favoriteAuthors: Array.from(new Set([...(state.preferences.favoriteAuthors || []), ...(parsed.favoriteAuthors || [])])),
        favoriteBooks: Array.from(new Set([...(state.preferences.favoriteBooks || []), ...(parsed.favoriteBooks || [])])),
        otherPreferences: Array.from(new Set([...(state.preferences.otherPreferences || []), ...(parsed.otherPreferences || [])])),
      };

      // Reset disliked logic if user changes mind: check if something in disliked is now explicitly liked
      if (newPrefs.genres && newPrefs.dislikedGenres) {
        newPrefs.dislikedGenres = newPrefs.dislikedGenres.filter(g => !newPrefs.genres?.includes(g));
      }

      return { preferences: newPrefs };
    }
  } catch (err) {
    console.warn("Gemini extraction error:", err);
  }

  const lastUserMsg = state.messages[state.messages.length - 1]?.content || '';
  return { preferences: fallbackExtractKeywords(lastUserMsg, state.preferences) };
};

// Node: Ask a clarifying question if preferences are vague
export const askQuestionNode = async (state: ChatState): Promise<Partial<ChatState>> => {
  const ai = getGeminiClient();
  if (!ai) {
    const fallbackText = "I'm bryaxis, keeper of books. What kind of books or genres are you in the mood for? (e.g. Fantasy, Thrillers, Romance, Self-Help)";
    return { messages: [...state.messages, { id: Date.now().toString(), role: 'bot', content: fallbackText }] };
  }

  try {
    const historyContext = state.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const systemInstruction = `You are Bryaxis, the wise, warm, and whimsical keeper of books.
Ask the user a single, highly engaging, and concise follow-up question to help narrow down their reading preferences (e.g., asking about mood, length, favorite themes, Standalone vs Series).
Do NOT suggest any books yet. Keep your message under 3 sentences.`;

    const prompt = `Conversation history:\n${historyContext}\n\nCurrent extracted preferences: ${JSON.stringify(state.preferences)}\n\nRespond as Bryaxis:`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return {
      messages: [...state.messages, { id: Date.now().toString(), role: 'bot', content: response.text || "Tell me more about what you'd like to read next!" }]
    };
  } catch (err) {
    console.warn("Gemini clarification error:", err);
    return { messages: [...state.messages, { id: Date.now().toString(), role: 'bot', content: "Tell me more about what you'd like to read next!" }] };
  }
};

// Node: Scoring, retrieval, and generating custom recommendations
export const recommendNode = async (state: ChatState): Promise<Partial<ChatState>> => {
  const p = state.preferences;
  const lastUserMsg = state.messages[state.messages.length - 1]?.content || '';
  const lastUserMsgLower = lastUserMsg.toLowerCase();

  // Detect explicit user rejections or request types
  const isMoreRequest = lastUserMsgLower.includes('more') || lastUserMsgLower.includes('else') || lastUserMsgLower.includes('different') || lastUserMsgLower.includes('other');
  
  // Track currently displayed recommendations as rejected/seen if user says "I don't like these" or asks for "different" options
  let updatedRejectedIds = [...(state.rejectedBookIds || [])];
  if (lastUserMsgLower.includes("don't like") || lastUserMsgLower.includes("dislike") || lastUserMsgLower.includes("different options")) {
    // find books in the last bot message and add them to rejected
    const lastBotMessage = [...state.messages].reverse().find(m => m.role === 'bot' && m.recommendations && m.recommendations.length > 0);
    if (lastBotMessage && lastBotMessage.recommendations) {
      const ids = lastBotMessage.recommendations.map(b => b.id);
      updatedRejectedIds = Array.from(new Set([...updatedRejectedIds, ...ids]));
    }
  }

  // 1. Candidate Filtering (Exclude previously recommended and rejected books first)
  const excludeIds = new Set([
    ...(state.recommendedBookIds || []),
    ...updatedRejectedIds
  ]);

  let availableCandidates = kaggleBooksDataset.filter(book => !excludeIds.has(book.id));

  // Handle case with insufficient alternatives (broaden/relax preferences)
  let broadenedMessage = "";
  if (availableCandidates.length < 3) {
    // Broaden: allow already recommended books (but preserve explicit user rejections)
    availableCandidates = kaggleBooksDataset.filter(book => !updatedRejectedIds.includes(book.id));
    broadenedMessage = "I've already shown you the strongest matches for that exact combination. I've broadened my search and refreshed the selection:\n\n";
  }

  // 2. Scoring Logic
  const scoredBooks = availableCandidates.map(book => {
    let score = 0;
    const reasons: string[] = [];

    // Genre matching
    const bookCategoryLower = book.category.toLowerCase();
    if (p.genres && p.genres.some(g => bookCategoryLower.includes(g.toLowerCase()))) {
      score += 10;
      reasons.push(`matches genre preference`);
    }

    // Mood matching
    if (p.tone) {
      const matchedTone = p.tone.filter(t => book.moods.some(m => m.toLowerCase().includes(t.toLowerCase())));
      if (matchedTone.length > 0) {
        score += 5 * matchedTone.length;
        reasons.push(`fits the ${matchedTone.join(', ')} mood`);
      }
    }

    // Themes / Keyword matching
    if (p.themes) {
      p.themes.forEach(theme => {
        if (book.title.toLowerCase().includes(theme.toLowerCase()) || book.description.toLowerCase().includes(theme.toLowerCase())) {
          score += 4;
        }
      });
    }

    // Length preference matching
    if (p.preferredLength && book.length === p.preferredLength) {
      score += 3;
      reasons.push(`matches length (${book.length})`);
    }

    // Penalty for disliked genres/themes
    if (p.dislikedGenres && p.dislikedGenres.some(dg => bookCategoryLower.includes(dg.toLowerCase()))) {
      score -= 30; // strong penalty
    }
    if (p.dislikedThemes) {
      p.dislikedThemes.forEach(dt => {
        if (book.title.toLowerCase().includes(dt.toLowerCase()) || book.description.toLowerCase().includes(dt.toLowerCase())) {
          score -= 20;
        }
      });
    }

    // Rating boost
    if (book.rating) {
      score += (book.rating - 3);
    }

    return { book, score, reason: reasons.join(' • ') || 'highly rated pick' };
  });

  // Sort by score
  scoredBooks.sort((a, b) => b.score - a.score || (b.book.rating || 0) - (a.book.rating || 0));

  // Introduce diversity selection: pick top candidates but ensure variety of genres/categories if scores are close
  const selected: Book[] = [];
  const selectedCategories = new Set<string>();
  
  for (const sb of scoredBooks) {
    if (selected.length >= 3) break;
    // Attempt to diversify category/genre if score is within 5 points of the top selection
    const isWithinCloseScore = selected.length === 0 || (selected[0] && (sb.score >= (scoredBooks[0]?.score || 0) - 5));
    if (isWithinCloseScore && selectedCategories.has(sb.book.category) && scoredBooks.length > 3) {
      // Skip if we can find another category to diversify
      const hasAlternative = scoredBooks.some(other => !selected.includes(other.book) && !selectedCategories.has(other.book.category));
      if (hasAlternative) continue;
    }
    selected.push(sb.book);
    selectedCategories.add(sb.book.category);
  }

  const ai = getGeminiClient();
  let introductionText = "";
  let finalBooks: Book[] = [];

  if (ai && selected.length > 0) {
    try {
      const systemInstruction = `You are Bryaxis, the wise and whimsical librarian.
Based on the user's preferences, introduce the 3 handpicked books from the database.
Write a warm 2-sentence introduction, followed by a personalized 1-sentence explanation for EACH book (identifying why it specifically matches their preferences, like tone, length, or themes).
Use ONLY information provided in the book details. Do NOT hallucinate plot elements, characters, or details not present in the book descriptions.`;

      const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
          introduction: {
            type: Type.STRING,
            description: "Friendly introduction from Bryaxis introducing the recommendations."
          },
          reasons: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                bookId: { type: Type.STRING },
                reason: { type: Type.STRING, description: "Personalized explanation of why this book matches their interests." }
              },
              required: ["bookId", "reason"]
            }
          }
        },
        required: ["introduction", "reasons"]
      };

      const prompt = `User preferences: ${JSON.stringify(p)}
Last query: "${lastUserMsg}"
Type of request: ${isMoreRequest ? "User wants MORE/different options" : "Initial query"}

Available dataset recommendations:
${selected.map(b => `[ID: ${b.id}] "${b.title}" by ${b.author} (${b.category}): ${b.description}`).join('\n')}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.7,
        }
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        introductionText = broadenedMessage + (parsed.introduction || "");
        
        const reasonMap: Record<string, string> = {};
        if (Array.isArray(parsed.reasons)) {
          parsed.reasons.forEach((r: any) => {
            if (r.bookId && r.reason) reasonMap[r.bookId] = r.reason;
          });
        }

        finalBooks = selected.map(b => ({
          ...b,
          description: `${b.description}\n\n*Why it matches: ${reasonMap[b.id] || "Selected from database matches."}*`
        }));
      }
    } catch (err) {
      console.warn("Gemini recommendation response generation failed:", err);
    }
  }

  // Fallback formatting if Gemini call failed or is unavailable
  if (!introductionText || finalBooks.length === 0) {
    introductionText = broadenedMessage + "I have curated these books from our library catalog that fit your interests:";
    finalBooks = selected.map(b => {
      return {
        ...b,
        description: `${b.description}\n\n*Why it matches: Fits ${b.category} category and matches requested preferences.*`
      };
    });
  }

  // Track newly recommended books
  const newlyRecommendedIds = selected.map(b => b.id);
  const updatedRecommendedBookIds = Array.from(new Set([
    ...(state.recommendedBookIds || []),
    ...newlyRecommendedIds
  ]));

  return {
    messages: [...state.messages, { id: Date.now().toString(), role: 'bot', content: introductionText, recommendations: finalBooks }],
    recommendationCount: state.recommendationCount + 1,
    recommendedBookIds: updatedRecommendedBookIds,
    rejectedBookIds: updatedRejectedIds,
    // Clear transient preferences but preserve explicit dislikes
    preferences: {
      ...getInitialState().preferences,
      dislikedGenres: p.dislikedGenres,
      dislikedThemes: p.dislikedThemes
    }
  };
};

// Route controller
export const shouldRecommend = (state: ChatState): string => {
  const p = state.preferences;
  const lastMsg = state.messages[state.messages.length - 1]?.content.toLowerCase() || '';

  // Direct keyword or button trigger
  if (lastMsg.includes('recommend') || lastMsg.includes('book') || lastMsg.includes('surprise') || lastMsg.includes('give me') || lastMsg.includes('suggest') || lastMsg.includes('pick') || lastMsg.includes('more') || lastMsg.includes('else') || lastMsg.includes('different') || lastMsg.includes('other')) {
    return 'recommend';
  }

  // Check if we have extracted enough criteria to make a selection
  const hasSubstantialPreferences = (p.genres && p.genres.length > 0) || (p.themes && p.themes.length > 0) || (p.tone && p.tone.length > 0);
  if (hasSubstantialPreferences) {
    return 'recommend';
  }

  return 'ask_question';
};

// Core entrypoint to execute the steps
export const processChatStep = async (currentState: ChatState, newUserMessage: Message): Promise<{ newState: ChatState; botMessage: Message }> => {
  let updatedState: ChatState = {
    ...currentState,
    messages: [...currentState.messages, newUserMessage]
  };

  // 1. Extract Preferences
  const extractChanges = await extractNode(updatedState);
  updatedState = {
    ...updatedState,
    ...extractChanges,
    preferences: extractChanges.preferences || updatedState.preferences
  };

  // 2. Determine node path
  const nextNode = shouldRecommend(updatedState);

  // 3. Process node
  let nodeChanges: Partial<ChatState> = {};
  if (nextNode === 'recommend') {
    nodeChanges = await recommendNode(updatedState);
  } else {
    nodeChanges = await askQuestionNode(updatedState);
  }

  const finalState: ChatState = {
    ...updatedState,
    ...nodeChanges,
    messages: nodeChanges.messages || updatedState.messages,
    recommendationCount: nodeChanges.recommendationCount ?? updatedState.recommendationCount,
    preferences: nodeChanges.preferences || updatedState.preferences,
    recommendedBookIds: nodeChanges.recommendedBookIds || updatedState.recommendedBookIds || [],
    rejectedBookIds: nodeChanges.rejectedBookIds || updatedState.rejectedBookIds || []
  };

  const botMessage = finalState.messages[finalState.messages.length - 1];
  return { newState: finalState, botMessage };
};
