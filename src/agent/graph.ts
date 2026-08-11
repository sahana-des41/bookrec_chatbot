/**
 * BookRec LangGraph Agent
 *
 * Architecture:
 *   START → understandIntent → conditional routing:
 *     ├─ casual / greeting  → conversationalResponse → END
 *     ├─ clarification      → clarificationResponse  → END
 *     └─ recommendation*    → retrieveAndRank → generateResponse → END
 *
 * Gemini calls per turn:  max 2  (intent+prefs extraction  +  response generation)
 * Retrieval / ranking:    pure deterministic TypeScript — no Gemini needed
 */

import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import type { Message, UserPreferences, Book } from '../types';
import { kaggleBooksDataset } from '../data/books';

// ─── LangGraph State Definition ───────────────────────────────────────────────

/**
 * All fields use replace-semantics reducer (_, y) => y because we pass the
 * COMPLETE accumulated state on every graph.invoke() call (no checkpointer).
 * Nodes read the full state and return the fully-merged next value.
 */
const BookRecState = Annotation.Root({
  /** Full conversation message history */
  messages: Annotation<Message[]>({
    default: () => [],
    reducer: (_, y) => y,
  }),
  /** Accumulated user reading preferences — never fully reset */
  userPreferences: Annotation<UserPreferences>({
    default: () => emptyPreferences(),
    reducer: (_, y) => y,
  }),
  /** Classified intent for this turn */
  intent: Annotation<string>({
    default: () => 'greeting',
    reducer: (_, y) => y,
  }),
  /** IDs of all books ever recommended in this session */
  recommendedBookIds: Annotation<string[]>({
    default: () => [],
    reducer: (_, y) => y,
  }),
  /** IDs of books explicitly rejected by the user */
  rejectedBookIds: Annotation<string[]>({
    default: () => [],
    reducer: (_, y) => y,
  }),
  /** Books selected by retrieveAndRank, consumed by generateResponse */
  currentRecommendations: Annotation<Book[]>({
    default: () => [],
    reducer: (_, y) => y,
  }),
  /** Internal signal flag (e.g. '__broadened__') passed between nodes */
  _internalSignal: Annotation<string>({
    default: () => '',
    reducer: (_, y) => y,
  }),
  needsClarification: Annotation<boolean>({
    default: () => false,
    reducer: (_, y) => y,
  }),
});

export type BookRecGraphState = typeof BookRecState.State;

// ─── Gemini Setup ─────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-2.5-flash';

const getGeminiClient = (): GoogleGenAI | null => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_google_ai_studio_api_key_here')) return null;
  return new GoogleGenAI({ apiKey });
};

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function emptyPreferences(): UserPreferences {
  return {
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
    otherPreferences: [],
  };
}

/** Return the last N messages formatted for Gemini prompts */
function recentContext(messages: Message[], n = 6): string {
  return messages
    .slice(-n)
    .map(m => `${m.role === 'user' ? 'USER' : 'BRYAXIS'}: ${m.content}`)
    .join('\n');
}

