'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import SurahCard from '../components/SurahCard';
import { Bookmark, Star, FileText, Download, Trash2, ArrowRight } from 'lucide-react';
import { SURAHS } from '@/lib/quran/surahMetadata';
import {
  useSurahBookmarks,
  useAyahBookmarks,
  useStudyNotes,
  useReadingProgress,
} from '@/lib/hooks/usePersistentState';
import type { BookmarkEntry, StudyNote, SurahMeta } from '@/lib/quran/types';

type ActiveTab = 'surahs' | 'ayahs' | 'notes';

function BookmarkedSurahsPanel({
  surahs,
  onToggleBookmark,
}: Readonly<{
  surahs: SurahMeta[];
  onToggleBookmark: (surahNumber: number) => void;
}>) {
  if (surahs.length === 0) {
    return (
      <div className="text-center py-16 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6">
        <Star className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
        <p className="text-sm font-medium text-[var(--foreground)]">No surahs bookmarked yet</p>
        <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">
          Click the bookmark icon on any Surah card to save it here.
        </p>
        <Link
          href="/surah"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-colors"
        >
          Browse Surahs <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {surahs.map((surah) => (
        <SurahCard
          key={surah.number}
          surah={surah}
          isBookmarked={true}
          onToggleBookmark={() => onToggleBookmark(surah.number)}
        />
      ))}
    </div>
  );
}

function BookmarkedAyahsPanel({
  bookmarks,
  onRemove,
}: Readonly<{
  bookmarks: BookmarkEntry[];
  onRemove: (key: string) => void;
}>) {
  if (bookmarks.length === 0) {
    return (
      <div className="text-center py-16 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6">
        <Bookmark className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
        <p className="text-sm font-medium text-[var(--foreground)]">No ayahs bookmarked yet</p>
        <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">
          Click the bookmark icon beside any Ayah in the reader to save it.
        </p>
        <Link
          href="/surah/1"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-colors"
        >
          Start Reading <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {bookmarks.map((bm) => {
        const surah = SURAHS[bm.surahNumber - 1];
        const formattedDate = bm.savedAt
          ? `Saved on ${new Date(bm.savedAt).toISOString().slice(0, 10)}`
          : 'Saved';
        return (
          <div
            key={bm.key}
            className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between gap-3 hover:border-[var(--primary)] transition-colors group"
          >
            <Link href={`/surah/${bm.surahNumber}?ayah=${bm.ayahNumber}`} className="flex-1 min-w-0">
              <div className="font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors flex items-center gap-2">
                <span>{surah?.englishName ?? `Surah ${bm.surahNumber}`}</span>
                <span className="text-[var(--primary)] text-sm">
                  {bm.surahNumber}:{bm.ayahNumber}
                </span>
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-2">
                <span>{formattedDate}</span>
                {bm.collection && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--border)] text-[10px] text-[var(--text-muted)]">
                    {bm.collection}
                  </span>
                )}
              </div>
            </Link>

            <button
              type="button"
              onClick={() => onRemove(bm.key)}
              aria-label={`Remove bookmark ${bm.key}`}
              className="p-2 text-[var(--text-muted)] hover:text-red-400 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function parseNoteReference(key: string): { surahNumber: number; ayahNumber: number } {
  const [sNumRaw, aNumRaw] = key.split(':').map(Number);
  const surahNumber = Number.isInteger(sNumRaw) && sNumRaw >= 1 && sNumRaw <= 114 ? sNumRaw : 1;
  const ayahNumber = Number.isInteger(aNumRaw) && aNumRaw >= 1 ? aNumRaw : 1;
  return { surahNumber, ayahNumber };
}

function StudyNotesPanel({
  notes,
  onDelete,
}: Readonly<{
  notes: Array<[string, StudyNote]>;
  onDelete: (key: string) => void;
}>) {
  if (notes.length === 0) {
    return (
      <div className="text-center py-16 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6">
        <FileText className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
        <p className="text-sm font-medium text-[var(--foreground)]">No study notes found</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Open any Ayah in the reader and select &ldquo;Add Study Note&rdquo; to record your thoughts.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map(([key, item]) => {
        const { surahNumber, ayahNumber } = parseNoteReference(key);
        const surah = SURAHS[surahNumber - 1];
        return (
          <div
            key={key}
            className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <Link
                  href={`/surah/${surahNumber}?ayah=${ayahNumber}`}
                  className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)] text-sm flex items-center gap-1.5"
                >
                  <span>{surah?.englishName}</span>
                  <span className="text-[var(--primary)]">{key}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(key)}
                  aria-label={`Delete note for ${key}`}
                  className="p-1 text-[var(--text-muted)] hover:text-red-400 rounded hover:bg-[var(--surface-elevated)] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs sm:text-sm text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                {item.note}
              </p>
            </div>

            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-[var(--border)]">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded bg-[var(--surface-elevated)] text-[10px] text-[var(--text-muted)] border border-[var(--border)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BookmarksPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('surahs');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [exportJsonString, setExportJsonString] = useState<string | null>(null);

  const { bookmarks: surahBookmarkIds, toggleBookmark: toggleSurahBookmark } = useSurahBookmarks();
  const { bookmarks: ayahBookmarkList, removeBookmark: removeAyahBookmark } = useAyahBookmarks();
  const { notes, deleteNote } = useStudyNotes();
  const { progress } = useReadingProgress();

  const bookmarkedSurahs = useMemo(
    () => SURAHS.filter((s) => surahBookmarkIds.includes(s.number)),
    [surahBookmarkIds]
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    Object.values(notes).forEach((n) => {
      n.tags?.forEach((t) => set.add(t));
    });
    return Array.from(set);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const entries = Object.entries(notes);
    if (selectedTag === 'all') return entries;
    return entries.filter(([, val]) => val.tags?.includes(selectedTag));
  }, [notes, selectedTag]);

  const handleExportJson = () => {
    const data = {
      ayahBookmarks: ayahBookmarkList,
      surahBookmarks: surahBookmarkIds,
      studyNotes: notes,
      readingProgress: progress,
      exportedAt: new Date().toISOString(),
    };
    const jsonStr = JSON.stringify(data, null, 2);
    setExportJsonString(jsonStr);

    try {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quran-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Handled by pre render
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
              <Bookmark className="w-7 h-7 text-[var(--primary)]" />
              Bookmarks &amp; Study Notes
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Your saved verses, surahs, and personal study reflections
            </p>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'notes' && (
              <div className="flex items-center gap-2">
                <label htmlFor="bm-tag-filter" className="text-xs text-[var(--text-muted)]">
                  Filter by collection tag:
                </label>
                <select
                  id="bm-tag-filter"
                  aria-label="Filter by collection tag"
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="px-3 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                >
                  <option value="all">All Tags</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              id="bm-export-btn"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--surface-elevated)] hover:bg-[var(--card-hover)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--foreground)] transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[var(--primary)]" />
              Export JSON
            </button>
          </div>
        </div>

        {exportJsonString && (
          <pre id="bm-export-preview" className="sr-only">
            {exportJsonString}
          </pre>
        )}

        <div role="tablist" aria-label="Bookmarks sections" className="flex border-b border-[var(--border)] gap-6 mb-8">
          <button
            type="button"
            role="tab"
            id="tab-surahs"
            aria-selected={activeTab === 'surahs'}
            onClick={() => setActiveTab('surahs')}
            className={`pb-3 font-semibold text-sm transition-colors relative flex items-center gap-2 ${
              activeTab === 'surahs'
                ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Star className="w-4 h-4" />
            <span>Surahs ({bookmarkedSurahs.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-ayahs"
            aria-selected={activeTab === 'ayahs'}
            onClick={() => setActiveTab('ayahs')}
            className={`pb-3 font-semibold text-sm transition-colors relative flex items-center gap-2 ${
              activeTab === 'ayahs'
                ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Ayahs ({ayahBookmarkList.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-notes"
            aria-selected={activeTab === 'notes'}
            onClick={() => setActiveTab('notes')}
            className={`pb-3 font-semibold text-sm transition-colors relative flex items-center gap-2 ${
              activeTab === 'notes'
                ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Study Notes ({Object.keys(notes).length})</span>
          </button>
        </div>

        {activeTab === 'surahs' && (
          <BookmarkedSurahsPanel
            surahs={bookmarkedSurahs}
            onToggleBookmark={toggleSurahBookmark}
          />
        )}

        {activeTab === 'ayahs' && (
          <BookmarkedAyahsPanel
            bookmarks={ayahBookmarkList}
            onRemove={removeAyahBookmark}
          />
        )}

        {activeTab === 'notes' && (
          <StudyNotesPanel notes={filteredNotes} onDelete={deleteNote} />
        )}
      </main>
    </div>
  );
}
