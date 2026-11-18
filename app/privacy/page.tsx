'use client';

import Link from 'next/link';
import Header from '../components/Header';
import { Lock, HardDrive, EyeOff, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-20 space-y-8">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--primary)] hover:underline mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Overview
          </Link>
          <h1 className="text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
            <Lock className="w-8 h-8 text-[var(--primary)]" />
            Privacy Policy &amp; Local Storage
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
            Your personal worship, study notes, bookmarks, and reading history belong exclusively to you.
          </p>
        </div>

        <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-base font-bold text-[var(--foreground)]">
            <HardDrive className="w-5 h-5 text-[var(--primary)]" />
            <h2>Client-Side LocalStorage</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            All user data — including bookmarked surahs, bookmarked ayahs, personal study reflections, reading progress, and interface preferences — is stored locally in your browser&apos;s <strong>localStorage</strong>. None of your personal study notes or bookmark collections are transmitted to or stored on our servers.
          </p>
        </section>

        <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-base font-bold text-[var(--foreground)]">
            <EyeOff className="w-5 h-5 text-[var(--primary)]" />
            <h2>Zero Tracking &amp; Analytics</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            We do not use third-party analytics, behavioral tracking cookies, or advertising identifiers. When you ask questions in the AI companion, only the query prompt and necessary scripture context are sent to the AI processing endpoint to generate your grounded response.
          </p>
        </section>
      </main>
    </div>
  );
}
