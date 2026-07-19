import React, { useState, useEffect } from 'react';
import { 
  X, 
  MessageSquarePlus, 
  UserPlus, 
  Coins, 
  Check, 
  Flame, 
  AlertCircle 
} from 'lucide-react';
import { 
  getLeads, 
  addLead, 
  updateLead,
  addPayment, 
  incrementLogCount, 
  getLocalDateString, 
  formatRupee,
  getDailyLogs
} from '../utils/storage';

export default function QuickLogModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('dm'); // 'dm', 'lead', 'payment'
  const [clients, setClients] = useState([]);
  
  // Quick DM Alert state
  const [showDmsLoggedAlert, setShowDmsLoggedAlert] = useState(false);
  const [videosDeliveredCount, setVideosDeliveredCount] = useState(0);

  // Press handlers state
  const [isLongPress, setIsLongPress] = useState(false);
  const [timerId, setTimerId] = useState(null);

  // New Lead Form State
  const [leadForm, setLeadForm] = useState({
    name: '',
    instagram_handle: '',
    niche: '',
    city: '',
    source: 'DM Outreach',
    deal_value: '',
    next_action: '',
    next_action_date: getLocalDateString()
  });
  const [leadErrors, setLeadErrors] = useState({});

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState({
    clientId: '',
    amount: '',
    status: 'Paid'
  });
  const [paymentErrors, setPaymentErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      const loadData = async () => {
        const freshLeads = await getLeads();
        setClients(freshLeads.filter(l => l.stage === 'Won'));
        
        const logs = await getDailyLogs();
        const todayStr = getLocalDateString();
        const todayLog = logs[todayStr] || {};
        setVideosDeliveredCount(todayLog.videos_delivered || 0);
      };
      
      loadData();
      setShowDmsLoggedAlert(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Log Cold DM sent
  const handleQuickLogDM = async (count = 1) => {
    const todayStr = getLocalDateString();
    
    // Hinglish Variable Reward check on hitting 20 DMs
    const logs = await getDailyLogs();
    const beforeCount = logs[todayStr]?.dms_sent || 0;
    
    const updatedLog = await incrementLogCount(todayStr, 'dms_sent', count);
    const afterCount = updatedLog.dms_sent || 0;

    if (afterCount >= 20 && beforeCount < 20) {
      if (Math.random() < 0.2) { // 1 in 5 chance (20%)
        const coachSayings = [
          "Aag laga di aaj 🔥",
          "20/20 — coach is proud!",
          "Beast mode activated! 🦁",
          "Reps on reps, kamaal kar diya! 🏋️",
          "Gazab! Your planet is watered & proud! 🌱"
        ];
        const saying = coachSayings[Math.floor(Math.random() * coachSayings.length)];
        alert(`🏆 Scoreboard Alert: ${saying}`);
      }
    }

    setShowDmsLoggedAlert(true);
    setTimeout(() => {
      setShowDmsLoggedAlert(false);
      onClose();
    }, 1000);
  };

  const startPress = (e) => {
    e.preventDefault();
    setIsLongPress(false);
    const id = setTimeout(() => {
      setIsLongPress(true);
      handleQuickLogDM(5);
    }, 600);
    setTimerId(id);
  };

  const endPress = (e) => {
    e.preventDefault();
    if (timerId) {
      clearTimeout(timerId);
      setTimerId(null);
    }
    if (!isLongPress) {
      handleQuickLogDM(1);
    }
  };

  const handleLogVideosDelivered = async (amount) => {
    const todayStr = getLocalDateString();
    const updated = await incrementLogCount(todayStr, 'videos_delivered', amount);
    setVideosDeliveredCount(updated.videos_delivered || 0);
  };

  // Log new Lead submit
  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!leadForm.name.trim()) errors.name = 'Name is required';
    if (!leadForm.instagram_handle.trim()) errors.instagram_handle = 'Instagram handle is required';
    if (!leadForm.next_action.trim()) errors.next_action = 'Next action is required';
    if (!leadForm.next_action_date) errors.next_action_date = 'Next action date is required';
    
    if (Object.keys(errors).length > 0) {
      setLeadErrors(errors);
      return;
    }

    const notes = [
      {
        id: 'n-quick-init',
        date: new Date().toISOString(),
        type: 'custom',
        content: `Lead created from Quick Action panel.`
      }
    ];

    await addLead({
      ...leadForm,
      stage: 'To DM',
      notes
    });

    // Reset
    setLeadForm({
      name: '',
      instagram_handle: '',
      niche: '',
      city: '',
      source: 'DM Outreach',
      deal_value: '',
      next_action: '',
      next_action_date: getLocalDateString()
    });
    setLeadErrors({});
    onClose();
  };

  // Log payment collection submit
  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!paymentForm.clientId) errors.clientId = 'Client is required';
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) errors.amount = 'Valid amount is required';

    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      return;
    }

    const client = clients.find(c => c.id === paymentForm.clientId);
    
    await addPayment({
      clientId: paymentForm.clientId,
      amount: Number(paymentForm.amount),
      due_date: getLocalDateString(),
      paid_date: getLocalDateString(),
      status: 'Paid',
      amount_paid: Number(paymentForm.amount)
    });

    // Add note to lead (FIXED duplicate client bug: use updateLead instead of addLead)
    if (client) {
      const updatedNotes = [...(client.notes || [])];
      updatedNotes.push({
        id: 'note-' + Date.now(),
        date: new Date().toISOString(),
        type: 'custom',
        content: `Logged payment of ${formatRupee(paymentForm.amount)} received.`
      });
      await updateLead(client.id, {
        notes: updatedNotes
      });
    }

    // Reset
    setPaymentForm({
      clientId: '',
      amount: '',
      status: 'Paid'
    });
    setPaymentErrors({});
    onClose();
  };

  const handleSelectClient = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    setPaymentForm({
      ...paymentForm,
      clientId,
      amount: client ? client.monthly_retainer || client.deal_value || '' : ''
    });
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }}>
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header" style={{ padding: '12px 16px' }}>
          <h3 style={{ fontSize: '16px' }}>Quick Record</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Action Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
          <button 
            type="button"
            className="nav-item" 
            style={{ flex: 1, height: '48px', borderBottom: activeTab === 'dm' ? '2px solid var(--amber)' : 'none', color: activeTab === 'dm' ? 'var(--text-primary)' : 'var(--text-muted)' }}
            onClick={() => setActiveTab('dm')}
          >
            <MessageSquarePlus size={16} />
            <span>Log DM</span>
          </button>
          <button 
            type="button"
            className="nav-item" 
            style={{ flex: 1, height: '48px', borderBottom: activeTab === 'lead' ? '2px solid var(--amber)' : 'none', color: activeTab === 'lead' ? 'var(--text-primary)' : 'var(--text-muted)' }}
            onClick={() => setActiveTab('lead')}
          >
            <UserPlus size={16} />
            <span>Add Lead</span>
          </button>
          <button 
            type="button"
            className="nav-item" 
            style={{ flex: 1, height: '48px', borderBottom: activeTab === 'payment' ? '2px solid var(--amber)' : 'none', color: activeTab === 'payment' ? 'var(--text-primary)' : 'var(--text-muted)' }}
            onClick={() => setActiveTab('payment')}
          >
            <Coins size={16} />
            <span>Collect</span>
          </button>
        </div>

        <div className="modal-body" style={{ padding: '16px' }}>
          
          {/* TAB 1: QUICK LOG DM */}
          {activeTab === 'dm' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                Completed an outreach rep? Tap below to count a DM for today.
              </p>
              
              {showDmsLoggedAlert ? (
                <div style={{ background: 'var(--green-glow)', border: '1px solid var(--green)', padding: '16px', borderRadius: '50%', width: '90px', height: '90px', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                  <Check size={40} color="var(--green)" />
                </div>
              ) : (
                <>
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '120px', height: '120px', borderRadius: '50%', flexDirection: 'column', gap: '8px', fontSize: '15px', fontWeight: 800, margin: '0 auto', boxShadow: '0 8px 24px var(--amber-glow)', display: 'flex', justifyContent: 'center', alignItems: 'center', userSelect: 'none', touchAction: 'none' }}
                    onMouseDown={startPress}
                    onMouseUp={endPress}
                    onTouchStart={startPress}
                    onTouchEnd={endPress}
                  >
                    <Flame size={28} color="var(--bg-darker)" fill="var(--bg-darker)" />
                    <span>LOG DM</span>
                  </button>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '10px' }}>
                    Hold down to log batch of 5 DMs
                  </span>
                </>
              )}
              
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '20px', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Client Videos Delivered Today
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '4px 12px', minWidth: '40px', fontSize: '16px', fontWeight: 'bold' }}
                    onClick={() => handleLogVideosDelivered(-1)}
                  >
                    -
                  </button>
                  <span className="scoreboard-number" style={{ fontSize: '20px', minWidth: '35px', display: 'inline-block', textAlign: 'center' }}>
                    {videosDeliveredCount}
                  </span>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '4px 12px', minWidth: '40px', fontSize: '16px', fontWeight: 'bold' }}
                    onClick={() => handleLogVideosDelivered(1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: QUICK ADD LEAD */}
          {activeTab === 'lead' && (
            <form onSubmit={handleLeadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="form-group">
                <label>Lead Name*</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="E.g. Rohan Sen" 
                  value={leadForm.name}
                  onChange={e => setLeadForm({ ...leadForm, name: e.target.value })}
                />
                {leadErrors.name && <span style={{ color: 'var(--red)', fontSize: '10px' }}>{leadErrors.name}</span>}
              </div>

              <div className="form-group">
                <label>Instagram Handle*</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="@rohan_growth" 
                  value={leadForm.instagram_handle}
                  onChange={e => setLeadForm({ ...leadForm, instagram_handle: e.target.value })}
                />
                {leadErrors.instagram_handle && <span style={{ color: 'var(--red)', fontSize: '10px' }}>{leadErrors.instagram_handle}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Business Niche</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="E-com brand" 
                    value={leadForm.niche}
                    onChange={e => setLeadForm({ ...leadForm, niche: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Deal Value (₹ monthly)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="30000" 
                    value={leadForm.deal_value}
                    onChange={e => setLeadForm({ ...leadForm, deal_value: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0', paddingTop: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--amber)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  Next Action Details (Required)
                </span>
                
                <div className="form-group">
                  <label>Next Step Plan*</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="E.g. Send loom review" 
                    value={leadForm.next_action}
                    onChange={e => setLeadForm({ ...leadForm, next_action: e.target.value })}
                  />
                  {leadErrors.next_action && <span style={{ color: 'var(--red)', fontSize: '10px' }}>{leadErrors.next_action}</span>}
                </div>

                <div className="form-group">
                  <label>Action Target Date*</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={leadForm.next_action_date}
                    onChange={e => setLeadForm({ ...leadForm, next_action_date: e.target.value })}
                  />
                  {leadErrors.next_action_date && <span style={{ color: 'var(--red)', fontSize: '10px' }}>{leadErrors.next_action_date}</span>}
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
                Add to Pipeline
              </button>
            </form>
          )}

          {/* TAB 3: QUICK LOG PAYMENT */}
          {activeTab === 'payment' && (
            <form onSubmit={handlePaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="form-group">
                <label>Select Client*</label>
                <select 
                  className="form-control"
                  value={paymentForm.clientId}
                  onChange={e => handleSelectClient(e.target.value)}
                >
                  <option value="">-- Choose Client --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.instagram_handle})</option>
                  ))}
                </select>
                {paymentErrors.clientId && <span style={{ color: 'var(--red)', fontSize: '10px' }}>{paymentErrors.clientId}</span>}
              </div>

              <div className="form-group">
                <label>Amount Received (₹)*</label>
                <input 
                  type="number" 
                  className="form-control" 
                  placeholder="₹ Retainer value" 
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                />
                {paymentErrors.amount && <span style={{ color: 'var(--red)', fontSize: '10px' }}>{paymentErrors.amount}</span>}
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', margin: '4px 0' }}>
                <AlertCircle size={12} /> This logs an immediate "Paid" invoice for today.
              </p>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                Record Collection
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
