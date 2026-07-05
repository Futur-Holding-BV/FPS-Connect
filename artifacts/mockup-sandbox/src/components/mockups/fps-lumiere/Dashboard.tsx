import React from "react";
import { LayoutGrid, FolderKanban, MapPin, ClipboardCheck, FileText, Search, User } from "lucide-react";

export function Dashboard() {
  return (
    <div className="flex min-h-screen bg-white text-[#111111] font-sans selection:bg-[#F23B0D] selection:text-white">
      {/* Navigation Rail */}
      <nav className="w-[60px] flex-shrink-0 flex flex-col items-center py-10 border-r border-[#F0F0F0]/50 sticky top-0 h-screen">
        <div className="w-8 h-8 bg-[#111111] flex items-center justify-center mb-16 rounded-sm">
          <span className="text-white text-[10px] font-bold tracking-wider">FPS</span>
        </div>
        
        <div className="flex flex-col gap-10 text-[#555555]">
          <button className="text-[#111111] relative group">
            <LayoutGrid size={20} strokeWidth={1.5} />
            <div className="absolute -left-5 top-1/2 -translate-y-1/2 w-1 h-4 bg-[#F23B0D]"></div>
          </button>
          <button className="hover:text-[#111111] transition-colors"><FolderKanban size={20} strokeWidth={1.5} /></button>
          <button className="hover:text-[#111111] transition-colors"><MapPin size={20} strokeWidth={1.5} /></button>
          <button className="hover:text-[#111111] transition-colors"><ClipboardCheck size={20} strokeWidth={1.5} /></button>
          <button className="hover:text-[#111111] transition-colors"><FileText size={20} strokeWidth={1.5} /></button>
        </div>

        <div className="mt-auto flex flex-col gap-8">
          <button className="text-[#555555] hover:text-[#111111] transition-colors"><Search size={20} strokeWidth={1.5} /></button>
          <button className="text-[#555555] hover:text-[#111111] transition-colors"><User size={20} strokeWidth={1.5} /></button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 px-20 py-24 max-w-[1400px]">
        {/* Header */}
        <header className="mb-32">
          <h2 className="text-[11px] font-semibold tracking-[0.2em] text-[#555555] uppercase mb-4">Overzicht</h2>
          <h1 className="text-[64px] font-light leading-none tracking-tight">Vandaag</h1>
        </header>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-20 mb-32">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold tracking-[0.2em] text-[#555555] uppercase mb-4">Actieve Spots</span>
            <span className="text-[52px] font-light leading-none">127</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold tracking-[0.2em] text-[#555555] uppercase mb-4">Gem. Compliant</span>
            <span className="text-[52px] font-light leading-none">94%</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold tracking-[0.2em] text-[#555555] uppercase mb-4">Inspecties Week</span>
            <span className="text-[52px] font-light leading-none">3</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold tracking-[0.2em] text-[#555555] uppercase mb-4">Open Herstel</span>
            <span className="text-[52px] font-light leading-none">1</span>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-20">
          {/* Projects */}
          <div className="col-span-8">
            <h2 className="text-[11px] font-semibold tracking-[0.2em] text-[#555555] uppercase mb-16">Actieve Projecten</h2>
            
            <div className="flex flex-col gap-16">
              {/* Project 1 */}
              <div className="group cursor-pointer">
                <h3 className="text-[48px] font-light leading-tight tracking-tight group-hover:opacity-60 transition-opacity">Brandweer Rotterdam Noord</h3>
                <div className="flex gap-12 mt-4 text-[#555555]">
                  <span className="text-[13px]">14 SPOTS</span>
                  <span className="text-[13px]">89% COMPLIANT</span>
                </div>
              </div>

              {/* Project 2 */}
              <div className="group cursor-pointer">
                <h3 className="text-[48px] font-light leading-tight tracking-tight group-hover:opacity-60 transition-opacity">Ziekenhuis AMC - Toren B</h3>
                <div className="flex gap-12 mt-4 text-[#555555]">
                  <span className="text-[13px]">52 SPOTS</span>
                  <span className="text-[13px]">67% COMPLIANT</span>
                </div>
              </div>

              {/* Project 3 */}
              <div className="group cursor-pointer">
                <h3 className="text-[48px] font-light leading-tight tracking-tight group-hover:opacity-60 transition-opacity">ProRail Utrecht Station</h3>
                <div className="flex gap-12 mt-4 text-[#555555]">
                  <span className="text-[13px]">8 SPOTS</span>
                  <span className="text-[13px]">100% COMPLIANT</span>
                </div>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="col-span-4">
            <h2 className="text-[11px] font-semibold tracking-[0.2em] text-[#555555] uppercase mb-16">Recente Activiteit</h2>
            
            <div className="flex flex-col gap-10">
              <div className="pb-8 border-b border-[#F0F0F0]">
                <p className="text-[15px] leading-relaxed mb-2">Spot BD-042 goedgekeurd</p>
                <p className="text-[11px] tracking-wider text-[#555555] uppercase">J. de Vries</p>
              </div>
              <div className="pb-8 border-b border-[#F0F0F0]">
                <p className="text-[15px] leading-relaxed mb-2">Inspectie afgerond Toren B</p>
                <p className="text-[11px] tracking-wider text-[#555555] uppercase">Systeem</p>
              </div>
              <div className="pb-8 border-b border-[#F0F0F0]">
                <p className="text-[15px] leading-relaxed mb-2">Nieuw project aangemaakt</p>
                <p className="text-[11px] tracking-wider text-[#555555] uppercase">M. Klaassen</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
