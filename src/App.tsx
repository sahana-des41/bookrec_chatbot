import React, { useState, useRef, useEffect } from 'react';
import { Send, BookOpen, Star, Sparkles, Database, Cpu, AlertTriangle } from 'lucide-react';
import type { Message, Book } from './types';
import { processChatStep, getInitialState } from './agent/graph';

// Typewriter effect component for natural reading flow
const DynamicText = ({ text, speed = 15 }: { text: string; speed?: number }) => {
  const [displayedText, setDisplayedText] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayedText('');
    indexRef.current = 0;

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        const nextChar = text.charAt(indexRef.current);
        setDisplayedText(prev => prev + nextChar);
        indexRef.current += 1;
      } else {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return <span>{displayedText}</span>;
};

// Book Card Component
const BookCard = ({ book }: { book: Book }) => {
  const hasReason = book.description.includes('*Why it matches:');
  const mainDesc = hasReason ? book.description.split('\n\n*Why it matches:')[0] : book.description;
  const reasonText = hasReason ? book.description.split('*Why it matches: ')[1]?.replace(/\*/g, '') : null;

  return (
    <div className="book-card">
      <div className="book-cover-container">
        <img src={book.coverImage} alt={book.title} className="book-cover" />
        {book.rating && (
          <div className="rating-tag">
            <Star size={13} className="rating-star" />
            {book.rating.toFixed(1)}
          </div>
        )}
      </div>
      <div className="book-info">
        <span className="book-category">{book.category}</span>
        <h4 className="book-title">{book.title}</h4>
        <p className="book-author">by {book.author}</p>

        <p className="book-desc">{mainDesc}</p>

        {reasonText && (
          <div className="book-reason">
            💡 {reasonText}
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'bot',
      content: "Hiiya!! I am bryaxis the keeper of books, powered by Google Gemini. Name me your interests or mood, and I will handpick recommendations for you!"
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [graphState, setGraphState] = useState(getInitialState());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (text: string = inputValue) => {
    if (!text.trim()) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const { newState, botMessage } = await processChatStep(graphState, newUserMessage);
      setGraphState(newState);
      setMessages(prev => [...prev, botMessage]);
    } catch (error: any) {
      console.error("Error processing chat step:", error);
      
      let errorMsg = "Sorry, I'm having trouble connecting to the recommendation service. Please try again.";
      if (error?.message && error.message.includes('429')) {
        errorMsg = "Bryaxis is receiving too many requests right now! Please wait a moment and try again.";
      }
      
      // Add a user-friendly bot message fallback in case of errors
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'bot',
        content: `[System Error] ${errorMsg}`
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedPrompts = [
    { label: "✨ Fantasy Adventure", text: "Recommend an epic fantasy book with magic" },
    { label: "🕵️ Thriller", text: "Give me a top-rated mystery thriller" },
    { label: "💖 Cozy Romance", text: "I want a cozy, witty romance book" },
    { label: "💡 Self-Help", text: "Recommend a high-impact self-help book" },
    { label: "🎲 Surprise Me", text: "Surprise me with a great book recommendation" }
  ];

  const hasApiKey = Boolean(import.meta.env.VITE_GEMINI_API_KEY) && 
                    !import.meta.env.VITE_GEMINI_API_KEY.includes('your_google_ai_studio_api_key_here');

  return (
    <div className="app-container">
      <div className="chat-container">

        {/* Windows 93 / Retro Pixel Header */}
        <div className="chat-header">
          <div className="header-left">
            <div className="header-icon">
              <BookOpen size={16} />
            </div>
            <div>
              <h1 className="chat-title">bryaxis’s home</h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="dataset-badge" style={{ background: hasApiKey ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: hasApiKey ? '#4ade80' : '#f87171', border: `1px solid ${hasApiKey ? '#4ade8040' : '#f8717140'}` }}>
              <Cpu size={11} /> {hasApiKey ? 'Gemini 2.0 Active' : 'Gemini Offline (No Key)'}
            </div>
            <div className="dataset-badge">
              <Database size={11} /> Kaggle 15K
            </div>
            <div className="window-controls">
              <div className="win-btn">_</div>
              <div className="win-btn">□</div>
              <div className="win-btn">✕</div>
            </div>
          </div>
        </div>

        {/* Error notification banner if API Key is missing */}
        {!hasApiKey && (
          <div style={{ background: '#fef3c7', borderBottom: '2px solid #fbbf24', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontFamily: 'var(--pixel-font)', fontSize: '18px' }}>
            <AlertTriangle size={18} />
            <span>Warning: VITE_GEMINI_API_KEY environment variable is not configured. The chatbot is operating in offline/fallback mode.</span>
          </div>
        )}

        {/* Messages Area */}
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-wrapper ${msg.role}`}>
              {msg.role === 'bot' && (
                <div className="message-avatar bot">
                  <BookOpen size={18} />
                </div>
              )}

              <div className={msg.role === 'bot' ? 'bot-container' : ''}>
                <div className={`message ${msg.role}`}>
                  {msg.role === 'bot' ? (
                    <DynamicText text={msg.content} speed={15} />
                  ) : (
                    msg.content
                  )}
                </div>

                {/* Book Recommendations */}
                {msg.recommendations && (
                  <div className="recommendations">
                    {msg.recommendations.map(book => (
                      <BookCard key={book.id} book={book} />
                    ))}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="message-avatar user">
                  <Sparkles size={18} />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="message-wrapper bot">
              <div className="message-avatar bot">
                <BookOpen size={18} />
              </div>
              <div className="message bot">
                <div className="typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-container">
          <div className="suggested-prompts">
            {suggestedPrompts.map(prompt => (
              <button
                key={prompt.label}
                className="prompt-chip"
                onClick={() => handleSend(prompt.text)}
              >
                {prompt.label}
              </button>
            ))}
          </div>

          <div className="input-form">
            <input
              type="text"
              className="chat-input"
              placeholder="Ask for a book by genre, mood, topic, or author..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isTyping}
            />
            <button
              className="send-button"
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isTyping}
              title="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
