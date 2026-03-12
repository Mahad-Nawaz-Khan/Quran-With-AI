'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ThinkingLoader from './ThinkingLoader';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isLoading?: boolean;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Assalamu Alaikum! 🕌\n\nI\'m your Quran AI assistant. Ask me anything about the Quran — verses, themes, history, or Islamic teachings.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    try {
      const res = await fetch('http://localhost:8000/explain-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ayahText: text,
          translation: '',
          isSearch: true,
        }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: 'Sorry, I couldn\'t connect to the AI backend. Please try again.', isLoading: false }
              : m,
          ),
        );
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.token) {
              fullText += payload.token;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText, isLoading: true } : m,
                ),
              );
            }
            if (payload.done) break;
            if (payload.error) {
              fullText = `Error: ${payload.error}`;
              break;
            }
          } catch {
            /* skip */
          }
        }
      }

      if (!fullText) fullText = 'No response generated.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: fullText, isLoading: false } : m,
        ),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Connection failed. Is the Python backend running?', isLoading: false }
            : m,
        ),
      );
    }

    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-5 right-5 z-60 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
          isOpen
            ? 'bg-[#3a3d42] rotate-0 scale-90'
            : 'bg-[#2ca4ab] hover:bg-[#258a90] hover:scale-105 shadow-[#2ca4ab]/30'
        }`}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed z-55 bottom-22 right-5 sm:bottom-22 sm:right-5 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-0 flex flex-col">
          <div className="w-full sm:w-[380px] max-sm:h-full sm:h-[560px] sm:max-h-[80vh] bg-[#1f2125] border border-[#3a3d42] sm:rounded-2xl max-sm:rounded-none shadow-2xl shadow-black/40 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2d2f33] shrink-0">
              <div className="w-9 h-9 rounded-full bg-linear-to-br from-[#2ca4ab] to-[#258a90] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white leading-tight">Quran AI</h3>
                <p className="text-xs text-gray-500 leading-tight">Ask anything about the Quran</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#2d2f33] text-gray-400 hover:text-white transition-colors sm:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#2ca4ab] text-white rounded-br-md'
                        : 'bg-[#2d2f33] text-gray-200 rounded-bl-md'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      msg.isLoading && !msg.content ? (
                        <ThinkingLoader />
                      ) : (
                        <div className="markdown-body">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      )
                    ) : (
                      <p className="whitespace-pre-wrap wrap-break-word">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-[#2d2f33] shrink-0">
              <div className="flex items-center gap-2 bg-[#2d2f33] rounded-xl px-3 py-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about the Quran..."
                  disabled={isStreaming}
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none disabled:opacity-50 min-w-0"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isStreaming}
                  className="p-2 rounded-lg bg-[#2ca4ab] hover:bg-[#258a90] text-white transition-colors disabled:opacity-30 disabled:hover:bg-[#2ca4ab] shrink-0"
                >
                  {isStreaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-600 text-center mt-1.5">
                Powered by Z.ai • Responses may not be fully accurate
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
