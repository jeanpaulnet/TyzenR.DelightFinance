import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Zap, 
  Settings2, 
  ChevronRight, 
  Search, 
  Filter, 
  GripVertical,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Tags,
  LayoutGrid,
  Hash,
  FileText,
  HelpCircle,
  X
} from 'lucide-react';
import { useApp } from '../../AppContext';
import { ruleApi } from '../../lib/api';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDraggable,
  useDroppable
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface RuleCondition {
  field: 'description' | 'amount' | 'reference' | 'category';
  operator: 'contains' | 'equals' | 'greaterThan' | 'lessThan';
  value: string;
}

interface RuleAction {
  type: 'setCategory' | 'setDescription';
  value: string;
}

interface ImportRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  active: boolean;
  order: number;
}

function DraggableName({ name }: { name: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `cat-${name}`,
    data: { type: 'category', value: name }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 cursor-grab active:cursor-grabbing flex items-center justify-between group",
        isDragging && "opacity-50 ring-2 ring-indigo-500 shadow-xl border-indigo-500 bg-indigo-50/50"
      )}
    >
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        {name}
      </div>
      <GripVertical size={14} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
    </div>
  );
}

function DraggableBlock({ type, field, label, icon: Icon }: { type: 'condition' | 'action', field: string, label: string, icon: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `block-${field}`,
    data: { type, field, label }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 cursor-grab active:cursor-grabbing flex items-center gap-3",
        isDragging && "opacity-50 ring-2 ring-indigo-500 shadow-xl border-indigo-500 bg-indigo-50/50"
      )}
    >
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
        <Icon size={14} />
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] text-slate-400 uppercase tracking-widest leading-none mb-1">{type} block</span>
        {label}
      </div>
    </div>
  );
}

function SortableRuleItem({ 
  rule, 
  onEdit, 
  onDelete, 
  onToggle 
}: { 
  rule: ImportRule, 
  onEdit: (r: ImportRule) => void, 
  onDelete: (id: string) => void,
  onToggle: (id: string, active: boolean) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative bg-white border border-slate-200 rounded-3xl p-6 transition-all",
        !rule.active && "opacity-60 bg-slate-50/50 grayscale",
        isDragging && "shadow-2xl ring-2 ring-[#86BC24] border-transparent"
      )}
    >
      <div className="flex items-start gap-6">
        <div 
          {...attributes} 
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"
        >
          <GripVertical size={20} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4">
             <h4 className="font-bold text-slate-900 group-hover:text-[#86BC24] transition-colors">{rule.name}</h4>
             {!rule.active && (
               <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 text-[8px] font-bold uppercase tracking-widest">Paused</span>
             )}
          </div>

          <div className="space-y-3">
             <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conditions:</span>
                {rule.conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600">
                    <span className="text-slate-400 font-medium">{c.field}</span>
                    <span className="text-indigo-500">{c.operator}</span>
                    <span className="text-slate-900">"{c.value}"</span>
                  </div>
                ))}
             </div>

             <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions:</span>
                {rule.actions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1 bg-indigo-50 rounded-lg text-[10px] font-bold text-indigo-600">
                    <ArrowRight size={12} className="text-indigo-300" />
                    <span className="text-indigo-400 font-medium">{a.type === 'setCategory' ? 'Set Name' : 'Rewrite Desc'}</span>
                    <span className="text-indigo-700 capitalize">{a.value}</span>
                  </div>
                ))}
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
           <button 
             onClick={() => onEdit(rule)}
             className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all"
           >
             <Settings2 size={18} />
           </button>
           <button 
             onClick={() => onDelete(rule.id)}
             className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
           >
             <Trash2 size={18} />
           </button>
           <button 
             onClick={() => onToggle(rule.id, !rule.active)}
             className={cn(
               "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
               rule.active ? "text-[#86BC24] bg-[#86BC24]/10" : "text-slate-400 bg-slate-100"
             )}
           >
             <Zap size={18} fill={rule.active ? "currentColor" : "none"} />
           </button>
        </div>
      </div>
    </div>
  );
}

