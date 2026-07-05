import React from 'react';
import { 
  Search, 
  Bell, 
  Plus, 
  ChevronRight,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  CheckCircle2
} from 'lucide-react';

export function Dashboard() {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 selection:bg-[#4B9EFF] selection:text-white">
      {/* Top Navigation */}
      <nav className="h-[48px] bg-[#0A0F1E] text-white flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-8 h-full">
          {/* Logo area */}
          <div className="flex items-center gap-2 font-semibold tracking-wide text-sm">
            <div className="w-5 h-5 bg-[#4B9EFF] rounded-[2px] flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
            FPS CONNECT
          </div>

          {/* Nav links */}
          <div className="flex items-center gap-6 h-full text-xs font-medium tracking-wide text-gray-300">
            <button className="h-full flex items-center border-b-2 border-[#4B9EFF] text-white">Dashboard</button>
            <button className="h-full flex items-center hover:text-white transition-colors">Projecten</button>
            <button className="h-full flex items-center hover:text-white transition-colors">Spots</button>
            <button className="h-full flex items-center hover:text-white transition-colors">Inspecties</button>
            <button className="h-full flex items-center hover:text-white transition-colors">Rapporten</button>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <button className="text-gray-400 hover:text-white transition-colors">
            <Search className="w-4 h-4" strokeWidth={2} />
          </button>
          <button className="text-gray-400 hover:text-white transition-colors relative">
            <Bell className="w-4 h-4" strokeWidth={2} />
            <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-[#4B9EFF] rounded-full transform translate-x-1/2 -translate-y-1/2"></span>
          </button>
          <div className="flex items-center gap-2 pl-4 border-l border-white/10">
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
              JS
            </div>
            <span className="text-xs font-medium text-gray-300">J. Smit</span>
          </div>
        </div>
      </nav>

      {/* Main Content Canvas */}
      <main className="max-w-[1440px] mx-auto px-8 py-10">
        
        {/* Page Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <h1 className="text-[42px] font-normal leading-none tracking-tight text-gray-900 mb-2">
              Overzicht
            </h1>
            <p className="text-sm text-gray-500 font-medium tracking-wide">
              Laatste update: <span className="font-mono text-gray-900">Vandaag, 08:42</span>
            </p>
          </div>
          <button className="h-8 px-4 bg-[#4B9EFF] hover:bg-[#3A8BEB] text-white text-xs font-semibold tracking-wider uppercase flex items-center gap-2 rounded-[4px] transition-colors">
            <Plus className="w-4 h-4" />
            Nieuw Project
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-6 mb-12">
          {[
            { label: 'Actieve Spots', value: '127', trend: '+12', color: 'text-[#4B9EFF]' },
            { label: 'Gemiddeld Compliant', value: '94%', trend: '+2%', color: 'text-gray-900' },
            { label: 'Inspecties (Week)', value: '3', trend: 'Gepland', color: 'text-gray-900' },
            { label: 'Herstelacties Open', value: '1', trend: '-2', color: 'text-[#E53E3E]' },
          ].map((metric, i) => (
            <div key={i} className="p-5 border border-[#EAEEF2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] rounded-[4px]">
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-3">{metric.label}</div>
              <div className="flex items-baseline justify-between">
                <div className={`font-mono text-3xl font-medium ${metric.color}`}>{metric.value}</div>
                <div className="font-mono text-xs text-gray-400">{metric.trend}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-3 gap-8">
          
          {/* Active Projects (2 columns wide) */}
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-6 border-b border-[#EAEEF2] pb-3">
              <h2 className="text-[10px] uppercase tracking-widest text-gray-900 font-bold">Actieve Projecten</h2>
              <button className="text-[10px] uppercase tracking-widest text-[#4B9EFF] font-bold hover:underline">Toon alles</button>
            </div>
            
            <div className="flex flex-col gap-3">
              {[
                { name: 'Brandweer Rotterdam Noord', spots: 14, comp: 89, status: 'warning' },
                { name: 'Ziekenhuis AMC - Toren B', spots: 52, comp: 67, status: 'critical' },
                { name: 'ProRail Utrecht Station', spots: 8, comp: 100, status: 'good' },
              ].map((proj, i) => (
                <div key={i} className="group relative flex items-center justify-between p-4 border border-[#EAEEF2] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-[4px] hover:border-[#4B9EFF] transition-colors cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${
                      proj.status === 'good' ? 'bg-[#38A169]' : 
                      proj.status === 'warning' ? 'bg-[#DD6B20]' : 'bg-[#E53E3E]'
                    }`}></div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-[#4B9EFF] transition-colors">{proj.name}</div>
                      <div className="flex gap-4">
                        <span className="text-xs text-gray-500"><span className="font-mono">{proj.spots}</span> spots</span>
                        <span className="text-xs text-gray-500"><span className="font-mono">{proj.comp}%</span> compliant</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    {/* Visual Progress Bar */}
                    <div className="w-32 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${
                          proj.status === 'good' ? 'bg-[#38A169]' : 
                          proj.status === 'warning' ? 'bg-[#DD6B20]' : 'bg-[#E53E3E]'
                        }`} 
                        style={{ width: `${proj.comp}%` }}
                      ></div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#4B9EFF] transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity (1 column wide) */}
          <div>
            <div className="flex items-center justify-between mb-6 border-b border-[#EAEEF2] pb-3">
              <h2 className="text-[10px] uppercase tracking-widest text-gray-900 font-bold">Recente Activiteit</h2>
            </div>
            
            <div className="relative before:absolute before:inset-0 before:ml-[9px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-px before:bg-gradient-to-b before:from-transparent before:via-[#EAEEF2] before:to-transparent">
              <div className="relative pl-8 space-y-6 before:absolute before:inset-0 before:ml-[9px] before:-translate-x-px before:h-full before:w-px before:bg-[#EAEEF2] before:z-0">
                {[
                  { title: 'Spot BD-042 goedgekeurd', sub: 'J. de Vries', time: '10:42', icon: <CheckCircle2 className="w-3 h-3 text-[#38A169]" /> },
                  { title: 'Inspectie afgerond Toren B', sub: 'Automatisch rapport gegenereerd', time: '09:15', icon: <AlertTriangle className="w-3 h-3 text-[#DD6B20]" /> },
                  { title: 'Nieuw project aangemaakt', sub: 'Brandweer Rotterdam Noord', time: 'Gisteren', icon: <Plus className="w-3 h-3 text-[#4B9EFF]" /> },
                  { title: 'Onderhoudsschema geüpdatet', sub: 'System', time: 'Gisteren', icon: <Clock className="w-3 h-3 text-gray-400" /> },
                ].map((act, i) => (
                  <div key={i} className="relative z-10">
                    <div className="absolute -left-8 w-5 h-5 bg-white border border-[#EAEEF2] rounded-full flex items-center justify-center mt-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                      {act.icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{act.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{act.sub}</div>
                      <div className="font-mono text-[10px] text-gray-400 mt-1 uppercase tracking-wider">{act.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
