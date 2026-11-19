import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Clock3, Wifi } from 'lucide-react';

type CalendarTask = {
  id: string;
  title: string;
  details?: string;
  dueDate: string;
  status: string;
  priority?: string;
  assignedToName?: string;
};
type CalendarAttendance = {
  id: string;
  displayName: string;
  workDate: string;
  checkInAt: string;
  checkOutAt?: string;
  dayType?: 'Full day' | 'Half day' | 'Absent';
  status?: string;
};
type CalendarFestival = { date: string; name: string; theme: string };
type Props = { tasks: CalendarTask[]; attendance: CalendarAttendance[]; isAdmin: boolean; festivals?: CalendarFestival[] };

const keyOf = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
const parseDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};
const labelDate = (value: string) => {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : value;
};

export default function CalendarWorkspace({ tasks, attendance, isAdmin, festivals = [] }: Props) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => keyOf(new Date()));
  const [agendaSearch, setAgendaSearch] = useState('');
  const [agendaType, setAgendaType] = useState<'all'|'tasks'|'attendance'|'festivals'>('all');
  const [agendaSort, setAgendaSort] = useState<'date'|'name'>('date');
  const todayKey = keyOf(new Date());
  const monthLabel = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, key: keyOf(date), inMonth: date.getMonth() === month.getMonth() };
    });
  }, [month]);
  const taskByDate = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    tasks.forEach(task => {
      if (!task.dueDate) return;
      const key = task.dueDate.slice(0, 10);
      map.set(key, [...(map.get(key) || []), task]);
    });
    return map;
  }, [tasks]);
  const attendanceByDate = useMemo(() => {
    const map = new Map<string, CalendarAttendance[]>();
    attendance.forEach(record => map.set(record.workDate, [...(map.get(record.workDate) || []), record]));
    return map;
  }, [attendance]);
  const festivalByDate = useMemo(() => {
    const map = new Map<string, CalendarFestival[]>();
    festivals.forEach(festival => map.set(festival.date, [...(map.get(festival.date) || []), festival]));
    return map;
  }, [festivals]);
  const queryMatches = (values: unknown[]) => !agendaSearch.trim() || values.some(value=>String(value??'').toLowerCase().includes(agendaSearch.trim().toLowerCase()));
  const selectedTasks = (taskByDate.get(selected) || []).filter(() => agendaType === 'all' || agendaType === 'tasks').filter(task=>queryMatches([task.title,task.details,task.status,task.priority,task.assignedToName])).sort((a,b)=>agendaSort==='name'?a.title.localeCompare(b.title):a.status.localeCompare(b.status));
  const selectedAttendance = (attendanceByDate.get(selected) || []).filter(() => agendaType === 'all' || agendaType === 'attendance').filter(record=>queryMatches([record.displayName,record.dayType,record.status,record.checkInAt,record.checkOutAt])).sort((a,b)=>agendaSort==='name'?a.displayName.localeCompare(b.displayName):a.displayName.localeCompare(b.displayName));
  const selectedFestivals = (festivalByDate.get(selected) || []).filter(() => agendaType === 'all' || agendaType === 'festivals').filter(festival=>queryMatches([festival.name,festival.theme])).sort((a,b)=>agendaSort==='name'?a.name.localeCompare(b.name):a.date.localeCompare(b.date));
  const monthTaskCount = cells.filter(cell => cell.inMonth).reduce((sum, cell) => sum + (taskByDate.get(cell.key)?.length || 0), 0);
  const monthAttendanceCount = cells.filter(cell => cell.inMonth).reduce((sum, cell) => sum + (attendanceByDate.get(cell.key)?.length || 0), 0);
  const monthFestivalCount = cells.filter(cell => cell.inMonth).reduce((sum, cell) => sum + (festivalByDate.get(cell.key)?.length || 0), 0);

  return <div className="calendar-workspace">
    <section className="calendar-panel">
      <div className="calendar-toolbar">
        <div><span className="calendar-eyebrow"><CalendarDays size={14}/> WORK PLANNER</span><h2>{monthLabel}</h2><p>Tasks due dates and recorded team attendance in one calendar.</p></div>
        <div className="calendar-controls">
          <button type="button" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() - 1, 1); setMonth(next); setSelected(keyOf(next)); }} aria-label="Previous month"><ChevronLeft size={18}/></button>
          <input className="calendar-month-picker" type="month" aria-label="Choose calendar month and year" value={month.getFullYear() + '-' + String(month.getMonth() + 1).padStart(2, '0')} onChange={event => { if (!event.target.value) return; const [year, monthNumber] = event.target.value.split('-').map(Number); const next = new Date(year, monthNumber - 1, 1); setMonth(next); setSelected(keyOf(next)); }} />
          <button type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(keyOf(now)); }}>Today</button>
          <button type="button" onClick={() => { const next = new Date(month.getFullYear(), month.getMonth() + 1, 1); setMonth(next); setSelected(keyOf(next)); }} aria-label="Next month"><ChevronRight size={18}/></button>
        </div>
      </div>
      <div className="calendar-summary"><span><i className="calendar-dot task-dot"/> {monthTaskCount} task due dates</span><span><i className="calendar-dot attendance-dot"/> {monthAttendanceCount} attendance records</span><span><i className="calendar-dot festival-dot"/> {monthFestivalCount} festivals &amp; holidays</span></div>
      <div className="calendar-grid">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => <div className="calendar-weekday" key={day}>{day}</div>)}
        {cells.map(cell => {
          const hasFestival = (festivalByDate.get(cell.key)?.length || 0) > 0;
          const count = (taskByDate.get(cell.key)?.length || 0) + (attendanceByDate.get(cell.key)?.length || 0) + (festivalByDate.get(cell.key)?.length || 0);
          return <button type="button" key={cell.key} onClick={() => setSelected(cell.key)} className={'calendar-day' + (!cell.inMonth ? ' outside' : '') + (cell.key === selected ? ' selected' : '') + (cell.key === todayKey ? ' today' : '') + (hasFestival ? ' has-festival' : '')}>
            <span>{cell.date.getDate()}</span>
            {count > 0 && <small>{(taskByDate.get(cell.key)?.length || 0) > 0 && <><i className="calendar-dot task-dot"/>{taskByDate.get(cell.key)?.length}</>}{(attendanceByDate.get(cell.key)?.length || 0) > 0 && <><i className="calendar-dot attendance-dot"/>{attendanceByDate.get(cell.key)?.length}</>}{hasFestival && <i className="calendar-dot festival-dot" aria-label="Festival or holiday"/>}</small>}
          </button>;
        })}
      </div>
    </section>
    <section className="calendar-panel calendar-agenda">
      <div className="calendar-agenda-head"><div><span className="calendar-eyebrow"><Clock3 size={14}/> DAILY AGENDA</span><h3>{labelDate(selected)}</h3></div><span className="calendar-agenda-count">{selectedFestivals.length + selectedTasks.length + selectedAttendance.length} records</span></div>
      <div className="data-toolbar"><label className="data-search">Search this day<input value={agendaSearch} onChange={e=>setAgendaSearch(e.target.value)} placeholder="Task, staff member or festival"/></label><label>Record type<select value={agendaType} onChange={e=>setAgendaType(e.target.value as typeof agendaType)}><option value="all">All records</option><option value="tasks">Tasks</option><option value="attendance">Attendance</option><option value="festivals">Festivals &amp; holidays</option></select></label><label>Sort by<select value={agendaSort} onChange={e=>setAgendaSort(e.target.value as typeof agendaSort)}><option value="date">Default order</option><option value="name">Name A–Z</option></select></label><span className="data-result-count">{selectedFestivals.length+selectedTasks.length+selectedAttendance.length} shown</span></div>
      {selectedFestivals.map(festival => <article className="calendar-event festival-event" key={"festival-" + festival.date + "-" + festival.name}><div className="calendar-event-icon"><Wifi size={17}/></div><div><b>{festival.name}</b><p>Festival / holiday · K&amp;B festive calendar</p></div></article>)}
      {selectedTasks.map(task => <article className="calendar-event task-event" key={'task-' + task.id}><div className="calendar-event-icon"><ClipboardList size={17}/></div><div><b>{task.title}</b><p>{task.status}{task.priority ? ' · ' + task.priority + ' priority' : ''}{isAdmin && task.assignedToName ? ' · ' + task.assignedToName : ''}</p>{task.details && <small>{task.details}</small>}</div></article>)}
      {selectedAttendance.map(record => <article className="calendar-event attendance-event" key={'attendance-' + record.id}><div className="calendar-event-icon"><Clock3 size={17}/></div><div><b>{record.displayName}</b><p>{record.dayType === 'Absent' || String(record.status || '').toLowerCase() === 'absent' ? 'Marked absent' : 'Shift started ' + (record.checkInAt ? new Date(record.checkInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—') + (record.checkOutAt ? ' · Ended ' + new Date(record.checkOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ' · No checkout recorded')}</p></div></article>)}
      {!selectedFestivals.length && !selectedTasks.length && !selectedAttendance.length && <div className="calendar-empty"><CalendarDays size={26}/><b>No records for this date</b><span>Assigned work and attendance records will appear here.</span></div>}
      <p className="calendar-note">Calendar data is read from saved tasks and attendance records. Creating or editing tasks remains in the Tasks workspace.</p>
    </section>
  </div>;
}