/** Rule-based preference extraction fallback (no Gemini required) */
function fallbackExtract(text: string, current: UserPreferences): UserPreferences {
  const t = text.toLowerCase();
  const updated = { ...current };

  // Genres
  if (t.includes('fantasy') || t.includes('magic')) {
    updated.genres = Array.from(new Set([...(updated.genres || []), 'fantasy']));
  }
  if (t.includes('romance') || (t.includes('love') && !t.includes("don't") && !t.includes('no '))) {
    updated.genres = Array.from(new Set([...(updated.genres || []), 'romance']));
  }
  if (t.includes('mystery') || t.includes('thriller')) {
    updated.genres = Array.from(new Set([...(updated.genres || []), 'mystery']));
  }
  if (t.includes('sci-fi') || t.includes('science fiction') || t.includes('space')) {
    updated.genres = Array.from(new Set([...(updated.genres || []), 'sci-fi']));
  }
  if (t.includes('self-help') || t.includes('productivity') || t.includes('habits')) {
    updated.genres = Array.from(new Set([...(updated.genres || []), 'self-help']));
  }
  if (t.includes('horror') || t.includes('scary')) {
    updated.genres = Array.from(new Set([...(updated.genres || []), 'horror']));
  }

  // Tone
  if (t.includes('dark')) updated.tone = Array.from(new Set([...(updated.tone || []), 'dark']));
  if (t.includes('funny') || t.includes('humor') || t.includes('comic')) updated.tone = Array.from(new Set([...(updated.tone || []), 'funny']));
  if (t.includes('cozy')) updated.tone = Array.from(new Set([...(updated.tone || []), 'cozy']));
  if (t.includes('emotional')) updated.tone = Array.from(new Set([...(updated.tone || []), 'emotional']));
  if (t.includes('stress') || t.includes('comfort')) updated.tone = Array.from(new Set([...(updated.tone || []), 'comforting']));

  // Length
  if (t.includes('short') || t.includes('weekend') || t.includes('quick')) updated.preferredLength = 'short';
  if (t.includes('long') || t.includes('epic')) updated.preferredLength = 'long';

  // Explicit dislikes
  if (t.includes('no romance') || t.includes("don't want romance") || t.includes('not romance')) {
    updated.dislikedGenres = Array.from(new Set([...(updated.dislikedGenres || []), 'romance']));
    updated.genres = (updated.genres || []).filter(g => g.toLowerCase() !== 'romance');
  }
  if (t.includes('no fantasy') || t.includes("don't want fantasy")) {
    updated.dislikedGenres = Array.from(new Set([...(updated.dislikedGenres || []), 'fantasy']));
    updated.genres = (updated.genres || []).filter(g => g.toLowerCase() !== 'fantasy');
  }

  // Keywords
  const words = t.split(/\s+/).filter(w => w.length > 4);
  updated.keywords = Array.from(new Set([...(updated.keywords || []), ...words]));

  return updated;
}

// ─── NODE 1: understandIntent ─────────────────────────────────────────────────
// Combined intent classification + preference delta extraction — 1 Gemini call.

