'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Clock } from 'lucide-react';

const Editor = dynamic(() => import('@/components/Editor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-editor-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center animate-pulse">
          <Clock size={20} className="text-black" />
        </div>
        <div className="text-xs text-neutral-500">Đang tải VDCD Húp...</div>
      </div>
    </div>
  ),
});

export default function HomePage() {
  return (
    <div className="h-[100dvh] flex flex-col bg-editor-bg text-white overflow-hidden overscroll-none">
      {/* ---------------- Slim Sticky Top Header (48px) ---------------- */}
      <header className="h-12 flex-none border-b border-editor-border bg-editor-surface/90 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between z-40">
        {/* Left: Brand Icon & Version Badge */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-sm">
            <span className="font-extrabold text-xs text-black">VH</span>
          </div>
          <span className="text-sm font-bold tracking-tight">
            VDCD <span className="text-accent">Húp</span>
          </span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-accent/20 text-accent border border-accent/30">
            v2.2.1
          </span>
        </div>
      </header>

      {/* ---------------- Workspace ---------------- */}
      <main className="flex-1 overflow-hidden relative">
        <Editor />
      </main>
    </div>
  );
}
