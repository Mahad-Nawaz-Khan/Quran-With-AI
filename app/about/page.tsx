'use client';

import Link from 'next/link';
import Header from '../components/Header';
import { BookOpen, ShieldCheck, Database, Sparkles, ArrowLeft } from 'lucide-react';

export default function AboutPage() {
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
            <BookOpen className="w-8 h-8 text-[var(--primary)]" />
            About Quranic AI &amp; Data Sources
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
            A comprehensive, modern Quran study platform built with a strict zero-hallucination policy to ensure every verse, translation, and explanation is authoritative and faithful.
          </p>
        </div>

        <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-base font-bold text-[var(--foreground)]">
            <Database className="w-5 h-5 text-[var(--primary)]" />
            <h2>Authoritative Data Sources</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            Quranic Arabic text and multilingual translations are retrieved from the verified <strong>Al-Quran Cloud</strong> API and Quran.com v4 endpoints. Classical tafsir commentaries (including Tafsir Ibn Kathir, Tafsir al-Jalalayn, and Ma&apos;arif al-Qur&apos;an) are served from authenticated tafsir repositories.
          </p>
        </section>

        <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-base font-bold text-[var(--foreground)]">
            <ShieldCheck className="w-5 h-5 text-[var(--primary)]" />
            <h2>Zero-Hallucination Architecture</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            Because this application deals with the sacred text of the Holy Quran, the AI agent is forbidden from generating Quranic Arabic or Hadith citations from parametric model memory. Every verse reference is checked against canonical 114-Surah bounds, verified against retrieved scripture text, and unverified citations are deterministically refused.
          </p>
        </section>

        <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-base font-bold text-[var(--foreground)]">
            <Sparkles className="w-5 h-5 text-[var(--primary)]" />
            <h2>AI Infrastructure</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            Language model routing and inference are provided through OpenRouter, backed by strict server-side pre-guards, retrieval augmentation, and post-generation grounding guardrails.
          </p>
        </section>
      </main>
    </div>
  );
}