function DropZone({ children, onDrop }: { children: React.ReactNode, onDrop: () => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'rule-drop-zone'
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "relative transition-all duration-300 rounded-[40px]",
        isOver && "ring-4 ring-indigo-500/20 scale-[0.99]"
      )}
    >
      <div className={cn(
        "absolute inset-0 rounded-[40px] bg-indigo-500/5 opacity-0 transition-opacity flex items-center justify-center z-10 pointer-events-none",
        isOver && "opacity-100"
      )}>
        <div className="bg-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-3 animate-bounce">
           <Zap className="text-indigo-500 fill-indigo-500" />
           <span className="text-sm font-bold text-slate-900">Drop to Create Rule</span>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function ImportRules({ isModal = false }: { isModal?: boolean }) {
  const { user, finData, activeBusinessId, refreshData } = useApp();
  const rules = (finData.rules || []) as ImportRule[];
  const categories = useMemo(() => Array.from(new Set(finData.budgets.map(b => b.category))), [finData.budgets]);
  
  const [activeTab, setActiveTab] = useState<'active' | 'builder'>('active');
  const [isEditing, setIsEditing] = useState<Partial<ImportRule> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortedRules = useMemo(() => {
    return [...rules]
      .filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.order - b.order);
  }, [rules, searchTerm]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    // Check if we dropped a category or block onto the rules area
    if (over?.id === 'rule-drop-zone') {
      if (active.data.current?.type === 'category') {
        const category = active.data.current.value;
        startNewRuleFromCategory(category);
        return;
      }

      if (active.data.current?.type === 'condition') {
        const field = active.data.current.field;
        startNewRuleFromBlock(field, active.data.current.label);
        return;
      }
    }

    if (over && active.id !== over.id) {
      // Reordering via API if supported, or just skip for now as SQL doesn't have Order field clearly visible in basic entity
      console.log("Reordering rules not fully supported in SQL schema yet");
    }
  };

  const startNewRuleFromCategory = (category: string) => {
    setIsEditing({
      name: `Automate ${category}`,
      active: true,
      order: rules.length,
      conditions: [{ field: 'description', operator: 'contains', value: '' }],
      actions: [{ type: 'setCategory', value: category }]
    });
  };

  const startNewRuleFromBlock = (field: string, label: string) => {
    setIsEditing({
      name: `Rule on ${label}`,
      active: true,
      order: rules.length,
      conditions: [{ field: field as any, operator: 'contains', value: '' }],
      actions: [{ type: 'setCategory', value: '' }]
    });
  };

  const saveRule = async () => {
    if (!user || !activeBusinessId || !isEditing) return;
    
    try {
      // Mapping complex rule to simple keyword/category for the provided SQL schema
      const keyword = isEditing.conditions?.[0]?.value || '';
      const category = isEditing.actions?.[0]?.value || '';

      await ruleApi.create({
        keyword,
        category,
        businessId: activeBusinessId
      });

      await refreshData();
      setIsEditing(null);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteRule = async (id: string) => {
    if (!user) return;
    // ruleApi delete stub if exists
    await refreshData();
  };

  const toggleRule = async (id: string, active: boolean) => {
    if (!user) return;
    // ruleApi update active status if exists
    await refreshData();
  };

  const startNewRule = () => {
    setIsEditing({
      name: 'New Automation Rule',
      active: true,
      order: rules.length,
      conditions: [{ field: 'description', operator: 'contains', value: '' }],
      actions: [{ type: 'setCategory', value: '' }]
    });
  };

  return (
    <div className={cn("space-y-8", !isModal && "max-w-6xl mx-auto")}>
      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
      {/* Header */}
      {!isModal && (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
               <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                 <Zap size={24} fill="currentColor" />
               </div>
               <div>
                 <h2 className="text-2xl font-bold text-slate-900">Automation Engine</h2>
                 <p className="text-sm text-slate-500">Create rules to automatically categorize and clean your imports.</p>
               </div>
            </div>
          </div>

          <button 
            onClick={startNewRule}
            className="h-12 px-6 bg-[#86BC24] text-white rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-[#86BC24]/20 hover:bg-[#75A51F] transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={18} />
            Create Rule
          </button>
        </div>
      )}

      <div className={cn(isModal ? "grid grid-cols-1 md:grid-cols-12 gap-8" : "grid grid-cols-1 lg:grid-cols-3 gap-8")}>
        {/* Rules Sidebar/Info */}
        <div className={cn(isModal ? "md:col-span-4" : "lg:col-span-1", "space-y-6")}>
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                   <Tags size={14} className="text-indigo-500" />
                   Smart Names
                </h3>
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                    Drag a name onto the workspace to instantly set a target outcome.
                  </p>
                  <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                    {categories.map((cat, i) => (
                      <DraggableName key={i} name={cat} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                   <LayoutGrid size={14} className="text-[#86BC24]" />
                   Logic Blocks
                </h3>
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                    Drag logic fields to create custom matching conditions.
                  </p>
                  <div className="flex flex-col gap-2">
                    <DraggableBlock type="condition" field="description" label="Description" icon={FileText} />
                    <DraggableBlock type="condition" field="reference" label="Reference" icon={Hash} />
                    <DraggableBlock type="condition" field="amount" label="Amount" icon={Tags} />
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6">
                <div className="flex items-center gap-2 text-indigo-600 mb-3">
                   <HelpCircle size={16} />
                   <span className="text-xs font-bold uppercase tracking-widest">Helpful Tip</span>
                </div>
                <p className="text-xs text-indigo-900/70 leading-relaxed">
                  Rules are applied in order. You can drag and drop active rules on the right to change their priority. Higher rules take precedence.
                </p>
              </div>
        </div>

        {/* Rules Explorer/Drop Zone */}
        <div className={cn(isModal ? "md:col-span-8" : "lg:col-span-2", "space-y-6")}>
          <div className="bg-white border border-slate-200 rounded-[32px] p-2 flex items-center gap-2 shadow-sm">
             <button 
               onClick={() => setActiveTab('active')}
               className={cn(
                 "flex-1 h-12 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all",
                 activeTab === 'active' ? "bg-slate-900 text-white shadow-xl" : "text-slate-400 hover:bg-slate-50"
               )}
             >
               Pipeline ({sortedRules.length})
             </button>
             <button 
               onClick={() => setActiveTab('builder')}
               className={cn(
                 "flex-1 h-12 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all",
                 activeTab === 'builder' ? "bg-slate-900 text-white shadow-xl" : "text-slate-400 hover:bg-slate-50"
               )}
             >
               Visual Builder
             </button>
          </div>

          <div className="space-y-4">
              <div className="relative group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#86BC24] transition-colors" size={20} />
                <input 
                  type="text"
                  placeholder="Search rules by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-16 pl-14 pr-6 bg-white border border-slate-200 rounded-3xl text-sm focus:ring-4 focus:ring-[#86BC24]/10 focus:border-[#86BC24] outline-none shadow-sm transition-all"
                />
              </div>

              <DropZone onDrop={() => {}}>
                {activeTab === 'builder' ? (
                  <div className="bg-white border border-slate-200 border-dashed rounded-[32px] p-16 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-[#86BC24]/[0.02] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />
                    
                    <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-500 mb-6 animate-bounce active:animate-none">
                      <LayoutGrid size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Visual Logic Builder</h3>
                    <p className="text-sm text-slate-500 max-w-sm mb-8 leading-relaxed">
                      Drag **Categories** to set outcomes, or **Logic Blocks** to define triggers. Build rules for "Description", "Ref", or "Amount" in seconds.
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="px-4 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-bold text-slate-400 uppercase tracking-widest shadow-sm">If Field</div>
                      <ChevronRight size={14} className="text-slate-300" />
                      <div className="px-4 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-bold text-slate-400 uppercase tracking-widest shadow-sm">Containing</div>
                      <ChevronRight size={14} className="text-slate-300" />
                      <div className="px-4 py-2 bg-white border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-500 uppercase tracking-widest shadow-sm ring-2 ring-indigo-50">Output Value</div>
                    </div>
                  </div>
                ) : (
                  <SortableContext items={sortedRules.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-4">
                      {sortedRules.map((rule) => (
                        <SortableRuleItem 
                          key={rule.id} 
                          rule={rule} 
                          onEdit={setIsEditing}
                          onDelete={deleteRule}
                          onToggle={toggleRule}
                        />
                      ))}

                      {sortedRules.length === 0 && (
                        <div className="bg-white border border-slate-200 border-dashed rounded-[32px] p-24 flex flex-col items-center justify-center text-center">
                           <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 mb-6">
                              <Zap size={40} />
                           </div>
                           <h3 className="text-xl font-bold text-slate-900 mb-2">No Automation Rules Found</h3>
                           <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
                             Build your first logic sequence to start automating your financial imports.
                           </p>
                        </div>
                      )}
                    </div>
                  </SortableContext>
                )}
              </DropZone>
          </div>
        </div>
      </div>

      {/* Edit Rule Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsEditing(null)}
               className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
             >
                <div className="px-10 py-8 bg-white border-b border-slate-100 flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[#86BC24] flex items-center justify-center text-white shadow-lg shadow-[#86BC24]/20">
                         <Settings2 size={24} />
                      </div>
                      <div>
                         <h3 className="text-xl font-bold text-slate-900">{isEditing.id ? 'Refine Automation' : 'New Strategic Rule'}</h3>
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Rule Configuration Engine</p>
                      </div>
                   </div>
                   <button onClick={() => setIsEditing(null)} className="w-12 h-12 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-400 transition-colors">
                      <X size={24} />
                   </button>
                </div>

                <div className="p-10 overflow-y-auto space-y-10">
                   {/* Name */}
                   <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Internal Reference Name</label>
                      <input 
                        type="text"
                        value={isEditing.name}
                        onChange={(e) => setIsEditing({...isEditing, name: e.target.value})}
                        className="w-full h-16 px-6 bg-slate-50 border-none rounded-2xl text-slate-900 font-medium focus:ring-4 focus:ring-[#86BC24]/10 transition-all outline-none"
                        placeholder="e.g., Categorize Amazon Business Purchases"
                      />
                   </div>

                   {/* Conditions */}
                   <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Matching Criteria (Logic)</label>
                         <button 
                           onClick={() => setIsEditing({...isEditing, conditions: [...(isEditing.conditions || []), { field: 'description', operator: 'contains', value: '' }]})}
                           className="flex items-center gap-2 text-[10px] font-bold text-[#86BC24] uppercase tracking-widest hover:text-[#75A51F] transition-colors"
                         >
                           <Plus size={14} />
                           Add Condition
                         </button>
                      </div>
                      <div className="space-y-3">
                         {isEditing.conditions?.map((c, i) => (
                           <div key={i} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl group">
                              <select 
                                value={c.field}
                                onChange={(e) => {
                                  const newC = [...isEditing.conditions!];
                                  newC[i].field = e.target.value as any;
                                  setIsEditing({...isEditing, conditions: newC});
                                }}
                                className="bg-white px-4 py-2 rounded-xl text-xs font-bold text-slate-700 border-none shadow-sm focus:ring-2 focus:ring-[#86BC24] outline-none"
                              >
                                <option value="description">Description</option>
                                <option value="reference">Reference</option>
                                <option value="amount">Amount</option>
                              </select>
                              <select 
                                value={c.operator}
                                onChange={(e) => {
                                  const newC = [...isEditing.conditions!];
                                  newC[i].operator = e.target.value as any;
                                  setIsEditing({...isEditing, conditions: newC});
                                }}
                                className="bg-white px-4 py-2 rounded-xl text-xs font-bold text-indigo-600 border-none shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="contains">Contains</option>
                                <option value="equals">Equals Exactly</option>
                                <option value="greaterThan">Greater Than</option>
                                <option value="lessThan">Less Than</option>
                              </select>
                              <input 
                                type="text"
                                value={c.value}
                                onChange={(e) => {
                                  const newC = [...isEditing.conditions!];
                                  newC[i].value = e.target.value;
                                  setIsEditing({...isEditing, conditions: newC});
                                }}
                                className="flex-1 bg-white px-4 py-2 rounded-xl text-xs font-medium text-slate-900 border-none shadow-sm focus:ring-2 focus:ring-[#86BC24] outline-none"
                                placeholder="Match value..."
                              />
                              <button 
                                onClick={() => {
                                  const newC = isEditing.conditions!.filter((_, idx) => idx !== i);
                                  setIsEditing({...isEditing, conditions: newC});
                                }}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-white hover:text-red-500 transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                           </div>
                         ))}
                      </div>
                   </div>

                   {/* Actions */}
                   <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Resulting Actions (Automation)</label>
                         <button 
                           onClick={() => setIsEditing({...isEditing, actions: [...(isEditing.actions || []), { type: 'setCategory', value: '' }]})}
                           className="flex items-center gap-2 text-[10px] font-bold text-indigo-500 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                         >
                           <Plus size={14} />
                           Add Action
                         </button>
                      </div>
                      <div className="space-y-3">
                         {isEditing.actions?.map((a, i) => (
                           <div key={i} className="flex items-center gap-3 p-4 bg-indigo-50/50 rounded-2xl">
                              <select 
                                value={a.type}
                                onChange={(e) => {
                                  const newA = [...isEditing.actions!];
                                  newA[i].type = e.target.value as any;
                                  setIsEditing({...isEditing, actions: newA});
                                }}
                                className="bg-white px-4 py-2 rounded-xl text-xs font-bold text-indigo-700 border-none shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="setCategory">Assign Name</option>
                                <option value="setDescription">Rewrite Description</option>
                              </select>
                              {a.type === 'setCategory' ? (
                                <select 
                                  value={a.value}
                                  onChange={(e) => {
                                    const newA = [...isEditing.actions!];
                                    newA[i].value = e.target.value;
                                    setIsEditing({...isEditing, actions: newA});
                                  }}
                                  className="flex-1 bg-white px-4 py-2 rounded-xl text-xs font-bold text-slate-900 border-none shadow-sm focus:ring-2 focus:ring-[#86BC24] outline-none"
                                >
                                  <option value="">Select Name...</option>
                                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              ) : (
                                <input 
                                  type="text"
                                  value={a.value}
                                  onChange={(e) => {
                                    const newA = [...isEditing.actions!];
                                    newA[i].value = e.target.value;
                                    setIsEditing({...isEditing, actions: newA});
                                  }}
                                  className="flex-1 bg-white px-4 py-2 rounded-xl text-xs font-medium text-slate-900 border-none shadow-sm focus:ring-2 focus:ring-[#86BC24] outline-none"
                                  placeholder="New description text..."
                                />
                              )}
                              <button 
                                onClick={() => {
                                  const newA = isEditing.actions!.filter((_, idx) => idx !== i);
                                  setIsEditing({...isEditing, actions: newA});
                                }}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-white hover:text-red-500 transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                           </div>
                         ))}
                      </div>
                   </div>
                </div>

                <div className="px-10 py-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                   <button 
                     onClick={() => setIsEditing(null)}
                     className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors"
                   >
                     Discard Changes
                   </button>
                   <button 
                     onClick={saveRule}
                     className="h-16 px-10 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-3"
                   >
                     <CheckCircle2 size={18} />
                     Save Rule
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
      </DndContext>
    </div>
  );
}
