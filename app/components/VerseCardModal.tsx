'use client';

import { useEffect, useRef, useState, useId } from 'react';
import { X, BookMarked, Copy, Check, Trash2, Tag, Save } from 'lucide-react';
import { copyTextToClipboard } from '@/lib/browser/clipboard';
import { useStudyNotes } from '@/lib/hooks/usePersistentState';
import type { StudyNote } from '@/lib/quran/types';

interface VerseCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  surahNumber: number;
  ayahNumber: number;
  surahName: string;
  arabicText?: string;
  translationText?: string;
  initialTab?: 'notes' | 'card';
}

function parseCommaTags(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

interface NotesTabPanelProps {
  noteTextareaId: string;
  tagInputId: string;
  noteContent: string;
  tagInput: string;
  tags: string[];
  hasExistingNote: boolean;
  onNoteChange: (value: string) => void;
  onTagInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onSaveNote: () => void;
  onDeleteNote: () => void;
}

function NotesTabPanel({
  noteTextareaId,
  tagInputId,
  noteContent,
  tagInput,
  tags,
  hasExistingNote,
  onNoteChange,
  onTagInputChange,
  onAddTag,
  onRemoveTag,
  onSaveNote,
  onDeleteNote,
}: NotesTabPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={noteTextareaId}
          className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
        >
          Note
        </label>
        <textarea
          id={noteTextareaId}
          rows={5}
          value={noteContent}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Record your thoughts, linguistic insights, or action points for this ayah..."
          className="w-full p-3 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl text-xs sm:text-sm text-[var(--foreground)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)] resize-none"
        />
      </div>

      <div>
        <label
          htmlFor={tagInputId}
          className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
        >
          Tags
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              id={tagInputId}
              type="text"
              value={tagInput}
              onChange={(e) => onTagInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddTag();
                }
              }}
              placeholder="Add comma-separated tags (e.g. Patience, Resilience)..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
            />
          </div>
          <button
            type="button"
            onClick={onAddTag}
            className="px-3 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--card-hover)] border border-[var(--border)] text-xs text-[var(--foreground)] rounded-lg transition-colors"
          >
            Add
          </button>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--primary)]/15 border border-[var(--primary)]/30 text-[var(--primary)] rounded text-xs"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="hover:opacity-75"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        {hasExistingNote ? (
          <button
            type="button"
            onClick={onDeleteNote}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:opacity-80 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Note
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={onSaveNote}
          className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-dark)] text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Save className="w-3.5 h-3.5" /> Save Note
        </button>
      </div>
    </div>
  );
}

interface CardTabPanelProps {
  surahName: string;
  surahNumber: number;
  ayahNumber: number;
  arabicText?: string;
  translationText?: string;
  copied: boolean;
  onCopyCard: () => void;
}

function CardTabPanel({
  surahName,
  surahNumber,
  ayahNumber,
  arabicText,
  translationText,
  copied,
  onCopyCard,
}: CardTabPanelProps) {
  return (
    <div className="space-y-4">
      <div
        id="shareable-verse-card"
        className="p-6 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-2xl shadow-lg space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 bg-[var(--primary)] text-white text-xs font-bold rounded-lg flex items-center justify-center">
              {ayahNumber}
            </span>
            <span className="text-sm font-semibold text-[var(--foreground)]">
              Surah {surahName}
            </span>
          </div>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            Quran {surahNumber}:{ayahNumber}
          </span>
        </div>

        {arabicText && (
          <p
            className="font-arabic text-xl sm:text-2xl text-right text-[var(--foreground)] leading-relaxed py-2"
            dir="rtl"
          >
            {arabicText}
          </p>
        )}

        {translationText && (
          <p className="text-xs sm:text-sm text-[var(--text-muted)] italic leading-relaxed">
            &ldquo;{translationText}&rdquo;
          </p>
        )}

        <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>Verified Quran Study Companion</span>
          <span className="text-[var(--primary)] font-semibold">quran-ai</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCopyCard}
          className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-dark)] text-white text-xs font-medium rounded-lg transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-white" /> Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copy Card
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface InnerProps extends VerseCardModalProps {
  existingNote?: StudyNote;
  onSave: (key: string, note: string, tags: string[]) => void;
  onDelete: (key: string) => void;
}

