import React, { useState, useRef, useEffect } from 'react';
import { useApp, getBusinessSettings } from '../../AppContext';
import { Building2, ChevronDown, Menu, PlusCircle, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

interface HeaderProps {
  onOpenSidebar: () => void;
  onSettingsClick: () => void;
  onAddBusinessClick: () => void;
}

export default function Header({ onOpenSidebar, onSettingsClick, onAddBusinessClick }: HeaderProps) {
  const { 
    businesses, 
    activeBusinessId, 
    setActiveBusinessId, 
    dateFilter, 
    setDateFilter 
  } = useApp();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeBusiness = businesses.find(b => b.id === activeBusinessId);

  const handleDateQuickSelect = (type: 'month' | 'year') => {
    const now = new Date();
    if (type === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setDateFilter({
        type: 'month',
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      });
    } else {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      setDateFilter({
        type: 'year',
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      });
    }
  };

  return (
    <header className="bg-gradient-to-r from-[#86BC24] to-[#6DA31A] px-6 py-4 flex items-center justify-between border-b border-white/10 shadow-lg sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button onClick={onOpenSidebar} className="lg:hidden p-2 text-white/80 hover:bg-white/10 rounded-lg">
          <Menu size={20} />
        </button>

        {/* Business Selector */}
        <div className="relative" ref={dropdownRef}>
           <div 
             onClick={() => setIsDropdownOpen(!isDropdownOpen)}
             className={cn(
               "flex items-center gap-4 px-6 py-3 bg-[#F5F5F5] border border-white/20 rounded-2xl hover:bg-white transition-all cursor-pointer w-[500px] shadow-sm",
               isDropdownOpen ? "bg-white shadow-md border-white/40" : ""
             )}
           >
              <button 
                onClick={(e) => { e.stopPropagation(); onSettingsClick(); setIsDropdownOpen(false); }}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-white shadow-sm hover:bg-slate-50 transition-colors shrink-0"
                style={{ color: activeBusiness ? (getBusinessSettings(activeBusiness).foreColor || '#86BC24') : '#86BC24' }}
                title="Business Settings"
              >
                <Building2 size={24} />
              </button>
              
              <div className="flex flex-col flex-1 min-w-0">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Active Business</span>
                 <span 
                   className="text-base font-bold truncate leading-tight transition-colors duration-300"
                   style={{ color: activeBusiness ? (getBusinessSettings(activeBusiness).foreColor || '#0f172a') : '#0f172a' }}
                 >
                    {activeBusiness?.name || 'Select Business'}
                 </span>
              </div>
 
              <div className="flex items-center gap-2 shrink-0">
                 <button 
                  onClick={(e) => { e.stopPropagation(); onSettingsClick(); setIsDropdownOpen(false); }}
                  className="p-2 text-slate-400 hover:text-[#86BC24] hover:bg-[#86BC24]/10 rounded-lg transition-all"
                  title="Business Settings"
                 >
                   <Settings size={18} />
                 </button>
                 <ChevronDown size={18} className={cn("text-slate-400 transition-transform", isDropdownOpen ? "rotate-180 text-slate-900" : "")} />
              </div>
           </div>

           {isDropdownOpen && (
             <div className="absolute top-full left-0 pt-2 w-full z-50">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-xl p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1 flex items-center justify-between">
                     Your Organizations
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                     {businesses.map(b => {
                        const bSettings = getBusinessSettings(b);
                        return (
                           <button
                              key={b.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                localStorage.setItem('activeBusinessId', b.id);
                                setActiveBusinessId(b.id);
                                setIsDropdownOpen(false);
                                window.location.reload();
                              }}
                              className={cn(
                                 "w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-3",
                                 activeBusinessId === b.id ? "bg-[#86BC24]/5 font-bold" : "text-slate-600 hover:bg-slate-50"
                              )}
                              style={{ color: activeBusinessId === b.id ? (bSettings.foreColor || '#86BC24') : undefined }}
                           >
                              <Building2 size={14} style={{ color: activeBusinessId === b.id ? (bSettings.foreColor || '#86BC24') : undefined }} />
                              {b.name}
                           </button>
                        );
                     })}
                  </div>
                  <div className="mt-1 pt-1 border-t border-slate-50">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddBusinessClick();
                        setIsDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-[#00a1de] font-bold hover:bg-[#00a1de]/5 transition-all flex items-center gap-3"
                    >
                      <PlusCircle size={14} />
                      New Business
                    </button>
                  </div>
                </div>
             </div>
           )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Date Filter */}
        <div className="hidden md:flex items-center gap-2 p-1 bg-white/10 border border-white/20 rounded-xl backdrop-blur-sm">
           <button 
              onClick={() => handleDateQuickSelect('month')}
              className={cn(
                 "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                 dateFilter.type === 'month' ? "bg-white shadow-sm text-[#86BC24]" : "text-white/70 hover:text-white"
              )}
           >
              This Month
           </button>
           <button 
              onClick={() => handleDateQuickSelect('year')}
              className={cn(
                 "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                 dateFilter.type === 'year' ? "bg-white shadow-sm text-[#86BC24]" : "text-white/70 hover:text-white"
              )}
           >
              This Year
           </button>
           <div className="w-px h-4 bg-white/20 mx-1" />
           <div className="flex items-center gap-2 px-2">
              <input 
                 type="date"
                 value={dateFilter.startDate}
                 onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value, type: 'custom' })}
                 className="bg-transparent text-[11px] font-medium text-white placeholder-white/50 outline-none border-none p-0 w-28 [color-scheme:dark]"
              />
              <span className="text-white/30 font-bold uppercase text-[9px]">to</span>
              <input 
                 type="date"
                 value={dateFilter.endDate}
                 onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value, type: 'custom' })}
                 className="bg-transparent text-[11px] font-medium text-white placeholder-white/50 outline-none border-none p-0 w-28 [color-scheme:dark]"
              />
           </div>
        </div>
      </div>
    </header>
  );
}
