import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../AppContext';
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
    <header className="glass-header px-6 py-4 flex items-center justify-between border-b border-[#E2E8F0] shadow-sm sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button onClick={onOpenSidebar} className="lg:hidden p-2 text-slate-500 hover:bg-slate-50 rounded-lg">
          <Menu size={20} />
        </button>

        {/* Business Selector */}
        <div className="relative" ref={dropdownRef}>
           <div 
             onClick={() => setIsDropdownOpen(!isDropdownOpen)}
             className={cn(
               "flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl hover:border-[#86BC24] transition-all cursor-pointer w-64",
               isDropdownOpen ? "bg-white shadow-sm border-[#86BC24]" : ""
             )}
           >
              <button 
                onClick={(e) => { e.stopPropagation(); onSettingsClick(); setIsDropdownOpen(false); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#86BC24] hover:bg-[#86BC24]/10 transition-colors shrink-0"
                title="Business Settings"
              >
                <Building2 size={18} />
              </button>
              
              <div className="flex flex-col flex-1 min-w-0">
                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Active Business</span>
                 <span className="text-sm font-bold text-[#1E293B] truncate">
                    {activeBusiness?.name || 'Select Business'}
                 </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                 <button 
                  onClick={(e) => { e.stopPropagation(); onSettingsClick(); setIsDropdownOpen(false); }}
                  className="p-1.5 text-slate-400 hover:text-[#86BC24] hover:bg-[#86BC24]/10 rounded-lg transition-all"
                  title="Business Settings"
                 >
                   <Settings size={14} />
                 </button>
                 <ChevronDown size={14} className={cn("text-slate-400 transition-transform", isDropdownOpen ? "rotate-180" : "")} />
              </div>
           </div>

           {isDropdownOpen && (
             <div className="absolute top-full left-0 pt-2 w-64 z-50">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-xl p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1 flex items-center justify-between">
                     Your Organizations
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                     {businesses.map(b => (
                        <button
                           key={b.id}
                           onClick={(e) => {
                             e.stopPropagation();
                             setActiveBusinessId(b.id);
                             setIsDropdownOpen(false);
                           }}
                           className={cn(
                              "w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-3",
                              activeBusinessId === b.id ? "bg-[#86BC24]/5 text-[#86BC24] font-bold" : "text-slate-600 hover:bg-slate-50"
                           )}
                        >
                           <Building2 size={14} />
                           {b.name}
                        </button>
                     ))}
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
        <div className="hidden md:flex items-center gap-2 p-1 bg-slate-50 border border-slate-200 rounded-xl">
           <button 
              onClick={() => handleDateQuickSelect('month')}
              className={cn(
                 "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                 dateFilter.type === 'month' ? "bg-white shadow-sm text-[#86BC24]" : "text-slate-500 hover:text-slate-900"
              )}
           >
              This Month
           </button>
           <button 
              onClick={() => handleDateQuickSelect('year')}
              className={cn(
                 "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                 dateFilter.type === 'year' ? "bg-white shadow-sm text-[#86BC24]" : "text-slate-500 hover:text-slate-900"
              )}
           >
              This Year
           </button>
           <div className="w-px h-4 bg-slate-200 mx-1" />
           <div className="flex items-center gap-2 px-2">
              <input 
                 type="date"
                 value={dateFilter.startDate}
                 onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value, type: 'custom' })}
                 className="bg-transparent text-[11px] font-medium text-slate-600 outline-none border-none p-0 w-28"
              />
              <span className="text-slate-300 font-bold uppercase text-[9px]">to</span>
              <input 
                 type="date"
                 value={dateFilter.endDate}
                 onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value, type: 'custom' })}
                 className="bg-transparent text-[11px] font-medium text-slate-600 outline-none border-none p-0 w-28"
              />
           </div>
        </div>
      </div>
    </header>
  );
}