const understandIntentNode = async (state: BookRecGraphState): Promise<Partial<BookRecGraphState>> => {
  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return { intent: 'greeting' };
  }

  const lastUserMsg = lastMessage.content;
  const ai = getGeminiClient();

  // ── Fallback: rule-based ──
  if (!ai) {
    const t = lastUserMsg.toLowerCase();
    let intent = 'recommend';
    if (/^(hi|hello|hey|good\s*(morning|evening|night)|howdy|sup|yo)\b/.test(t)) intent = 'greeting';
    else if (t.includes('thank') || t.includes('awesome') || t.includes('great') || t.includes('nice') || t.includes('love it') || t.includes('perfect')) intent = 'casual_conversation';
    else if (t.includes('more') || t.includes('another') || t.includes('else') || t.includes('other options')) intent = 'more_recommendations';
    else if (t.includes("don't like these") || t.includes('not these') || t.includes('something different') || t.includes('different options')) intent = 'reject_recommendation';
    else if (/no\s+(more\s+)?(romance|fantasy|mystery|thriller|sci.fi|horror)/.test(t) || t.includes('instead') || t.includes('change to') || t.includes('actually')) intent = 'change_preference';
    else if (t.includes('shorter') || t.includes('longer') || t.includes('darker') || t.includes('lighter')) intent = 'refine_recommendation';
    return { intent, userPreferences: fallbackExtract(lastUserMsg, state.userPreferences) };
  }

  // ── Gemini: combined intent + prefs delta ──
  try {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        intent: {
          type: Type.STRING,
          enum: ['recommend', 'more_recommendations', 'refine_recommendation', 'reject_recommendation', 'change_preference', 'casual_conversation', 'greeting', 'clarification_needed'],
        },
        addGenres: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Genres to add to liked list (e.g. "fantasy", "romance")' },
        removeGenres: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Genres to remove from liked and add to disliked' },
        addTone: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Tone/mood to add (e.g. "dark", "funny", "cozy")' },
        addThemes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Plot themes to add (e.g. "magic", "space travel", "heist")' },
        addDislikedThemes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Themes to avoid' },
        preferredLength: { type: Type.STRING, enum: ['short', 'medium', 'long'] },
        favoriteAuthors: { type: Type.ARRAY, items: { type: Type.STRING } },
        favoriteBooks: { type: Type.ARRAY, items: { type: Type.STRING } },
        otherPreferences: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['intent'],
    };

    const prompt = `You are a book recommendation AI. Classify this user message and extract preference changes.

RECENT CONVERSATION (last 6 messages):
${recentContext(state.messages)}

CURRENTLY STORED PREFERENCES:
genres=${JSON.stringify(state.userPreferences.genres)}, tone=${JSON.stringify(state.userPreferences.tone)}, themes=${JSON.stringify(state.userPreferences.themes)}, dislikedGenres=${JSON.stringify(state.userPreferences.dislikedGenres)}, length=${state.userPreferences.preferredLength || 'none'}

USER'S MESSAGE: "${lastUserMsg}"

Intent classification rules:
- greeting: "hi", "hello", "hey" and similar simple greetings
- casual_conversation: thanks, reactions like "love it", "great", small talk, "I don't know what I want", "surprise me"
- recommend: first-time book request, wants recommendations based on preference
- more_recommendations: wants MORE books with SAME preferences ("give me more", "show me others", "more options")
- reject_recommendation: dislikes the CURRENT shown books ("not these", "something different", "I don't like these", "show me something else")
- change_preference: explicitly CHANGING preference ("no more romance", "actually mystery instead", "I changed my mind")
- refine_recommendation: NARROWING current preference ("but shorter", "more adventurous", "actually darker")
- clarification_needed: message is too vague to determine any direction

For preference fields: extract ONLY what CHANGED in this message. Omit fields unchanged from previous messages.
For removeGenres: list genres user explicitly says they NO LONGER want.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1 },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text);
      const cur = state.userPreferences;

      // Remove genres explicitly disliked
      const removedGenres = new Set((parsed.removeGenres || []).map((g: string) => g.toLowerCase()));

      const updatedPrefs: UserPreferences = {
        ...cur,
        genres: Array.from(new Set([
          ...(cur.genres || []).filter(g => !removedGenres.has(g.toLowerCase())),
          ...(parsed.addGenres || []),
        ])),
        themes: Array.from(new Set([...(cur.themes || []), ...(parsed.addThemes || [])])),
        tone: Array.from(new Set([...(cur.tone || []), ...(parsed.addTone || [])])),
        dislikedGenres: Array.from(new Set([...(cur.dislikedGenres || []), ...(parsed.removeGenres || [])])),
        dislikedThemes: Array.from(new Set([...(cur.dislikedThemes || []), ...(parsed.addDislikedThemes || [])])),
        preferredLength: parsed.preferredLength ?? cur.preferredLength,
        favoriteAuthors: Array.from(new Set([...(cur.favoriteAuthors || []), ...(parsed.favoriteAuthors || [])])),
        favoriteBooks: Array.from(new Set([...(cur.favoriteBooks || []), ...(parsed.favoriteBooks || [])])),
        otherPreferences: Array.from(new Set([...(cur.otherPreferences || []), ...(parsed.otherPreferences || [])])),
        // Derived compat fields
        category: parsed.addGenres?.[0] ?? cur.category,
        mood: parsed.addTone?.[0] ?? cur.mood,
        keywords: Array.from(new Set([...(cur.keywords || []), ...(parsed.addThemes || []), ...(parsed.addTone || [])])),
      };

      return { intent: parsed.intent || 'recommend', userPreferences: updatedPrefs };
    }
  } catch (err) {
    console.warn('[understandIntent] Gemini error:', err);
  }

  // Fallback on error
  return { intent: 'recommend', userPreferences: fallbackExtract(lastUserMsg, state.userPreferences) };
};

// ─── NODE 2: conversationalResponse ──────────────────────────────────────────
// Natural reply for greetings, casual chat, "surprise me".

const conversationalResponseNode = async (state: BookRecGraphState): Promise<Partial<BookRecGraphState>> => {
  const lastUserMsg = state.messages[state.messages.length - 1]?.content || '';
  const ai = getGeminiClient();

  let text = "Hey! I'm Bryaxis 📚 What kind of reading mood are you in today?";

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `RECENT CONVERSATION:\n${recentContext(state.messages)}\n\nUSER MESSAGE: "${lastUserMsg}"`,
        config: {
          systemInstruction: `You are Bryaxis, a warm, witty, and whimsical book-loving librarian AI.
