'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle, X, Send, Sparkles, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ThinkingLoader from './ThinkingLoader';
import { streamExplain, type ExplainStreamCallbacks } from '@/lib/ai/streamClient';
import { isValidReference } from '@/lib/quran/surahMetadata';
import type { ExplainSourceRecord, ChatHistoryItem } from '@/lib/quran/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: string;
  isLoading?: boolean;
  verified?: boolean;
  refusal?: boolean;
  sources?: ExplainSourceRecord[];
}

interface AskAiDetail {
  surah: number;
  ayah: number;
  text?: string;
}

declare global {
  interface Window {
    updateChatFabPosition?: () => void;
    openChatWithContext?: (surah: number, ayah: number, text?: string) => void;
  }
}

const VERSE_REF_REGEX = /\[?(\d{1,3}):(\d{1,3})\]?/g;
const INITIAL_WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Assalamu Alaikum! 🕌\n\nI'm your grounded Quran AI assistant. Ask me questions about Quranic verses, themes, or historical context. All answers are strictly grounded in verified Quranic text and classical tafsir.",
};

function renderCitationsInText(text: string): string {
  return text.replace(
    VERSE_REF_REGEX,
    (match: string, rawSurah: string, rawAyah: string, offset: number, full: string) => {
      const surahNum = Number(rawSurah);
      const ayahNum = Number(rawAyah);
      if (!isValidReference(surahNum, ayahNum)) {
        return match;
      }
      const nextChar = full.charAt(offset + match.length);
      const prefix = full.slice(Math.max(0, offset - 8), offset);
      if (nextChar === '(' || prefix.endsWith('/surah/')) {
        return match;
      }
      return `[${surahNum}:${ayahNum}](/surah/${surahNum}?ayah=${ayahNum})`;
    }
  );
}

function updateMessageById(
  messages: Message[],
  targetId: string,
  patch: Partial<Message>
): Message[] {
  return messages.map((msg) => (msg.id === targetId ? { ...msg, ...patch } : msg));
}

function parseAskAiDetail(event: Event): AskAiDetail | null {
  if (!(event instanceof CustomEvent) || typeof event.detail !== 'object' || event.detail === null) {
    return null;
  }
  const candidate: Record<string, unknown> = event.detail;
  if (typeof candidate.surah !== 'number' || typeof candidate.ayah !== 'number') {
    return null;
  }
  const text = typeof candidate.text === 'string' ? candidate.text : undefined;
  return { surah: candidate.surah, ayah: candidate.ayah, text };
}

function measureAudioPlayerBottomOffset(): number {
  const audioBar =
    document.getElementById('audio-player-bar') ??
    document.querySelector('[aria-label*="Audio"]') ??
    document.querySelector('.audio-player');

  if (!audioBar || audioBar.hasAttribute('hidden')) {
    return 24;
  }
  const height = Math.ceil(audioBar.getBoundingClientRect().height);
  if (height <= 0) return 24;
  return Math.max(104, height + 16);
}

