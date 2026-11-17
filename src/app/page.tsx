'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import BrandLogo from '@/components/BrandLogo';

const Editor = dynamic(() => import('@/components/Editor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-editor-bg">
      <div className="flex flex-col items-center gap-3">
        <BrandLogo size={44} className="animate-pulse" />
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
          <BrandLogo size={32} />
          <div className="flex items-center gap-1.5 font-black text-sm tracking-tight">
            <span className="text-white text-base">VDCD</span>
            <span className="inline-block px-1.5 py-0.5 rounded-md text-xs font-black text-[#111111] bg-[#F59E0B] shadow-sm transform -rotate-2 select-none">
              Húp
            </span>
          </div>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-accent/20 text-accent border border-accent/30">
            v3.2.0
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
