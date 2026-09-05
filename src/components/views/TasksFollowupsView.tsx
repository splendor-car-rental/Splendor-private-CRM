import React, { useState } from 'react';
import { 
  CheckSquare, Plus, Search, Calendar, 
  User, CheckCircle2, Clock, AlertTriangle, 
  ChevronRight, Tag, Filter
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Task, TaskPriority } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { formatDate } from '../../lib/dateFormat';
import { DayMonthYearDateInput } from '../common/DayMonthYearDateInput';

export const TasksFollowupsView: React.FC = () => {
  const { language, t } = useLanguage();
  const { tasks, createTask, updateTask, customers } = useCRM();

  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    customerId: '',
    customerName: '',
    assignedToName: 'Elena Rostova',
    dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    priority: 'high' as TaskPriority,
    category: 'concierge_delivery' as any
  });

  const handleCustomerSelect = (custId: string) => {
    const cust = customers.find(c => c.id === custId);
    if (cust) {
      setForm(prev => ({
        ...prev,
        customerId: cust.id,
        customerName: cust.fullName
      }));
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTask(form);
    setAddModalOpen(false);
    setForm({
      title: '',
      description: '',
      customerId: '',
      customerName: '',
      assignedToName: 'Elena Rostova',
      dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      priority: 'high',
      category: 'concierge_delivery'
    });
  };

  const handleToggleComplete = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTask(task.id, { status: newStatus });
  };

  const filteredTasks = tasks.filter(t => {
    const s = (searchTerm || '').toLowerCase();
    const matchesSearch = 
      (t.title || '').toLowerCase().includes(s) ||
      (t.description || '').toLowerCase().includes(s) ||
      (t.customerName && t.customerName.toLowerCase().includes(s));
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100">
            {language === 'ar' ? 'المهام ومتابعات خدمة كبار الشخصيات' : 'VIP Concierge Tasks & Operational Follow-ups'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'جدولة تسليم السوبركارز، تجديد عقود الـ VIP، واسترداد الودائع ومخالفات المرور' : 'Coordinate white-glove deliveries, deposit settlements, renewal calls & operational audits'}
          </p>
        </div>

        <button
          onClick={() => {
            if (customers.length > 0) handleCustomerSelect(customers[0].id);
            setAddModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-semibold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{language === 'ar' ? 'إنشاء مهمة جديدة' : 'Create Task'}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search task title, VIP client, description..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {['all', 'urgent', 'high', 'medium', 'low'].map(p => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-3 py-1.5 rounded-xl capitalize font-medium transition-all ${
                priorityFilter === p ? 'bg-[#D4AF37]/20 text-[#f5d97f] border border-[#D4AF37]/40' : 'text-zinc-400 border border-zinc-800 hover:bg-zinc-800'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Task Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTasks.map(task => {
          const isDone = task.status === 'completed';
          const priorityBadge = {
            urgent: <Badge variant="rose" size="sm">Urgent</Badge>,
            high: <Badge variant="amber" size="sm">High</Badge>,
            medium: <Badge variant="sky" size="sm">Medium</Badge>,
            low: <Badge variant="zinc" size="sm">Low</Badge>
          }[task.priority];

          return (
            <div
              key={task.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                isDone
                  ? 'bg-zinc-950/40 border-zinc-800/50 opacity-60'
                  : 'bg-zinc-900/80 border-zinc-800 hover:border-[#D4AF37]/40 shadow-md'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                    {task.category.replace('_', ' ')}
                  </span>
                  {priorityBadge}
                </div>

                <h4 className={`text-sm font-semibold ${isDone ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
                  {task.title}
                </h4>

                <p className="text-xs text-zinc-400 line-clamp-2">
                  {task.description}
                </p>

                {task.customerName && (
                  <p className="text-[11px] text-[#f5d97f] font-medium flex items-center gap-1">
                    <User className="w-3 h-3" /> {task.customerName}
                  </p>
                )}
              </div>

              {/* Bottom bar */}
              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                <span className="text-zinc-500 text-[11px] flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Due {formatDate(task.dueDate)}
                </span>

                <button
                  onClick={() => handleToggleComplete(task)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    isDone
                      ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isDone ? 'Reopen' : 'Mark Done'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Task Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Create VIP Follow-up Task"
        subtitle="Schedule operations, delivery or renewal tasks"
        maxWidth="lg"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">Task Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              placeholder="e.g. Schedule VIP Chauffeur Delivery to Burj Al Arab"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Related Customer</label>
              <select
                value={form.customerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                <option value="">-- No specific customer --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <DayMonthYearDateInput
              label={language === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
              value={form.dueDate}
              onChange={(iso) => setForm({ ...form, dueDate: iso })}
              isAr={language === 'ar'}
            />
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1">Description / Action Items</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100"
              placeholder="Instructions for concierge team..."
            />
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold"
            >
              Save Task
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