function MessageSources({
  sources,
  statusKind,
}: {
  sources: ExplainSourceRecord[];
  statusKind: 'refusal' | 'verified';
}) {
  const isRefusal = statusKind === 'refusal';
  return (
    <div className="mt-3 pt-2.5 border-t border-[var(--border)] text-xs">
      <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1.5">
        {isRefusal ? (
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
        )}
        <span className="font-medium text-[var(--foreground)]">
          {isRefusal ? 'Refusal / Out of Bounds' : 'Verified Sources'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((src) => {
          const refParts = src.reference.split(':');
          const surahPart = refParts[0] ?? '1';
          const ayahPart = refParts[1] ?? '1';
          return (
            <Link
              key={`${src.type}-${src.reference}-${src.label}`}
              href={`/surah/${surahPart}?ayah=${ayahPart}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--card-bg)] border border-[var(--border)] text-[11px] text-[var(--primary)] hover:border-[var(--primary)] transition-colors"
            >
              <span>[{src.reference}]</span>
              <span className="text-[var(--text-muted)] font-normal">({src.label})</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AssistantMessageContent({
  message,
  currentStatus,
}: {
  message: Message;
  currentStatus?: string;
}) {
  if (message.isLoading && !message.content) {
    return <ThinkingLoader status={currentStatus} />;
  }

  const sourceStatusKind = message.refusal ? 'refusal' : 'verified';

  return (
    <div>
      <div className="markdown-body text-sm text-[var(--foreground)]">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => (
              <Link
                href={href ?? '#'}
                className="text-[var(--primary)] font-medium underline underline-offset-2 hover:opacity-80"
              >
                {children}
              </Link>
            ),
          }}
        >
          {renderCitationsInText(message.content)}
        </ReactMarkdown>
      </div>

      {message.sources && message.sources.length > 0 && (
        <MessageSources sources={message.sources} statusKind={sourceStatusKind} />
      )}
    </div>
  );
}

interface ChatPanelProps {
  bottomOffset: number;
  messages: Message[];
  currentStatus?: string;
  contextBanner: string | null;
  input: string;
  isStreaming: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onClearContext: () => void;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function ChatPanel({
  bottomOffset,
  messages,
  currentStatus,
  contextBanner,
  input,
  isStreaming,
  inputRef,
  messagesEndRef,
  onClose,
  onClearContext,
  onInputChange,
  onSubmit,
}: ChatPanelProps) {
  return (
    <section
      aria-label="Quran AI Assistant"
      id="chat-panel"
      style={{ bottom: `${bottomOffset + 60}px` }}
      className="fixed z-40 right-4 sm:right-6 max-sm:inset-x-2 max-sm:top-16 flex flex-col"
    >
      <div className="w-full sm:w-[400px] max-sm:h-full sm:h-[580px] sm:max-h-[80vh] bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[var(--foreground)]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-elevated)] shrink-0">
          <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[var(--foreground)] leading-tight">Quran AI</h3>
            <p className="text-[11px] text-[var(--text-muted)] leading-tight">Grounded &amp; Zero-Hallucination</p>
          </div>
          <button
            id="chat-close-btn"
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="p-1 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {contextBanner && (
          <div
            id="chat-context-banner"
            className="px-4 py-1.5 text-xs text-[var(--primary)] bg-[var(--surface-elevated)] border-b border-[var(--border)] flex items-center justify-between"
          >
            <span className="font-semibold">{contextBanner}</span>
            <button
              type="button"
              onClick={onClearContext}
              className="text-[var(--text-muted)] hover:text-[var(--foreground)] text-[10px]"
              aria-label="Clear verse context"
            >
              Clear
            </button>
          </div>
        )}

        <output
          id="chat-status"
          aria-live="polite"
          className="px-4 py-1.5 text-xs text-[var(--text-muted)] border-b border-[var(--border)] bg-[var(--surface-elevated)] flex items-center gap-2 min-h-[28px]"
        >
          {currentStatus ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-ping inline-block shrink-0" />
              <span className="text-[var(--primary)] font-medium">{currentStatus}</span>
            </>
          ) : (
            <span className="text-[var(--text-muted)]">Verified Quran AI Companion</span>
          )}
        </output>

        <div id="chat-messages" role="log" aria-live="polite" className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 text-sm">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[var(--primary)] text-white rounded-br-sm'
                    : 'bg-[var(--surface-elevated)] text-[var(--foreground)] rounded-bl-sm border border-[var(--border)]'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <AssistantMessageContent message={msg} currentStatus={currentStatus} />
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-elevated)] shrink-0">
          <form
            id="chat-form"
            onSubmit={onSubmit}
            className="flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl px-3 py-1.5 focus-within:border-[var(--primary)] transition-colors"
          >
            <label htmlFor="chat-input" className="sr-only">
              Ask a question about the Quran
            </label>
            <input
              id="chat-input"
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Ask a question about the Quran..."
              disabled={isStreaming}
              className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder-[var(--text-muted)] outline-none disabled:opacity-50 min-w-0"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              aria-label="Send message"
              className="p-1.5 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white transition-colors disabled:opacity-30 shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
          <p className="text-[10px] text-[var(--text-muted)] text-center mt-1.5">
            Powered by OpenRouter • Verified Quran APIs
          </p>
        </div>
      </div>
    </section>
  );
}

function createChatStreamCallbacks(
  assistantId: string,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  setCurrentStatus: React.Dispatch<React.SetStateAction<string | undefined>>
): ExplainStreamCallbacks {
  let accumulated = '';
  return {
    onToken: (token) => {
      accumulated += token;
      setMessages((prev) =>
        updateMessageById(prev, assistantId, { content: accumulated, isLoading: false })
      );
    },
    onStatus: (status) => {
      setCurrentStatus(status);
      setMessages((prev) => updateMessageById(prev, assistantId, { status }));
    },
    onMetadata: (meta) => {
      setMessages((prev) =>
        updateMessageById(prev, assistantId, {
          verified: meta.verified,
          refusal: meta.refusal,
          sources: meta.sources,
          isLoading: false,
        })
      );
    },
    onError: (errMsg) => {
      setMessages((prev) =>
        updateMessageById(prev, assistantId, {
          content: errMsg || 'AI service is temporarily unavailable. Please retry.',
          isLoading: false,
        })
      );
    },
  };
}

function useChatAudioClearance(): number {
  const [bottomOffset, setBottomOffset] = useState<number>(24);

  const updateFabPosition = useCallback(() => {
    setBottomOffset(measureAudioPlayerBottomOffset());
  }, []);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(updateFabPosition);
    const observer = new MutationObserver(updateFabPosition);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', updateFabPosition);
    window.updateChatFabPosition = updateFabPosition;

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', updateFabPosition);
    };
  }, [updateFabPosition]);

  return bottomOffset;
}

function buildChatHistory(messages: readonly Message[]): ChatHistoryItem[] {
  return messages
    .filter((m) => m.id !== 'welcome' && m.content.trim())
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content }));
}

function useAskAiBridge(
  openChatWithContext: (surah: number, ayah: number, text?: string) => void
) {
  useEffect(() => {
    window.openChatWithContext = openChatWithContext;
    const handleCustomEvent = (e: Event) => {
      const detail = parseAskAiDetail(e);
      if (detail) {
        openChatWithContext(detail.surah, detail.ayah, detail.text);
      }
    };
    window.addEventListener('quran:ask-ai', handleCustomEvent);
    return () => {
      window.removeEventListener('quran:ask-ai', handleCustomEvent);
    };
  }, [openChatWithContext]);
}

async function dispatchChatExplainRequest(params: {
  text: string;
  assistantId: string;
  scopedVerse: { surah: number; ayah: number } | null;
  history: ChatHistoryItem[];
  signal: AbortSignal;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setCurrentStatus: React.Dispatch<React.SetStateAction<string | undefined>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
}): Promise<void> {
  const {
    text,
    assistantId,
    scopedVerse,
    history,
    signal,
    setMessages,
    setCurrentStatus,
    setIsStreaming,
  } = params;
  try {
    const callbacks = createChatStreamCallbacks(assistantId, setMessages, setCurrentStatus);
    await streamExplain(
      {
        ayahText: text,
        translation: '',
        surahNumber: scopedVerse?.surah ?? null,
        ayahNumber: scopedVerse?.ayah ?? null,
        isSearch: scopedVerse === null,
        history,
      },
      callbacks,
      signal
    );
  } catch {
    setMessages((prev) =>
      updateMessageById(prev, assistantId, {
        content: 'AI service is temporarily unavailable. Please retry.',
        isLoading: false,
      })
    );
  } finally {
    setIsStreaming(false);
    setCurrentStatus(undefined);
  }
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | undefined>(undefined);
  const [contextBanner, setContextBanner] = useState<string | null>(null);
  const [scopedVerse, setScopedVerse] = useState<{ surah: number; ayah: number } | null>(null);

  const bottomOffset = useChatAudioClearance();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const openChatWithContext = useCallback((surah: number, ayah: number, text?: string) => {
    setIsOpen(true);
    setContextBanner(`Context: Quran ${surah}:${ayah}`);
    setScopedVerse({ surah, ayah });
    setInput(text ?? `Explain Quran ${surah}:${ayah}`);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useAskAiBridge(openChatWithContext);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;

    abortControllerRef.current?.abort();
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    const assistantId = `assistant-${Date.now()}`;
    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', content: text };
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isLoading: true,
    };

    const history = buildChatHistory(messages);
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);
    setCurrentStatus('Contacting verified Quran AI...');

    await dispatchChatExplainRequest({
      text,
      assistantId,
      scopedVerse,
      history,
      signal: abortCtrl.signal,
      setMessages,
      setCurrentStatus,
      setIsStreaming,
    });
  };

  return (
    <div id="chat-widget-root">
      <button
        id="chat-fab-btn"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{ bottom: `${bottomOffset}px` }}
        className={`fixed right-5 sm:right-6 z-40 w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
          isOpen
            ? 'bg-[var(--surface-elevated)] text-[var(--foreground)] rotate-0 scale-95 border border-[var(--border)]'
            : 'bg-[var(--primary)] text-white hover:opacity-90 hover:scale-105 shadow-[var(--primary)]/30'
        }`}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {isOpen && (
        <ChatPanel
          bottomOffset={bottomOffset}
          messages={messages}
          currentStatus={currentStatus}
          contextBanner={contextBanner}
          input={input}
          isStreaming={isStreaming}
          inputRef={inputRef}
          messagesEndRef={messagesEndRef}
          onClose={() => setIsOpen(false)}
          onClearContext={() => {
            setContextBanner(null);
            setScopedVerse(null);
          }}
          onInputChange={setInput}
          onSubmit={handleSendMessage}
        />
      )}
    </div>
  );
}