Respond naturally to greetings, casual chat, or "I don't know what I want" / "surprise me" messages.
If the user says "surprise me" or "I don't know", gently invite them to share a mood, feeling, or vibe.
Keep your response to 1–2 sentences. Be charming and bookish. Do NOT recommend specific books yet.
Do NOT use the phrase "As an AI". Do NOT say "How can I help you?".`,
          temperature: 0.85,
        },
      });
      text = response.text?.trim() || text;
    } catch (err) {
      console.warn('[conversationalResponse] Gemini error:', err);
    }
  }

  const botMessage: Message = { id: Date.now().toString(), role: 'bot', content: text };
  return { messages: [...state.messages, botMessage] };
};

// ─── NODE 3: clarificationResponse ───────────────────────────────────────────
// Ask a focused follow-up question when intent is too vague.

const clarificationResponseNode = async (state: BookRecGraphState): Promise<Partial<BookRecGraphState>> => {
  const ai = getGeminiClient();

  let text = "I'd love to help! Could you give me a sense of what you're in the mood for — a genre, a theme, or even just a feeling you want the book to leave you with?";

  if (ai) {
    try {
      const prefsSnap = JSON.stringify({
        genres: state.userPreferences.genres,
        tone: state.userPreferences.tone,
        themes: state.userPreferences.themes,
      });

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `RECENT CONVERSATION:\n${recentContext(state.messages)}\n\nKNOWN PREFERENCES: ${prefsSnap}`,
        config: {
          systemInstruction: `You are Bryaxis, a warm and whimsical librarian.
