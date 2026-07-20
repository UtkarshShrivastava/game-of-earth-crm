import React, { useState, useEffect } from 'react';
import { 
  Flame, 
  CircleDollarSign, 
  AlertCircle, 
  ChevronRight, 
  Check, 
  Activity, 
  TrendingUp,
  Shield,
  Plus,
  Send,
  Bell,
  Loader
} from 'lucide-react';
import { 
  getLeads, 
  getPayments, 
  getDailyLogs, 
  calculateStreak, 
  get7DayAverageDMs, 
  getFunnelSnapshot, 
  getDirectionSplit, 
  getCollectedThisMonth, 
  getToCollectPayments,
  formatRupee,
  getScoreCategory,
  getLocalDateString,
  incrementLogCount,
  updateLead,
  checkAndApplyStreakShield,
  addLead,
  getShieldsInfo
} from '../utils/storage';

export default function Dashboard({ onNavigateToLead, onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [payments, setPayments] = useState([]);
  const [dailyLogs, setDailyLogs] = useState({});
  const [todayStr, setTodayStr] = useState(getLocalDateString());
  const [tomorrowInput, setTomorrowInput] = useState('');
  const [planetTooltip, setPlanetTooltip] = useState('');
  const [shieldsHeld, setShieldsHeld] = useState(0);
  const [shieldedDates, setShieldedDates] = useState([]);
  
  // Notification preference
  const [notifTime, setNotifTime] = useState(localStorage.getItem('goe_notif_time') || '20:00');
  const [notifEnabled, setNotifEnabled] = useState(localStorage.getItem('goe_notif_enabled') === 'true');

  useEffect(() => {
    const loadData = async () => {
      // 1. Run Streak Shield forgiver logic at mount
      const shieldedDate = await checkAndApplyStreakShield();
      if (shieldedDate) {
        const freshLogs = await getDailyLogs();
        const freshShields = await getShieldsInfo();
        alert(`🛡️ Streak Shield Used!\nYesterday's missed reps were covered. Your streak of ${calculateStreak(freshLogs, freshShields.shielded_dates)} days was preserved safe. Back to work!`);
      }

      const [freshLeads, freshPayments, freshLogs, freshShields] = await Promise.all([
        getLeads(),
        getPayments(),
        getDailyLogs(),
        getShieldsInfo()
      ]);
      
      setLeads(freshLeads);
      setPayments(freshPayments);
      setDailyLogs(freshLogs);
      setShieldsHeld(freshShields.shields);
      setShieldedDates(freshShields.shielded_dates);
      setTodayStr(getLocalDateString());
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
        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Loading cloud scoreboard...</span>
      </div>
    );
  }

  const todayLog = dailyLogs[todayStr] || {
    dms_sent: 0,
    replies_received: 0,
    free_videos_sent: 0,
    meetings_booked: 0,
    content_posted: false,
    videos_delivered: 0
  };

  const streak = calculateStreak(dailyLogs, shieldedDates);
  const collectedThisMonth = getCollectedThisMonth(payments);
  const toCollectTotal = getToCollectPayments(payments);
  const averageDMs = get7DayAverageDMs(dailyLogs);

  const renderAverageChart = () => {
    const dates = [];
    const values = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      dates.push(d.toLocaleDateString('en-IN', { weekday: 'short' }));
      values.push(dailyLogs[dateStr]?.dms_sent || 0);
    }
    const maxVal = Math.max(...values, 20); // Scale to at least 20

    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '80px', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: '4px' }}>
        {values.map((v, idx) => {
          const pct = (v / maxVal) * 100;
          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '4px' }}>
              <span className="scoreboard-number" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{v}</span>
              <div style={{ width: '100%', minWidth: '8px', height: `${pct * 0.5}px`, background: v >= 20 ? 'var(--green)' : v >= 5 ? 'var(--amber)' : 'var(--text-muted)', borderRadius: '2px 2px 0 0' }} />
              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{dates[idx]}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Client videos delivered this week (7 days total)
  const getWeeklyVideosDelivered = () => {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const log = dailyLogs[dateStr];
      if (log) sum += log.videos_delivered || 0;
    }
    return sum;
  };
  const clientVideosThisWeek = getWeeklyVideosDelivered();

  // "Waiting on you" logic:
  const now = new Date();
  
  const waitingInbound = leads.filter(l => {
    if (l.stage === 'Won' || l.stage === 'Lost') return false;
    if (l.source !== 'Organic Inbound') return false;
    if (!l.last_touch_date) return true;
    const hoursSinceTouch = (now - new Date(l.last_touch_date)) / (1000 * 60 * 60);
    return hoursSinceTouch >= 24;
  });

  const waitingActions = leads.filter(l => {
    if (l.stage === 'Won' || l.stage === 'Lost') return false;
    if (!l.next_action_date) return false;
    const actDate = new Date(l.next_action_date);
    const today = new Date(todayStr);
    return actDate <= today;
  });

  const overduePayments = payments.filter(p => {
    if (p.status === 'Paid') return false;
    if (!p.due_date) return false;
    const dueDate = new Date(p.due_date);
    const today = new Date(todayStr);
    return dueDate < today;
  }).map(p => {
    const client = leads.find(l => l.id === p.clientId) || { name: 'Unknown Client' };
    const daysOverdue = Math.floor((new Date(todayStr) - new Date(p.due_date)) / (1000 * 60 * 60 * 24));
    return { ...p, clientName: client.name, daysOverdue };
  });

  const totalWaitingCount = waitingInbound.length + waitingActions.length + overduePayments.length;
  const hotLeads = leads.filter(l => l.stage !== 'Won' && l.stage !== 'Lost').sort((a, b) => b.score - a.score).slice(0, 5);
  const funnel = getFunnelSnapshot(leads, dailyLogs);
  const direction = getDirectionSplit(leads);

  const getSourceAnalytics = () => {
    const sources = ['DM Outreach', 'Organic Inbound', 'Facebook Ads'];
    
    return sources.map(source => {
      const sourceLeads = leads.filter(l => l.source === source);
      const total = sourceLeads.length;
      const won = sourceLeads.filter(l => l.stage === 'Won').length;
      const active = sourceLeads.filter(l => !['Won', 'Lost'].includes(l.stage)).length;
      const lost = sourceLeads.filter(l => l.stage === 'Lost').length;
      
      const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;
      
      // Calculate revenue closed
      const closedRevenue = sourceLeads
        .filter(l => l.stage === 'Won')
        .reduce((sum, l) => sum + (l.monthly_retainer || l.deal_value || 0), 0);
        
      // Average deal value
      const avgDealValue = won > 0 ? Math.round(closedRevenue / won) : 0;

      // Pipeline bottleneck advisor logic
      let bottleneck = 'Healthy funnel velocity. Focus on high outreach volume!';
      if (total > 0) {
        if (source === 'DM Outreach') {
          const toDm = sourceLeads.filter(l => l.stage === 'To DM').length;
          const dmSent = sourceLeads.filter(l => l.stage === 'DM Sent').length;
          const replied = sourceLeads.filter(l => l.stage === 'Replied').length;
          const videoSent = sourceLeads.filter(l => l.stage === 'Free Video Sent').length;
          const booked = sourceLeads.filter(l => l.stage === 'Meeting Booked').length;

          if (toDm > total * 0.4) {
            bottleneck = 'High backlog in "To DM". Send more cold outreach DMs today! 🏋️';
          } else if (dmSent > total * 0.4 && replied === 0) {
            bottleneck = 'Low reply rate. Optimize your outbound DM hook/first line! 🪝';
          } else if (replied > total * 0.3 && videoSent === 0) {
            bottleneck = 'Friction after replies. Deliver value (free loom video) faster! 🎥';
          } else if (videoSent > total * 0.3 && booked === 0) {
            bottleneck = 'Low meeting bookings. Make your video call-to-actions more direct! 📈';
          } else if (booked > total * 0.3 && won === 0) {
            bottleneck = 'Closing bottleneck. Improve your closing pitch or retainer offer! 🤝';
          }
        } else {
          // Inbound channels: Organic Inbound / Ads
          const replied = sourceLeads.filter(l => l.stage === 'Replied').length;
          const videoSent = sourceLeads.filter(l => l.stage === 'Free Video Sent').length;
          const booked = sourceLeads.filter(l => l.stage === 'Meeting Booked').length;

          if (replied > total * 0.4 && videoSent === 0) {
            bottleneck = 'Conversation drop-off. Send the free value video sooner! 🎥';
          } else if (videoSent > total * 0.3 && booked === 0) {
            bottleneck = 'Low meeting book rate. Send a direct booking scheduler link! 📅';
          } else if (booked > total * 0.3 && won === 0) {
            bottleneck = 'Closing bottleneck. Refine your closing call script & follow-ups! 🏆';
          }
        }
      }

      return {
        source,
        total,
        won,
        active,
        lost,
        conversionRate,
        closedRevenue,
        avgDealValue,
        bottleneck
      };
    });
  };

  // Toggle content posted today
  const handleToggleContent = async () => {
    await incrementLogCount(todayStr, 'content_posted');
  };
  // Quick log DM today
  const handleQuickLogDM = async () => {
    await incrementLogCount(todayStr, 'dms_sent', 1);
  };

  // Complete action from waiting list
  const handleCompleteAction = async (leadId, e) => {
    e.stopPropagation();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const updatedNotes = [...(lead.notes || [])];
    updatedNotes.push({
      id: 'note-' + Date.now(),
      date: new Date().toISOString(),
      type: 'custom',
      content: `Completed action: "${lead.next_action}"`
    });

    await updateLead(leadId, {
      next_action: 'Decide next steps',
      next_action_date: getLocalDateString(new Date(Date.now() + 86400000)),
      notes: updatedNotes
    });
  };

  // Queue Tomorrow's outreach targets (psychological investment phase)
  const handleQueueTomorrow = async () => {
    if (!tomorrowInput.trim()) return;
    const handles = tomorrowInput.split(',').map(h => h.trim()).filter(h => h.length > 0);
    const tomorrowStr = getLocalDateString(new Date(Date.now() + 86400000));
    
    await Promise.all(handles.map(handle => 
      addLead({
        name: handle.replace('@', ''),
        instagram_handle: handle.startsWith('@') ? handle : `@${handle}`,
        source: 'DM Outreach',
        stage: 'To DM',
        deal_value: 25000,
        next_action: 'First outreach DM',
        next_action_date: tomorrowStr
      })
    ));

    setTomorrowInput('');
    alert(`Queued ${handles.length} targets for tomorrow's workout! 🎯`);
  };

  // Register local notifications
  const handleEnableNotification = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      localStorage.setItem('goe_notif_enabled', 'true');
      localStorage.setItem('goe_notif_time', notifTime);
      setNotifEnabled(true);
      alert(`Notifications scheduled at ${notifTime} daily! 🔔`);
    }
  };

  const handleDisableNotifications = () => {
    localStorage.setItem('goe_notif_enabled', 'false');
    setNotifEnabled(false);
  };

  // Check if yesterday was a missed day for Wilting effect
  const isYesterdayWilted = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);
    const shieldedDates = JSON.parse(localStorage.getItem('goe_shielded_dates') || '[]');
    
    // If yesterday is shielded, it's NOT wilted!
    if (shieldedDates.includes(yesterdayStr)) return false;

    const log = dailyLogs[yesterdayStr];
    if (!log) return true; // No logs logged at all means missed!
    return log.dms_sent < 5 || !log.content_posted;
  };
  const wilted = isYesterdayWilted() && streak === 0;

  // Won clients plant permanent landmarks (up to 10 trees/stars)
  const wonClients = leads.filter(l => l.stage === 'Won');
  const landmarkCount = Math.min(10, wonClients.length);

  // SVG Planet evolution metrics
  let planetStageName = 'Barren Rock';
  let nextUnlockText = '1 day → Sprout Stage';
  let planetColors = { ground: '#4a443e', land: '#5c544d' }; // barren grey-brown

  if (streak >= 31) {
    planetStageName = 'Supernova Cosmos';
    nextUnlockText = 'Max stage achieved! 🌟';
    planetColors = { ground: '#1e3a8a', land: '#10b981' };
  } else if (streak >= 15) {
    planetStageName = 'Thriving Ecosystem';
    nextUnlockText = `${31 - streak} more days → Cosmos stage`;
    planetColors = { ground: '#1d4ed8', land: '#059669' };
  } else if (streak >= 8) {
    planetStageName = 'River & Woodlands';
    nextUnlockText = `${15 - streak} more days → Ecosystem stage`;
    planetColors = { ground: '#2563eb', land: '#10b981' };
  } else if (streak >= 4) {
    planetStageName = 'Sapling Grasslands';
    nextUnlockText = `${8 - streak} more days → Woodlands stage`;
    planetColors = { ground: '#3b82f6', land: '#34d399' };
  } else if (streak >= 1) {
    planetStageName = 'First Sprouts';
    nextUnlockText = `${4 - streak} more days → Grasslands stage`;
    planetColors = { ground: '#3e3b38', land: '#4ade80' };
  }

  // Draw Planet Centerpiece SVG
  const renderPlanetCenterpiece = () => {
    // Coordinate offsets for landmarks placed symmetrically around circular perimeter
    const landmarksSVG = [];
    const radius = 40;
    const cx = 60, cy = 60;

    for (let i = 0; i < landmarkCount; i++) {
      const angle = (i * 2 * Math.PI) / 10 - Math.PI / 2;
      const lx = cx + (radius + 2) * Math.cos(angle);
      const ly = cy + (radius + 2) * Math.sin(angle);
      landmarksSVG.push(
        <polygon 
          key={i} 
          points={`${lx},${ly-5} ${lx-4},${ly} ${lx+4},${ly}`} 
          fill="var(--amber)" 
          stroke="var(--bg-darker)"
          strokeWidth="0.5"
          title={`Landmark client: #${i+1}`}
        />
      );
    }

    return (
      <div 
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '10px 0', cursor: 'pointer' }}
        onClick={() => setPlanetTooltip(`Stage: ${planetStageName} (${streak}d streak) · ${nextUnlockText}`)}
      >
        <svg 
          width="120" 
          height="120" 
          viewBox="0 0 120 120"
          style={{ 
            filter: wilted ? 'grayscale(0.7) sepia(0.3) saturate(0.5)' : 'none',
            transition: 'filter 0.5s ease'
          }}
        >
          {/* Streak 31+ Aura */}
          {streak >= 31 && (
            <circle 
              cx="60" 
              cy="60" 
              r="48" 
              fill="transparent" 
              stroke="var(--amber)" 
              strokeWidth="2" 
              strokeDasharray="4,4"
              opacity="0.8"
            >
              <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="10s" repeatCount="indefinite" />
            </circle>
          )}

          {/* Planet base sphere */}
          <circle cx="60" cy="60" r={radius} fill={planetColors.ground} stroke="var(--border)" strokeWidth="1.5" />

          {/* Continents (Only if streak >= 1) */}
          {streak >= 1 && (
            <>
              <path d="M 35 45 Q 40 40 45 42 T 55 50 T 45 65 T 30 55 Z" fill={planetColors.land} opacity="0.9" />
              <path d="M 65 40 Q 75 35 80 45 T 75 60 T 60 50 Z" fill={planetColors.land} opacity="0.9" />
              <path d="M 50 68 Q 60 75 65 72 T 70 80 T 55 80 Z" fill={planetColors.land} opacity="0.9" />
            </>
          )}

          {/* Barren Cracks (Streak == 0) */}
          {streak === 0 && (
            <path d="M 45 45 L 55 55 M 65 45 L 60 55 M 50 70 L 60 65 M 70 70 L 68 75" stroke="#2c2520" strokeWidth="1.5" />
          )}

          {/* Sprouts (Streak 1-3) */}
          {streak >= 1 && streak < 4 && (
            <g stroke="var(--green)" strokeWidth="1.5" fill="none">
              <path d="M 50 25 Q 48 18 52 18" />
              <path d="M 70 25 Q 73 19 70 18" />
            </g>
          )}

          {/* Small trees & River (Streak 4+) */}
          {streak >= 4 && (
            <g fill="var(--green)">
              {/* Forest trees */}
              <polygon points="50,22 47,28 53,28" />
              <polygon points="70,22 67,28 73,28" />
              {streak >= 8 && (
                <>
                  {/* Blue river */}
                  <path d="M 40 60 Q 50 50 60 70 T 80 60" fill="none" stroke="#2563eb" strokeWidth="2.5" />
                  <polygon points="60,20 57,26 63,26" />
                </>
              )}
            </g>
          )}

          {/* Clouds & Birds (Streak 15+) */}
          {streak >= 15 && (
            <g>
              {/* Clouds */}
              <rect x="35" y="32" width="22" height="6" rx="3" fill="#ffffff" opacity="0.4" />
              <rect x="65" y="65" width="25" height="6" rx="3" fill="#ffffff" opacity="0.4" />
              {/* Flying Birds */}
              <path d="M 80 30 L 83 28 L 86 30" fill="none" stroke="#f4f4f1" strokeWidth="1" />
              <path d="M 42 75 L 45 73 L 48 75" fill="none" stroke="#f4f4f1" strokeWidth="1" />
            </g>
          )}

          {/* Permanent client landmarks */}
          {landmarksSVG}
        </svg>

        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', color: wilted ? 'var(--red)' : 'var(--text-muted)', marginTop: '4px' }}>
          {wilted ? '🌏 Planet Wilted (Reps Missed!)' : `🌏 Stage: ${planetStageName}`}
        </span>

        {planetTooltip && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '4px', fontSize: '11px', color: 'var(--amber)', marginTop: '6px', textAlign: 'center' }}>
            {planetTooltip}
          </div>
        )}
      </div>
    );
  };

  // Workout metrics check
  const workoutMinDMs = todayLog.dms_sent >= 5;
  const workoutContent = todayLog.content_posted;
  const workoutWaiting = totalWaitingCount === 0;
  const isWorkoutDone = workoutMinDMs && workoutContent && workoutWaiting;

  // Render 28-day Outreach heat grid (DM reps grid)
  const renderOutreachHeatGrid = () => {
    const cells = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const log = dailyLogs[dateStr];
      
      let level = 'none'; // none, partial, full
      let tooltip = `${dateStr}: 0 DMs`;
      
      if (log) {
        if (log.dms_sent >= 20) {
          level = 'full';
          tooltip = `${dateStr}: ${log.dms_sent} DMs (Target Complete 🔥)`;
        } else if (log.dms_sent >= 5) {
          level = 'partial';
          tooltip = `${dateStr}: ${log.dms_sent} DMs (Minimum Hit)`;
        } else {
          tooltip = `${dateStr}: ${log.dms_sent} DMs (Missed)`;
        }
      }
      cells.push({ level, tooltip });
    }

    return (
      <div className="heatgrid-grid">
        {cells.map((cell, idx) => (
          <div 
            key={idx} 
            className={`heatgrid-day heat-level-${cell.level}`}
            title={cell.tooltip}
          />
        ))}
      </div>
    );
  };

  // Render 28-day Content Posted heat grid (raw video grid)
  const renderContentHeatGrid = () => {
    const cells = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const log = dailyLogs[dateStr];
      
      let level = 'none';
      let tooltip = `${dateStr}: No video posted`;
      
      if (log && log.content_posted) {
        level = 'full';
        tooltip = `${dateStr}: Video posted! 🎥`;
      }
      cells.push({ level, tooltip });
    }

    return (
      <div className="heatgrid-grid">
        {cells.map((cell, idx) => (
          <div 
            key={idx} 
            className={`heatgrid-day heat-level-${cell.level}`}
            style={{ 
              backgroundColor: cell.level === 'full' ? 'var(--green)' : '#2c2c27',
              borderColor: cell.level === 'full' ? '#34d399' : 'transparent' 
            }}
            title={cell.tooltip}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="dashboard-grid">
      
      {/* Dynamic Planet centerpiece */}
      {renderPlanetCenterpiece()}

      {/* Today's Workout Card (Trigger) */}
      <div className="panel" style={{ borderColor: isWorkoutDone ? 'var(--green)' : 'var(--border)' }}>
        <h3 className="panel-title" style={{ color: isWorkoutDone ? 'var(--green)' : 'var(--text-primary)', marginBottom: '10px' }}>
          🏋️ Today's Workout Checklist
        </h3>
        
        {isWorkoutDone ? (
          <div style={{ background: 'var(--green-glow)', border: '1px solid rgba(74, 222, 128, 0.3)', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--green)', letterSpacing: '0.05em' }}>
              DAY COMPLETE 🔥
            </span>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Reps hit, content posted, zero backlog. You watered your planet! 🌱
            </p>
            
            {/* Investment Form */}
            <div style={{ marginTop: '14px', borderTop: '1px dashed rgba(74, 222, 128, 0.3)', paddingTop: '12px', textAlign: 'left' }}>
              <span style={{ fontSize: '11px', color: 'var(--amber)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                Queue Tomorrow's Targets (Investment)
              </span>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Add IG handles to queue for tomorrow:
              </p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input 
                  type="text" 
                  className="form-control" 
                  style={{ flex: 1, height: '32px', fontSize: '11px' }}
                  placeholder="E.g. @alpha, @beta" 
                  value={tomorrowInput}
                  onChange={e => setTomorrowInput(e.target.value)}
                />
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ padding: '0 12px', height: '32px', fontSize: '11px' }}
                  onClick={handleQueueTomorrow}
                >
                  Queue
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: workoutMinDMs ? 'var(--green)' : 'var(--text-muted)' }}>
                  {workoutMinDMs ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: '13px' }}>5 DM minimum (Today: {todayLog.dms_sent}/20)</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: workoutContent ? 'var(--green)' : 'var(--text-muted)' }}>
                  {workoutContent ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: '13px' }}>Raw outreach video posted</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: workoutWaiting ? 'var(--green)' : 'var(--text-muted)' }}>
                  {workoutWaiting ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: '13px' }}>Clear backlog checklist (Due: {totalWaitingCount})</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Header Strip Scoreboard */}
      <div className="header-scoreboard">
        <div className="stat-box">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <Flame 
              className={`flame-streak ${streak >= 30 ? 'level-30' : streak >= 14 ? 'level-14' : streak >= 7 ? 'level-7' : ''}`} 
              size={14} 
              color="var(--amber)" 
              fill="var(--amber)" 
            /> 
            <span>STREAK</span>
            <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
              {Array.from({ length: shieldsHeld }).map((_, sIdx) => (
                <Shield key={sIdx} size={10} color="var(--green)" fill="var(--green)" title="Streak Shield active!" />
              ))}
            </div>
          </div>
          <div className="stat-value scoreboard-number amber-text">
            {streak}d
          </div>
        </div>

        <div className="stat-box" onClick={handleQuickLogDM} style={{ cursor: 'pointer' }}>
          <div className="stat-label">
            TODAY'S DMS <span style={{ fontSize: '10px', color: 'var(--amber)' }}>+LOG</span>
          </div>
          <div className="stat-value scoreboard-number">
            {todayLog.dms_sent}<span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>/20</span>
          </div>
        </div>

        <div className="stat-box" onClick={handleToggleContent} style={{ cursor: 'pointer' }}>
          <div className="stat-label">
            CONTENT POSTED
          </div>
          <div className="stat-value scoreboard-number" style={{ color: todayLog.content_posted ? 'var(--green)' : 'var(--text-muted)' }}>
            {todayLog.content_posted ? 'YES 🔥' : 'NO ❌'}
          </div>
        </div>

        <div className="stat-box" onClick={() => onNavigate('money')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">
            <CircleDollarSign size={14} color="var(--green)" /> COLLECTED
          </div>
          <div className="stat-value scoreboard-number green-text">
            {formatRupee(collectedThisMonth)}
          </div>
        </div>

        <div className="stat-box" onClick={() => onNavigate('money')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">
            <Shield size={14} color="var(--amber)" /> TO COLLECT
          </div>
          <div className="stat-value scoreboard-number amber-text">
            {formatRupee(toCollectTotal)}
          </div>
        </div>
      </div>

      {/* "Waiting on you" Panel */}
      <div className="panel">
        <h3 className="panel-title">
          <AlertCircle size={16} color={totalWaitingCount > 0 ? "var(--red)" : "var(--green)"} /> 
          Waiting On You ({totalWaitingCount})
        </h3>
        
        {totalWaitingCount === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '10px 0' }}>
            No leads waiting. Go send 5 DMs to water your planet. 🌱
          </p>
        ) : (
          <div className="waiting-list">
            {waitingInbound.map(lead => (
              <div 
                key={lead.id} 
                className="waiting-item urgent-glow"
                onClick={() => onNavigateToLead(lead.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="waiting-info">
                  <span className="waiting-name" style={{ color: 'var(--amber)' }}>★ Inbound: {lead.name}</span>
                  <span className="waiting-tag">No contact in 24 hours ({lead.instagram_handle})</span>
                </div>
                <div className="waiting-action">
                  <span>Reply</span>
                  <ChevronRight size={14} />
                </div>
              </div>
            ))}

            {waitingActions.map(lead => {
              const isOverdue = new Date(lead.next_action_date) < new Date(todayStr);
              return (
                <div 
                  key={lead.id} 
                  className="waiting-item"
                  onClick={() => onNavigateToLead(lead.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="waiting-info">
                    <span className="waiting-name">{lead.name}</span>
                    <span className="waiting-tag" style={{ color: 'var(--text-secondary)' }}>Action: {lead.next_action}</span>
                  </div>
                  <button 
                    className={`waiting-action ${isOverdue ? 'overdue-action' : ''}`}
                    onClick={(e) => handleCompleteAction(lead.id, e)}
                  >
                    <Check size={12} />
                    <span>Done</span>
                  </button>
                </div>
              );
            })}

            {overduePayments.map(payment => (
              <div 
                key={payment.id} 
                className="waiting-item" 
                onClick={() => onNavigate('money')}
                style={{ cursor: 'pointer' }}
              >
                <div className="waiting-info">
                  <span className="waiting-name" style={{ color: 'var(--red)' }}>Overdue payment: {payment.clientName}</span>
                  <span className="waiting-tag">₹{payment.amount - payment.amount_paid} overdue by {payment.daysOverdue} days</span>
                </div>
                <div className="waiting-action overdue-action">
                  <span>Collect</span>
                  <ChevronRight size={14} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hot Leads strip */}
      <div className="panel">
        <h3 className="panel-title">
          <Activity size={16} color="var(--amber)" /> Today's Priorities (Hot Leads)
        </h3>
        
        {hotLeads.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No active leads in the funnel yet.</p>
        ) : (
          <div className="hot-leads-strip">
            {hotLeads.map(lead => {
              const scoreCategory = getScoreCategory(lead.score);
              const radius = 14;
              const circumference = 2 * Math.PI * radius;
              const strokeDashoffset = circumference - (lead.score / 100) * circumference;

              return (
                <div 
                  key={lead.id} 
                  className="hot-lead-bubble"
                  onClick={() => onNavigateToLead(lead.id)}
                >
                  <div className="activity-ring-container">
                    <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="18" cy="18" r={radius} fill="transparent" stroke="var(--border)" strokeWidth="3.5" />
                      <circle 
                        cx="18" 
                        cy="18" 
                        r={radius} 
                        fill="transparent" 
                        stroke={scoreCategory.color} 
                        strokeWidth="3.5" 
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="ring-score-text" style={{ color: scoreCategory.color }}>
                      {lead.score}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{lead.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{lead.niche}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lead Source & Conversion Science */}
      <div className="panel" style={{ gridColumn: 'span 2' }}>
        <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={16} color="var(--amber)" /> Lead Source & Conversion Science
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '-8px', marginBottom: '16px' }}>
          Real-time pipeline tracking and auto-calculated funnel bottlenecks for each source channel.
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {getSourceAnalytics().map((item, idx) => {
            const colors = {
              'DM Outreach': 'var(--amber)',
              'Organic Inbound': 'var(--cyan)',
              'Facebook Ads': 'var(--green)'
            };
            const currentBg = {
              'DM Outreach': 'rgba(245, 158, 11, 0.03)',
              'Organic Inbound': 'rgba(6, 182, 212, 0.03)',
              'Facebook Ads': 'rgba(16, 185, 129, 0.03)'
            };
            const iconColor = colors[item.source] || 'var(--text-secondary)';
            
            return (
              <div key={idx} style={{ background: currentBg[item.source] || 'var(--bg-darker)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: iconColor }}>
                      {item.source === 'Organic Inbound' ? '★ Organic Inbound' : item.source}
                    </span>
                    <span style={{ fontSize: '11px', background: 'var(--bg-darker)', padding: '2px 8px', borderRadius: '12px', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                      {item.total} Total Leads
                    </span>
                  </div>
                  
                  {/* Grid of stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', margin: '12px 0 6px 0' }}>
                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Won / Active</span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.won} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Won</span> / {item.active} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Active</span>
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Closed Revenue</span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--green)' }}>
                        {formatRupee(item.closedRevenue)}
                      </span>
                    </div>
                  </div>

                  {/* Conversion progress bar */}
                  <div style={{ margin: '10px 0 6px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '11px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Conversion Success:</span>
                      <span style={{ fontWeight: 700, color: item.conversionRate > 20 ? 'var(--green)' : 'var(--amber)' }}>{item.conversionRate}%</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-darker)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: item.conversionRate > 20 ? 'var(--green)' : 'var(--amber)', width: `${item.conversionRate}%`, transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                </div>

                {/* Bottleneck Advisor */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--amber)', display: 'block', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.05em' }}>
                    🤖 Pipeline Science Insight:
                  </span>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {item.bottleneck}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Funnel Snapshot */}
      <div className="panel">
        <h3 className="panel-title">
          <TrendingUp size={16} color="var(--amber)" /> Weekly Conversion Funnel
        </h3>
        <div className="funnel-container">
          {[
            { label: 'DMs Sent', count: funnel.dms, percent: 100 },
            { label: 'Replies', count: funnel.replies, percent: funnel.dms ? Math.round((funnel.replies / funnel.dms) * 100) : 0 },
            { label: 'Free Videos', count: funnel.videos, percent: funnel.replies ? Math.round((funnel.videos / funnel.replies) * 100) : 0 },
            { label: 'Meetings Booked', count: funnel.meetings, percent: funnel.videos ? Math.round((funnel.meetings / funnel.videos) * 100) : 0 },
            { label: 'Clients Won', count: funnel.clientsWon, percent: funnel.meetings ? Math.round((funnel.clientsWon / funnel.meetings) * 100) : 0, isWon: true }
          ].map((stage, idx) => (
            <div key={idx}>
              <div className={`funnel-stage ${stage.isWon ? 'won-stage' : ''}`}>
                <div className="funnel-stage-fill" style={{ width: `${stage.percent}%` }} />
                <div className="funnel-stage-label">
                  <span>{stage.label}</span>
                  <span className="funnel-stage-count">{stage.count}</span>
                </div>
              </div>
              {idx > 0 && (
                <div className="funnel-conversion">
                  ↳ Conversion Rate: {stage.percent}%
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* PWA Daily Notification settings */}
      <div className="panel">
        <h3 className="panel-title">
          <Bell size={16} color="var(--amber)" /> Daily Workout Reminders
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '-10px', marginBottom: '12px' }}>
          Schedule local notification alerts to keep your outreach streak alive.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input 
            type="time" 
            className="form-control" 
            style={{ width: '120px' }} 
            value={notifTime} 
            onChange={e => {
              setNotifTime(e.target.value);
              if (notifEnabled) {
                localStorage.setItem('goe_notif_time', e.target.value);
              }
            }}
          />
          {notifEnabled ? (
            <button className="btn btn-secondary" onClick={handleDisableNotifications}>
              Disable Alerts
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleEnableNotification}>
              Enable Alerts
            </button>
          )}
        </div>
      </div>

      {/* Habit graph & Grid */}
      <div className="panel">
        <h3 className="panel-title">Habit Performance</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              7-DAY ROLLING OUTREACH (AVG: {averageDMs} DMs/day)
            </span>
            {renderAverageChart()}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              28-DAY OUTREACH HEATGRID
            </span>
            {renderOutreachHeatGrid()}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              CONTENT POSTED HEATGRID (28 DAYS)
            </span>
            {renderContentHeatGrid()}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
              Client Videos Delivered (This Week)
            </span>
            <span className="scoreboard-number" style={{ fontSize: '20px', color: 'var(--green)', fontWeight: 'bold' }}>
              {clientVideosThisWeek}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
