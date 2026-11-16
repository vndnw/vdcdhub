'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Clock, Sparkles } from 'lucide-react';

const Editor = dynamic(() => import('@/components/Editor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-editor-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center animate-pulse">
          <Clock size={20} className="text-black" />
        </div>
        <div className="text-xs text-neutral-500">Đang tải Timemark...</div>
      </div>
    </div>
  ),
});

const GeminiAutoRemover = dynamic(() => import('@/components/GeminiAutoRemover'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-editor-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center animate-pulse">
          <Sparkles size={20} className="text-white" />
        </div>
        <div className="text-xs text-neutral-500">Đang tải Xóa Logo...</div>
      </div>
    </div>
  ),
});

type AppTab = 'timemark' | 'gemini-remover';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<AppTab>('timemark');

  return (
    <div className="h-[100dvh] flex flex-col bg-editor-bg text-white overflow-hidden overscroll-none">
      {/* ---------------- Slim Sticky Top Header (48px) ---------------- */}
      <header className="h-12 flex-none border-b border-editor-border bg-editor-surface/90 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between z-40">
        {/* Left: Brand Icon (Hidden or compact on mobile) */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-sm">
            <span className="font-extrabold text-xs text-black">TM</span>
          </div>
          <span className="text-xs font-bold tracking-tight hidden sm:inline">
            Time<span className="text-accent">mark</span> Studio
          </span>
        </div>

        {/* Center: Clean 2-Tab Pill Switcher */}
        <nav className="flex items-center p-0.5 bg-black/50 border border-editor-border rounded-xl">
          <button
            onClick={() => setActiveTab('timemark')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[34px] ${
              activeTab === 'timemark'
                ? 'bg-accent text-black shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Clock size={13} />
            <span>Timemark</span>
          </button>

          <button
            onClick={() => setActiveTab('gemini-remover')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[34px] ${
              activeTab === 'gemini-remover'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Sparkles size={13} />
            <span>Xóa Logo</span>
          </button>
        </nav>

        {/* Right placeholder for balance */}
        <div className="w-7 flex justify-end">
          <span className="w-2 h-2 rounded-full bg-emerald-500/80" title="Client-Side" />
        </div>
      </header>

      {/* ---------------- Workspace ---------------- */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'timemark' ? <Editor /> : <GeminiAutoRemover />}
      </main>
    </div>
  );
}
