import React, { useState, useEffect } from 'react';
import { 
  Flame, 
  Award, 
  Download, 
  Upload, 
  Plus, 
  Trash2, 
  Calendar,
  CheckCircle,
  Dumbbell,
  XCircle,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FileCheck,
  Loader
} from 'lucide-react';
import { 
  getLeads, 
  getPayments, 
  getDailyLogs, 
  saveDailyLogs, 
  getPersonalRecords,
  exportDatabase,
  importDatabase,
  clearDemoData,
  getLocalDateString,
  getShieldsInfo
} from '../utils/storage';

export default function HabitsTracker() {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [payments, setPayments] = useState([]);
  const [dailyLogs, setDailyLogs] = useState({});
  const [shieldedDates, setShieldedDates] = useState([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  
  // Drill-down calendar modal state
  const [activeHabitForCalendar, setActiveHabitForCalendar] = useState(null); // 'dm', 'content', 'client_vids'
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth()); // 0-11
  
  // Log form state
  const [logForm, setLogForm] = useState({
    date: getLocalDateString(),
    dms_sent: 0,
    replies_received: 0,
    free_videos_sent: 0,
    meetings_booked: 0,
    content_posted: false,
    videos_delivered: 0
  });

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [freshLeads, freshPayments, freshLogs, freshShields] = await Promise.all([
        getLeads(),
        getPayments(),
        getDailyLogs(),
        getShieldsInfo()
      ]);
      setLeads(freshLeads);
      setPayments(freshPayments);
      setDailyLogs(freshLogs);
      setShieldedDates(freshShields.shielded_dates);
      setLoading(false);
    };
    
    loadData();
    window.addEventListener('goe_state_change', loadData);
    return () => window.removeEventListener('goe_state_change', loadData);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '12px' }}>
        <Loader className="spin" size={32} color="var(--amber)" />
        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Loading habits...</span>
      </div>
    );
  }

  const badges = getPersonalRecords(leads, payments, dailyLogs, shieldedDates);

  // Group daily logs sorted by date descending for the list
  const sortedLogs = Object.entries(dailyLogs)
    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
    .slice(0, 15);

  const handleSaveLog = async (e) => {
    e.preventDefault();
    if (!logForm.date) return;
    
    const logs = { ...dailyLogs };
    logs[logForm.date] = {
      dms_sent: Number(logForm.dms_sent) || 0,
      replies_received: Number(logForm.replies_received) || 0,
      free_videos_sent: Number(logForm.free_videos_sent) || 0,
      meetings_booked: Number(logForm.meetings_booked) || 0,
      content_posted: logForm.content_posted,
      videos_delivered: Number(logForm.videos_delivered) || 0
    };
    
    await saveDailyLogs(logs);
    setIsLogModalOpen(false);
  };

  const handleExportBackup = async () => {
    const dataStr = await exportDatabase();
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `goe_crm_backup_${getLocalDateString()}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImportBackup = (e) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = async event => {
        const success = await importDatabase(event.target.result);
        if (success) {
          alert('Database restored successfully! 🎉');
        } else {
          alert('Restore failed. Please verify the file format.');
        }
      };
    }
  };

  const handleClearDemoData = async () => {
    if (confirm('Are you sure you want to clear all demo data? This will permanently delete all leads, payments, and logs, and initialize empty lists.')) {
      await clearDemoData();
      alert('Demo data cleared successfully! CRM is now clean.');
    }
  };

  const handleDeleteLog = async (dateStr) => {
    if (confirm(`Remove outreach logs for ${dateStr}?`)) {
      const logs = { ...dailyLogs };
      delete logs[dateStr];
      await saveDailyLogs(logs);
    }
  };

  // --- MY HABITS ROW COMPUTATIONS ---
  const todayStr = getLocalDateString();
  const todayLog = dailyLogs[todayStr] || { dms_sent: 0, content_posted: false, videos_delivered: 0 };

  const getHabitStreak = (key) => {
    let streakCount = 0;
    const checkDate = new Date();
    
    const isSuccess = (dateStr) => {
      const log = dailyLogs[dateStr];
      if (!log) return false;
      if (key === 'dm') return log.dms_sent >= 5;
      if (key === 'content') return log.content_posted;
      if (key === 'client_vids') return log.videos_delivered >= 1;
      return false;
    };

    const todaySuccess = isSuccess(todayStr);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);
    const yesterdaySuccess = isSuccess(yesterdayStr);

    if (todaySuccess) {
      // Start counting today
    } else if (yesterdaySuccess) {
      // Start counting yesterday (today is still in progress)
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      return 0;
    }

    while (true) {
      const dateStr = getLocalDateString(checkDate);
      if (isSuccess(dateStr)) {
        streakCount++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streakCount;
  };

  // 7-day box helper (0 is today, 6 is 6 days ago)
  const get7DayHistory = (key) => {
    const list = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const log = dailyLogs[dateStr];
      let status = 'missed'; // 'missed', 'partial', 'done'
      
      if (log) {
        if (key === 'dm') {
          if (log.dms_sent >= 20) status = 'done';
          else if (log.dms_sent >= 5) status = 'partial';
        } else if (key === 'content') {
          if (log.content_posted) status = 'done';
        } else if (key === 'client_vids') {
          if (log.videos_delivered >= 1) status = 'done';
        }
      }
      list.push({ dateStr, status });
    }
    return list;
  };

  const habits = [
    {
      id: 'dm',
      name: '20 DMs (min 5)',
      isDoneToday: todayLog.dms_sent >= 5,
      isFullyDoneToday: todayLog.dms_sent >= 20,
      streak: getHabitStreak('dm'),
      history: get7DayHistory('dm'),
      icon: '📨'
    },
    {
      id: 'content',
      name: 'Raw video posted',
      isDoneToday: todayLog.content_posted,
      isFullyDoneToday: todayLog.content_posted,
      streak: getHabitStreak('content'),
      history: get7DayHistory('content'),
      icon: '🎥'
    },
    {
      id: 'client_vids',
      name: 'Client videos delivered',
      isDoneToday: todayLog.videos_delivered >= 1,
      isFullyDoneToday: todayLog.videos_delivered >= 1,
      streak: getHabitStreak('client_vids'),
      history: get7DayHistory('client_vids'),
      icon: '💼'
    }
  ];

  // --- MONTH CALENDAR RENDER ---
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const renderCalendarDays = () => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // getDay() is 0 (Sun) - 6 (Sat)
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    // Convert firstDayIndex to Mon-Sun index (0-Mon, 6-Sun)
    const offset = (firstDayIndex + 6) % 7;

    const cells = [];
    
    // Empty offsets
    for (let i = 0; i < offset; i++) {
      cells.push(<div key={`empty-${i}`} className="calendar-cell empty"></div>);
    }

    // Days in Month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewYear, viewMonth, day);
      const dateStr = getLocalDateString(date);
      const log = dailyLogs[dateStr];
      let level = 'none'; // none, partial, full
      let hoverText = `${day} ${date.toLocaleDateString('en-IN', { month: 'short' })}: Missed`;

      if (log) {
        if (activeHabitForCalendar === 'dm') {
          if (log.dms_sent >= 20) {
            level = 'full';
            hoverText = `${day} ${date.toLocaleDateString('en-IN', { month: 'short' })}: ${log.dms_sent} DMs (Target Complete 🔥)`;
          } else if (log.dms_sent >= 5) {
            level = 'partial';
            hoverText = `${day} ${date.toLocaleDateString('en-IN', { month: 'short' })}: ${log.dms_sent} DMs (Minimum Hit)`;
          } else {
            hoverText = `${day} ${date.toLocaleDateString('en-IN', { month: 'short' })}: ${log.dms_sent} DMs (Missed)`;
          }
        } else if (activeHabitForCalendar === 'content') {
          if (log.content_posted) {
            level = 'full';
            hoverText = `${day} ${date.toLocaleDateString('en-IN', { month: 'short' })}: Video Posted 🔥`;
          }
        } else if (activeHabitForCalendar === 'client_vids') {
          if (log.videos_delivered >= 1) {
            level = 'full';
            hoverText = `${day} ${date.toLocaleDateString('en-IN', { month: 'short' })}: ${log.videos_delivered} Videos Delivered`;
          }
        }
      }

      cells.push(
        <div 
          key={`day-${day}`} 
          className={`calendar-cell heat-level-${level}`}
          title={hoverText}
        >
          <span className="calendar-cell-num">{day}</span>
        </div>
      );
    }

    return cells;
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 1. MY HABITS TRACKER PANEL */}
      <div className="panel">
        <h3 className="panel-title">
          <Flame size={16} color="var(--amber)" fill="var(--amber)" /> My Daily Habits
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '-10px', marginBottom: '16px' }}>
          Tap on a habit to view your full month calendar performance history.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {habits.map(habit => (
            <div 
              key={habit.id} 
              className="waiting-item" 
              onClick={() => {
                setActiveHabitForCalendar(habit.id);
                setViewYear(new Date().getFullYear());
                setViewMonth(new Date().getMonth());
              }}
              style={{ cursor: 'pointer', padding: '14px 16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>{habit.icon}</span>
                <div>
                  <span className="waiting-name">{habit.name}</span>
                  <span className="waiting-tag" style={{ color: 'var(--amber)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Flame size={11} fill="var(--amber)" /> {habit.streak}d streak
                  </span>
                </div>
              </div>

              {/* 7-day visual grids inline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {habit.history.map((day, dIdx) => (
                    <div 
                      key={dIdx} 
                      className={`legend-color heat-level-${day.status === 'done' ? 'full' : day.status === 'partial' ? 'partial' : 'none'}`}
                      style={{ width: '10px', height: '10px', borderRadius: '2px' }}
                      title={day.dateStr}
                    />
                  ))}
                </div>
                
                <span 
                  className="scoreboard-number" 
                  style={{ 
                    color: habit.isFullyDoneToday ? 'var(--green)' : habit.isDoneToday ? 'var(--amber)' : 'var(--text-muted)', 
                    fontSize: '18px',
                    fontWeight: 'bold',
                    width: '28px',
                    textAlign: 'center'
                  }}
                >
                  {habit.isDoneToday ? '✓' : '✗'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Month Calendar drill-down modal */}
      {activeHabitForCalendar && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '360px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '16px' }}>
                  {activeHabitForCalendar === 'dm' && '📨 20 DMs (min 5) Log'}
                  {activeHabitForCalendar === 'content' && '🎥 Raw video posted Log'}
                  {activeHabitForCalendar === 'client_vids' && '💼 Client videos delivered Log'}
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>HabitKit Calendar view</span>
              </div>
              <button className="close-btn" onClick={() => setActiveHabitForCalendar(null)}>
                <XCircle size={18} />
              </button>
            </div>
            
            <div className="modal-body" style={{ padding: '16px' }}>
              {/* Calendar Month Header selector */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={handlePrevMonth}>
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontWeight: 600, fontSize: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                  {monthNames[viewMonth]} {viewYear}
                </span>
                <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={handleNextMonth}>
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Mon-Sun Labels */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', textAlign: 'center', marginBottom: '6px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, lIdx) => (
                  <div key={lIdx}>{l}</div>
                ))}
              </div>

              {/* Calendar Matrix cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                {renderCalendarDays()}
              </div>

              {/* Legend indicators */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '10px', color: 'var(--text-muted)', marginTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div className="legend-color heat-level-none" style={{ width: '10px', height: '10px', borderRadius: '2px' }} />
                  <span>Missed</span>
                </div>
                {activeHabitForCalendar === 'dm' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div className="legend-color heat-level-partial" style={{ width: '10px', height: '10px', borderRadius: '2px' }} />
                    <span>Min (5+)</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div className="legend-color heat-level-full" style={{ width: '10px', height: '10px', borderRadius: '2px', boxShadow: '0 0 4px var(--green)' }} />
                  <span>Completed</span>
                </div>
              </div>
            </div>
            
            <div className="modal-footer" style={{ padding: '10px 16px' }}>
              <button className="btn btn-secondary" style={{ padding: '6px 16px', fontSize: '12px' }} onClick={() => setActiveHabitForCalendar(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. GYM PERSONAL RECORDS SHELF */}
      <div className="panel">
        <h3 className="panel-title">
          <Award size={16} color="var(--amber)" /> PR Badges Shelf
        </h3>
        
        <div className="badge-grid">
          {badges.map(badge => (
            <div 
              key={badge.id} 
              className={`badge-card ${badge.unlocked ? 'unlocked' : ''}`}
              title={badge.description}
            >
              <span className="badge-icon">
                {badge.id === 'pr-first-dm-client' && '🥇'}
                {badge.id === 'pr-streak-champ' && '🔥'}
                {badge.id === 'pr-best-collection' && '💰'}
                {badge.id === 'pr-speed-demon' && '⚡'}
                {badge.id === 'pr-super-outreacher' && '🏋️'}
                {badge.id === 'pr-first-reply' && '📨'}
                {badge.id === 'pr-century-club' && '💯'}
                {badge.id === 'pr-iron-marathon' && '🏃'}
                {badge.id === 'pr-week-one' && '📅'}
                {badge.id === 'pr-habit-locked' && '🔒'}
                {badge.id === 'pr-lakhpati-month' && '💵'}
                {badge.id === 'pr-inbound-magnet' && '🧲'}
                {badge.id === 'pr-zero-balance' && '⚖️'}
                {badge.id === 'pr-delivery-machine' && '🎬'}
                {badge.id === 'pr-full-week-content' && '📹'}
                {badge.id === 'pr-comeback-kid' && '🌱'}
                {badge.id === 'pr-night-owl' && '🦉'}
                {badge.id === 'pr-early-bird' && '🐦'}
                {badge.id === 'pr-double-day' && '🚀'}
                {badge.id === 'pr-hat-trick' && '🎩'}
                {badge.id === 'pr-rainmaker' && '🌧️'}
                {badge.id === 'pr-planet-reviver' && '🌏'}
              </span>
              <span className="badge-title">
                {badge.hidden && !badge.unlocked ? '???' : badge.title}
              </span>
              <span className="badge-desc">
                {badge.hidden && !badge.unlocked ? 'Locked Hidden Badge' : badge.description}
              </span>
              {badge.unlocked && (
                <div style={{ position: 'absolute', top: '4px', right: '4px', color: 'var(--green)' }}>
                  <CheckCircle size={12} fill="rgba(74, 222, 128, 0.1)" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 4. Habits Log Book */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 className="panel-title" style={{ marginBottom: 0 }}>
            <Dumbbell size={16} color="var(--amber)" /> Habits Log Book
          </h3>
          <button 
            className="btn btn-secondary" 
            style={{ padding: '6px 12px', fontSize: '12px' }}
            onClick={() => {
              setLogForm({
                date: getLocalDateString(),
                dms_sent: 0,
                replies_received: 0,
                free_videos_sent: 0,
                meetings_booked: 0,
                content_posted: false,
                videos_delivered: 0
              });
              setIsLogModalOpen(true);
            }}
          >
            <Plus size={12} /> Log Reps
          </button>
        </div>

        {sortedLogs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No habit logs on record. Log some daily reps above! ⚡</p>
        ) : (
          <div className="money-table-wrapper">
            <table className="money-table" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>DMs</th>
                  <th>Replies</th>
                  <th>Videos</th>
                  <th>Meets</th>
                  <th>Content</th>
                  <th>Client Vids</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedLogs.map(([dateStr, log]) => {
                  const isStreakDay = log.dms_sent >= 5 && log.content_posted;
                  return (
                    <tr key={dateStr}>
                      <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        {dateStr} {isStreakDay && '🔥'}
                      </td>
                      <td className="scoreboard-number" style={{ color: log.dms_sent >= 20 ? 'var(--green)' : log.dms_sent >= 5 ? 'var(--amber)' : 'var(--text-muted)' }}>
                        {log.dms_sent}
                      </td>
                      <td className="scoreboard-number">{log.replies_received || 0}</td>
                      <td className="scoreboard-number">{log.free_videos_sent || 0}</td>
                      <td className="scoreboard-number">{log.meetings_booked || 0}</td>
                      <td style={{ color: log.content_posted ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {log.content_posted ? 'YES' : 'NO'}
                      </td>
                      <td className="scoreboard-number">{log.videos_delivered || 0}</td>
                      <td>
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '4px 6px', fontSize: '10px' }}
                          onClick={() => handleDeleteLog(dateStr)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Data Storage Backup */}
      <div className="panel">
        <h3 className="panel-title">Data Storage Backup</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '-10px', marginBottom: '14px' }}>
          Data is saved locally in your browser cache. Backup your CRM files regularly to avoid losing client information.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExportBackup}>
            <Download size={14} /> Export JSON DB
          </button>
          
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            <Upload size={14} /> Import Backup
            <input 
              type="file" 
              accept=".json" 
              onChange={handleImportBackup} 
              style={{ display: 'none' }}
            />
          </label>

          <button className="btn btn-danger" onClick={handleClearDemoData}>
            Clear Demo Data
          </button>
        </div>
      </div>

      {/* Manual log modal */}
      {isLogModalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" style={{ maxWidth: '400px' }} onSubmit={handleSaveLog}>
            <div className="modal-header">
              <h3>Log Outreach Reps</h3>
              <button type="button" className="close-btn" onClick={() => setIsLogModalOpen(false)}>
                <XCircle size={18} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Date*</label>
                <input 
                  type="date" 
                  className="form-control"
                  value={logForm.date}
                  onChange={e => setLogForm({ ...logForm, date: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>DMs Sent*</label>
                  <input 
                    type="number" 
                    className="form-control"
                    value={logForm.dms_sent}
                    onChange={e => setLogForm({ ...logForm, dms_sent: Number(e.target.value) })}
                    min="0"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Replies Received</label>
                  <input 
                    type="number" 
                    className="form-control"
                    value={logForm.replies_received}
                    onChange={e => setLogForm({ ...logForm, replies_received: Number(e.target.value) })}
                    min="0"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Free Videos Sent</label>
                  <input 
                    type="number" 
                    className="form-control"
                    value={logForm.free_videos_sent}
                    onChange={e => setLogForm({ ...logForm, free_videos_sent: Number(e.target.value) })}
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Meetings Booked</label>
                  <input 
                    type="number" 
                    className="form-control"
                    value={logForm.meetings_booked}
                    onChange={e => setLogForm({ ...logForm, meetings_booked: Number(e.target.value) })}
                    min="0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Client Videos Delivered Today</label>
                <input 
                  type="number" 
                  className="form-control"
                  value={logForm.videos_delivered}
                  onChange={e => setLogForm({ ...logForm, videos_delivered: Number(e.target.value) })}
                  min="0"
                />
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                <input 
                  type="checkbox" 
                  id="log_content" 
                  checked={logForm.content_posted}
                  onChange={e => setLogForm({ ...logForm, content_posted: e.target.checked })}
                  style={{ width: '18px', height: '18px' }}
                />
                <label htmlFor="log_content" style={{ textTransform: 'none', fontSize: '13px', cursor: 'pointer' }}>
                  Posted content (reel/post) today
                </label>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsLogModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Activity</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
