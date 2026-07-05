import React from 'react';
import { 
  LayoutDashboard, 
  Folder, 
  MapPin, 
  ClipboardCheck, 
  FileText, 
  Search, 
  Bell, 
  Plus,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  AlertCircle
} from 'lucide-react';

export function Dashboard() {
  return (
    <div className="flex h-screen w-full font-sans text-slate-800 bg-[#FAFAF7] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1C1917] text-stone-300 flex flex-col justify-between shrink-0">
        <div>
          <div className="h-20 flex items-center px-8 border-b border-stone-800/50">
            <span className="text-xl font-semibold tracking-wide text-[#E8E3DC]">FPS<span className="font-light text-stone-500 ml-1">Connect</span></span>
          </div>
          <nav className="p-4 space-y-1 mt-4">
            <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" active />
            <NavItem icon={<Folder size={18} />} label="Projecten" />
            <NavItem icon={<MapPin size={18} />} label="Spots" />
            <NavItem icon={<ClipboardCheck size={18} />} label="Inspecties" />
            <NavItem icon={<FileText size={18} />} label="Rapporten" />
          </nav>
        </div>
        <div className="p-4 border-t border-stone-800/50">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-stone-800/50 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center text-sm font-medium text-stone-200">
              MV
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-200 truncate">Maarten Visser</p>
              <p className="text-xs text-stone-500 truncate">Projectmanager</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-20 flex items-center justify-between px-10 shrink-0">
          <h1 className="text-2xl font-medium tracking-tight text-stone-900">Dashboard</h1>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input 
                type="text" 
                placeholder="Zoeken in projecten..." 
                className="pl-10 pr-4 py-2 w-64 rounded-full bg-stone-200/50 border-none focus:outline-none focus:ring-2 focus:ring-[#0D7E6F]/20 text-sm placeholder:text-stone-500 transition-all"
              />
            </div>
            <button className="relative text-stone-400 hover:text-stone-600 transition-colors">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-[#B87333] rounded-full"></span>
            </button>
            <button className="bg-[#0D7E6F] hover:bg-[#0A665A] text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-sm flex items-center gap-2">
              <Plus size={16} />
              Nieuw Project
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto px-10 pb-12">
          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-6 mb-10">
            <MetricCard label="Spots actief" value="127" trend="+12" icon={<MapPin size={20} className="text-[#B87333]" />} />
            <MetricCard label="Gemiddeld compliant" value="94%" trend="+2%" icon={<CheckCircle2 size={20} className="text-[#0D7E6F]" />} />
            <MetricCard label="Inspecties deze week" value="3" icon={<ClipboardCheck size={20} className="text-stone-400" />} />
            <MetricCard label="Herstelacties open" value="1" trend="-2" icon={<AlertTriangle size={20} className="text-[#B87333]" />} />
          </div>

          <div className="grid grid-cols-3 gap-8">
            {/* Active Projects */}
            <div className="col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-stone-800">Actieve Projecten</h2>
                <button className="text-sm font-medium text-[#0D7E6F] hover:text-[#0A665A] transition-colors flex items-center">
                  Bekijk alles <ChevronRight size={16} className="ml-1" />
                </button>
              </div>
              <div className="space-y-4">
                <ProjectCard 
                  title="Brandweer Rotterdam Noord" 
                  spots={14} 
                  compliance={89} 
                  status="warning"
                />
                <ProjectCard 
                  title="Ziekenhuis AMC - Toren B" 
                  spots={52} 
                  compliance={67} 
                  status="danger"
                />
                <ProjectCard 
                  title="ProRail Utrecht Station" 
                  spots={8} 
                  compliance={100} 
                  status="success"
                />
              </div>
            </div>

            {/* Recent Activity */}
            <div className="space-y-6">
              <h2 className="text-lg font-medium text-stone-800">Recente Activiteit</h2>
              <div className="bg-white rounded-2xl border border-[#E8E3DC] shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-6">
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[#E8E3DC] before:to-transparent">
                  <ActivityItem 
                    title="Spot BD-042 goedgekeurd" 
                    user="J. de Vries" 
                    time="10 min geleden" 
                    type="success"
                  />
                  <ActivityItem 
                    title="Inspectie afgerond" 
                    user="Toren B" 
                    time="2 uur geleden" 
                    type="info"
                  />
                  <ActivityItem 
                    title="Nieuw project aangemaakt" 
                    user="Systeem" 
                    time="Gisteren" 
                    type="neutral"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <a href="#" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${active ? 'bg-[#2A2624] text-[#E8E3DC] font-medium' : 'text-stone-400 hover:bg-[#2A2624]/50 hover:text-stone-200'}`}>
      {icon}
      <span>{label}</span>
    </a>
  );
}

function MetricCard({ label, value, trend, icon }: { label: string; value: string; trend?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E8E3DC] shadow-[0_4px_24px_rgba(0,0,0,0.04)] relative overflow-hidden group hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)] transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2.5 bg-[#FAFAF7] rounded-xl text-stone-600">
          {icon}
        </div>
        {trend && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${trend.startsWith('+') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <h3 className="text-3xl font-light text-stone-900 tracking-tight mb-1">{value}</h3>
        <p className="text-sm font-medium text-stone-500">{label}</p>
      </div>
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#E8E3DC] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
    </div>
  );
}

function ProjectCard({ title, spots, compliance, status }: { title: string; spots: number; compliance: number; status: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E8E3DC] shadow-[0_4px_24px_rgba(0,0,0,0.04)] flex items-center justify-between hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)] transition-all cursor-pointer group">
      <div className="flex items-center gap-5">
        <div className="w-12 h-12 rounded-xl bg-[#FAFAF7] border border-[#E8E3DC] flex items-center justify-center text-stone-400 group-hover:text-[#0D7E6F] transition-colors">
          <Folder size={20} />
        </div>
        <div>
          <h3 className="text-base font-medium text-stone-900 mb-1">{title}</h3>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <span className="flex items-center gap-1"><MapPin size={14} /> {spots} spots</span>
            <span className="w-1 h-1 rounded-full bg-stone-300"></span>
            <span>Laatste update: Vandaag</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-8">
        <div className="text-right">
          <div className="flex items-center justify-end gap-2 mb-1">
            <span className="text-lg font-light text-stone-900">{compliance}%</span>
            {compliance === 100 ? (
              <CheckCircle2 size={16} className="text-[#0D7E6F]" />
            ) : compliance > 80 ? (
              <AlertCircle size={16} className="text-[#B87333]" />
            ) : (
              <AlertTriangle size={16} className="text-rose-600" />
            )}
          </div>
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Compliant</p>
        </div>
        <div className="w-10 h-10 rounded-full border border-[#E8E3DC] flex items-center justify-center text-stone-400 group-hover:bg-[#FAFAF7] transition-colors">
          <ChevronRight size={18} />
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ title, user, time, type }: { title: string; user: string; time: string; type: 'success' | 'info' | 'neutral' }) {
  const Icon = type === 'success' ? CheckCircle2 : type === 'info' ? ClipboardCheck : Clock;
  const colorClass = type === 'success' ? 'text-[#0D7E6F] bg-teal-50' : type === 'info' ? 'text-[#B87333] bg-orange-50' : 'text-stone-500 bg-[#FAFAF7]';
  
  return (
    <div className="relative flex items-start gap-4">
      <div className={`mt-0.5 relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 border border-white shadow-sm ${colorClass}`}>
        <Icon size={12} />
      </div>
      <div>
        <p className="text-sm font-medium text-stone-800">{title}</p>
        <p className="text-xs text-stone-500 mt-1">{user} <span className="mx-1">&middot;</span> {time}</p>
      </div>
    </div>
  );
}