Ask ONE specific and engaging follow-up question to narrow down the user's book preferences.
Good topics: preferred genre, mood, standalone vs series, reading pace, themes.
Keep it to 1–2 sentences. Be natural and charming. Do NOT recommend any books yet.`,
          temperature: 0.7,
        },
      });
      text = response.text?.trim() || text;
    } catch (err) {
      console.warn('[clarificationResponse] Gemini error:', err);
    }
  }

  const botMessage: Message = { id: Date.now().toString(), role: 'bot', content: text };
  return { messages: [...state.messages, botMessage] };
};

// ─── NODE 4: retrieveAndRank ──────────────────────────────────────────────────
// Pure deterministic TypeScript — filters, scores, and diversifies candidates.
// No Gemini calls.

const retrieveAndRankNode = async (state: BookRecGraphState): Promise<Partial<BookRecGraphState>> => {
  const p = state.userPreferences;
  const intent = state.intent;

  // Step 1: Handle rejection intent — move last shown books to rejectedBookIds
  let updatedRejectedIds = [...state.rejectedBookIds];
  if (intent === 'reject_recommendation') {
    const lastBotWithRecs = [...state.messages]
      .reverse()
      .find(m => m.role === 'bot' && m.recommendations && m.recommendations.length > 0);
    if (lastBotWithRecs?.recommendations) {
      const ids = lastBotWithRecs.recommendations.map(b => b.id);
      updatedRejectedIds = Array.from(new Set([...updatedRejectedIds, ...ids]));
    }
  }

  // Step 2: Build exclusion set — recommended + rejected
  const excludeIds = new Set([...state.recommendedBookIds, ...updatedRejectedIds]);
  let candidates = kaggleBooksDataset.filter(b => !excludeIds.has(b.id));

  // Step 3: Scoring function
  const scoreBook = (book: Book, prefs: UserPreferences): number => {
    let s = 0;
    const catLow = book.category.toLowerCase();

    // Genre match (+10)
    if (prefs.genres?.length) {
      if (prefs.genres.some(g => catLow.includes(g.toLowerCase()))) s += 10;
    }

    // Tone/mood match (+5 per matching tone)
    if (prefs.tone?.length) {
      for (const t of prefs.tone) {
        if (book.moods.some(m => m.toLowerCase().includes(t.toLowerCase()))) s += 5;
      }
    }

    // Theme match in title or description (+4 per theme)
    if (prefs.themes?.length) {
      for (const theme of prefs.themes) {
        const thL = theme.toLowerCase();
        if (book.title.toLowerCase().includes(thL) || book.description.toLowerCase().includes(thL)) s += 4;
      }
    }

    // Length preference (+3)
    if (prefs.preferredLength && book.length === prefs.preferredLength) s += 3;

    // Favorite author (+8)
    if (prefs.favoriteAuthors?.some(a => book.author.toLowerCase().includes(a.toLowerCase()))) s += 8;

    // Disliked genre (−30 hard penalty)
    if (prefs.dislikedGenres?.some(dg => catLow.includes(dg.toLowerCase()))) s -= 30;

    // Disliked theme (−20)
    if (prefs.dislikedThemes?.length) {
      for (const dt of prefs.dislikedThemes) {
        const dtL = dt.toLowerCase();
        if (book.title.toLowerCase().includes(dtL) || book.description.toLowerCase().includes(dtL)) s -= 20;
      }
    }

    // Rating boost (up to +2 for 5-star)
    if (book.rating) s += (book.rating - 3);

    return s;
  };

  // Step 4: Score and sort
  let scored = candidates
    .map(b => ({ book: b, score: scoreBook(b, p) }))
    .sort((a, b) => b.score - a.score || (b.book.rating || 0) - (a.book.rating || 0));

  // Step 5: Progressive relaxation if very few good candidates remain
  let broadened = false;
  const goodCount = scored.filter(s => s.score > -5).length;

  if (goodCount < 3 && (p.genres?.length || p.themes?.length)) {
    // Relax: drop theme filter, keep genre + dislikes
    const relaxedPrefs: UserPreferences = { ...p, themes: [], tone: [] };
    scored = candidates
      .map(b => ({ book: b, score: scoreBook(b, relaxedPrefs) }))
      .sort((a, b) => b.score - a.score || (b.book.rating || 0) - (a.book.rating || 0));
    broadened = true;
  }

  if (scored.length < 3) {
    // Last resort: re-include previously recommended books (but still respect rejectedBookIds)
    const broadCandidates = kaggleBooksDataset.filter(b => !updatedRejectedIds.includes(b.id));
    scored = broadCandidates
      .map(b => ({ book: b, score: scoreBook(b, p) }))
      .sort((a, b) => b.score - a.score || (b.book.rating || 0) - (a.book.rating || 0));
    broadened = true;
  }

  // Step 6: Diversity selection — prefer different categories among top scorers
  const selected: Book[] = [];
  const seenCategories = new Set<string>();
  const topScore = scored[0]?.score ?? 0;

  for (const { book, score } of scored) {
    if (selected.length >= 3) break;
    const dupCategory = seenCategories.has(book.category);
    const withinRange = score >= topScore - 5;

    if (withinRange && dupCategory && scored.length > 3) {
      const hasAlternative = scored.some(
        other => !selected.includes(other.book) && !seenCategories.has(other.book.category)
      );
      if (hasAlternative) continue;
    }
    selected.push(book);
    seenCategories.add(book.category);
  }

  // Step 7: Append newly recommended IDs to the running history
  const updatedRecommendedIds = Array.from(new Set([...state.recommendedBookIds, ...selected.map(b => b.id)]));

  return {
    currentRecommendations: selected,
    recommendedBookIds: updatedRecommendedIds,
    rejectedBookIds: updatedRejectedIds,
    _internalSignal: broadened ? '__broadened__' : '',
  };
};

// ─── NODE 5: generateResponse ─────────────────────────────────────────────────
// Uses Gemini to narrate the selected books naturally.

const generateResponseNode = async (state: BookRecGraphState): Promise<Partial<BookRecGraphState>> => {
  const selected = state.currentRecommendations;
  const p = state.userPreferences;
  const intent = state.intent;
  const broadened = state._internalSignal === '__broadened__';
  const lastUserMsg = state.messages[state.messages.length - 1]?.content || '';

  // No books found edge case
  if (selected.length === 0) {
    const botMessage: Message = {
      id: Date.now().toString(),
      role: 'bot',
      content: "I couldn't find strong matches for that combination in my catalog right now. Try broadening your preferences a bit — maybe drop one constraint?",
    };
    return { messages: [...state.messages, botMessage], _internalSignal: '' };
  }

  const ai = getGeminiClient();
  let introText = '';
  let finalBooks: Book[] = selected;

  if (ai) {
    try {
      const schema: Schema = {
        type: Type.OBJECT,
        properties: {
          introduction: { type: Type.STRING, description: 'Warm 1–2 sentence introduction as Bryaxis. Be creative and vary your phrasing.' },
          reasons: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                bookId: { type: Type.STRING },
                reason: { type: Type.STRING, description: 'One sentence explaining why this specific book matches this user.' },
              },
              required: ['bookId', 'reason'],
            },
          },
        },
        required: ['introduction', 'reasons'],
      };

      const intentNote: Record<string, string> = {
        more_recommendations: 'User wants MORE books — same tastes, brand-new titles.',
        reject_recommendation: 'User rejected previous picks. These are fresh alternatives.',
        change_preference: 'User changed their preferences. Acknowledge the pivot naturally.',
        refine_recommendation: 'User refined their criteria. These match the refined search.',
        recommend: 'Initial recommendation.',
        clarification_needed: 'Recommendations after clarification.',
      };

      const prompt = `USER MESSAGE: "${lastUserMsg}"