function VerseCardModalContent({
  onClose,
  surahNumber,
  ayahNumber,
  surahName,
  arabicText,
  translationText,
  initialTab = 'notes',
  existingNote,
  onSave,
  onDelete,
}: InnerProps) {
  const tagInputId = useId();
  const noteTextareaId = useId();
  const ayahKey = `${surahNumber}:${ayahNumber}`;

  const [activeTab, setActiveTab] = useState<'notes' | 'card'>(initialTab);
  const [noteContent, setNoteContent] = useState(() => existingNote?.note ?? '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(() => existingNote?.tags ?? []);
  const [copied, setCopied] = useState(false);

  const handleAddTag = () => {
    const parsed = parseCommaTags(tagInput);
    if (parsed.length === 0) return;
    setTags((prev) => Array.from(new Set([...prev, ...parsed])));
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleSaveNote = () => {
    const mergedTags = Array.from(new Set([...tags, ...parseCommaTags(tagInput)]));
    onSave(ayahKey, noteContent, mergedTags);
    setTags(mergedTags);
    setTagInput('');
    onClose();
  };

  const handleDeleteNote = () => {
    onDelete(ayahKey);
    setNoteContent('');
    setTags([]);
  };

  const handleCopyCard = async () => {
    const cardText = [
      `Quran ${surahNumber}:${ayahNumber} (${surahName})`,
      '',
      arabicText ?? '',
      '',
      translationText ? `"${translationText}"` : '',
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    const copiedOk = await copyTextToClipboard(cardText);
    if (copiedOk) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeTabClass = 'border-[var(--primary)] text-[var(--primary)]';
  const inactiveTabClass = 'border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]';

  return (
    <div className="bg-[var(--card-bg)] text-[var(--foreground)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden m-4 flex flex-col max-h-[85vh]">
      <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-elevated)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <BookMarked className="w-5 h-5 text-[var(--primary)]" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Study Notes &amp; Verse Card
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Surah {surahName} • Verse {surahNumber}:{ayahNumber}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--card-hover)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 pt-3 flex gap-2 border-b border-[var(--border)] bg-[var(--surface-elevated)]">
        <button
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'notes' ? activeTabClass : inactiveTabClass
          }`}
        >
          Personal Study Note
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('card')}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'card' ? activeTabClass : inactiveTabClass
          }`}
        >
          Verified Verse Card
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'notes' ? (
          <NotesTabPanel
            noteTextareaId={noteTextareaId}
            tagInputId={tagInputId}
            noteContent={noteContent}
            tagInput={tagInput}
            tags={tags}
            hasExistingNote={Boolean(existingNote)}
            onNoteChange={setNoteContent}
            onTagInputChange={setTagInput}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            onSaveNote={handleSaveNote}
            onDeleteNote={handleDeleteNote}
          />
        ) : (
          <CardTabPanel
            surahName={surahName}
            surahNumber={surahNumber}
            ayahNumber={ayahNumber}
            arabicText={arabicText}
            translationText={translationText}
            copied={copied}
            onCopyCard={() => void handleCopyCard()}
          />
        )}
      </div>

      <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-elevated)] flex items-center justify-between text-xs text-[var(--text-muted)] shrink-0">
        <span>Persisted locally in your browser storage</span>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 bg-[var(--card-bg)] hover:bg-[var(--card-hover)] border border-[var(--border)] text-[var(--foreground)] rounded-lg transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export default function VerseCardModal(props: VerseCardModalProps) {
  const { isOpen, onClose, surahNumber, ayahNumber, initialTab = 'notes' } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { notes, saveNote, deleteNote } = useStudyNotes();
  const ayahKey = `${surahNumber}:${ayahNumber}`;
  const existingNote = notes[ayahKey];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target === dialog) onClose();
    };
    dialog.addEventListener('click', handleBackdropClick);
    return () => dialog.removeEventListener('click', handleBackdropClick);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="fixed inset-0 z-50 p-0 m-auto bg-transparent backdrop:bg-black/60 max-w-xl w-full"
    >
      {isOpen && (
        <VerseCardModalContent
          key={`${ayahKey}-${initialTab}`}
          {...props}
          existingNote={existingNote}
          onSave={saveNote}
          onDelete={deleteNote}
        />
      )}
    </dialog>
  );
}