CONTEXT: ${intentNote[intent] || 'Recommendation.'}
${broadened ? 'NOTE: All exact matches were already shown; search was broadened slightly.' : ''}

USER PREFERENCES:
- Genres: ${JSON.stringify(p.genres)}
- Tone/mood: ${JSON.stringify(p.tone)}
- Themes: ${JSON.stringify(p.themes)}
- Length: ${p.preferredLength || 'any'}

BOOKS TO INTRODUCE (use ONLY these facts — do NOT invent anything):
${selected.map(b => `[ID: ${b.id}] "${b.title}" by ${b.author} (${b.category}${b.length ? ', ' + b.length : ''}${b.rating ? ', ★' + b.rating.toFixed(1) : ''}): ${b.description}`).join('\n')}`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: `You are Bryaxis, a warm, witty, and whimsical librarian who loves books deeply.
Write a creative and natural introduction for these recommendations. Avoid generic openers like "Here are some books that match your interests."
For each book give ONE sentence explaining why it specifically fits this user's preferences.
Use ONLY information from the supplied book details. Never invent plot points, characters, or publication dates.`,
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.75,
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        const broadenNote = broadened
          ? "I've already shown you the strongest exact matches — I broadened the search just a little:\n\n"
          : '';
        introText = broadenNote + (parsed.introduction || '');

        const reasonMap: Record<string, string> = {};
        if (Array.isArray(parsed.reasons)) {
          for (const r of parsed.reasons) {
            if (r.bookId && r.reason) reasonMap[r.bookId] = r.reason;
          }
        }

        finalBooks = selected.map(b => ({
          ...b,
          description: `${b.description}\n\n*Why it matches: ${reasonMap[b.id] || 'Highly rated pick from the catalog.'}*`,
        }));
      }
    } catch (err) {
      console.warn('[generateResponse] Gemini error:', err);
    }
  }

  // Fallback text
  if (!introText) {
    introText = broadened
      ? "I've shown you all the top exact matches already — here are some solid alternatives:\n\n"
      : `Based on your reading taste, here are my top picks from the catalog:`;

    finalBooks = selected.map(b => ({
      ...b,
      description: `${b.description}\n\n*Why it matches: Fits ${b.category} category and matches your preferences.*`,
    }));
  }

  const botMessage: Message = {
    id: Date.now().toString(),
    role: 'bot',
    content: introText,
    recommendations: finalBooks,
  };

  return {
    messages: [...state.messages, botMessage],
    _internalSignal: '',
  };
};

// ─── Routing Function ─────────────────────────────────────────────────────────

const routeAfterIntentNode = (state: BookRecGraphState): string => {
  const { intent } = state;
  if (intent === 'greeting' || intent === 'casual_conversation') return 'conversationalResponse';
  if (intent === 'clarification_needed') return 'clarificationResponse';
  // All recommendation-related intents go to retrieve+rank
  return 'retrieveAndRank';
};

// ─── Graph Construction ────────────────────────────────────────────────────────

function buildBookRecGraph() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = new StateGraph(BookRecState) as any;

  // Register nodes
  graph.addNode('understandIntent', understandIntentNode);
  graph.addNode('conversationalResponse', conversationalResponseNode);
  graph.addNode('clarificationResponse', clarificationResponseNode);
  graph.addNode('retrieveAndRank', retrieveAndRankNode);
  graph.addNode('generateResponse', generateResponseNode);

  // Edges
  graph.addEdge(START, 'understandIntent');

  graph.addConditionalEdges('understandIntent', routeAfterIntentNode, {
    conversationalResponse: 'conversationalResponse',
    clarificationResponse: 'clarificationResponse',
    retrieveAndRank: 'retrieveAndRank',
  });

  graph.addEdge('conversationalResponse', END);
  graph.addEdge('clarificationResponse', END);
  graph.addEdge('retrieveAndRank', 'generateResponse');
  graph.addEdge('generateResponse', END);

  return graph.compile();
}

// Compiled once at module load — reused across all turns
const bookRecGraph = buildBookRecGraph();

// ─── Public API ───────────────────────────────────────────────────────────────

/** Initial LangGraph state for a new chat session */
export const getInitialGraphState = (): BookRecGraphState => ({
  messages: [],
  userPreferences: emptyPreferences(),
  intent: 'greeting',
  recommendedBookIds: [],
  rejectedBookIds: [],
  currentRecommendations: [],
  _internalSignal: '',
  needsClarification: false,
});

/**
 * Main entrypoint called from App.tsx.
 *
 * Passes the FULL accumulated state + new user message into the LangGraph
 * graph via invoke(). The graph runs its nodes and returns the complete
 * updated state. We extract the last bot message to render in the UI.
 */
export const runGraph = async (
  currentState: BookRecGraphState,
  userMessage: Message
): Promise<{ newState: BookRecGraphState; botMessage: Message }> => {
  // Append the new user message before invoking
  const inputState: BookRecGraphState = {
    ...currentState,
    messages: [...currentState.messages, userMessage],
  };

  const result = (await bookRecGraph.invoke(inputState)) as BookRecGraphState;

  // The last message in the result is the bot's response
  const botMessage = result.messages[result.messages.length - 1];
  return { newState: result, botMessage };
};

// Legacy exports for backward-compatibility (used transitionally — App.tsx will migrate)
export type { BookRecGraphState as ChatState };
export const getInitialState = getInitialGraphState;
export const processChatStep = async (
  currentState: BookRecGraphState,
  userMessage: Message
): Promise<{ newState: BookRecGraphState; botMessage: Message }> => runGraph(currentState, userMessage);
