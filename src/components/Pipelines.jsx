import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  CheckSquare, 
  FileText, 
  User, 
  X,
  Loader
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  getLeads, 
  updateLead, 
  deleteLead,
  addLead,
  incrementLogCount, 
  getLocalDateString, 
  formatRupee,
  getScoreCategory 
} from '../utils/storage';

const PIPELINE_STAGES = [
  'To DM',
  'DM Sent',
  'Replied',
  'Free Video Sent',
  'Meeting Booked',
  'Won',
  'Lost'
];

export default function Pipelines({ activeLeadId, clearActiveLeadId }) {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [leads, setLeads] = useState([]);
  const [selectedSource, setSelectedSource] = useState('All');
  const [editingLead, setEditingLead] = useState(null);
  
  // Dialog Prompts State
  const [repliedPromptLead, setRepliedPromptLead] = useState(null);
  const [lostReasonLead, setLostReasonLead] = useState(null);
  
  // Add Lead Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    name: '',
    instagram_handle: '',
    niche: '',
    city: '',
    phone: '',
    source: 'DM Outreach',
    stage: 'To DM',
    deal_value: '',
    next_action: '',
    next_action_date: getLocalDateString()
  });

  const [formErrors, setFormErrors] = useState({});

  // Note input state - must be declared before any early returns (Rules of Hooks)
  const [customNoteText, setCustomNoteText] = useState('');
  const [customNoteType, setCustomNoteType] = useState('custom');

  useEffect(() => {
    const loadLeads = async () => {
      try {
        setLoading(true);
        const allLeads = await getLeads();
        setLeads(allLeads);
        
        // If we navigate here with an active lead ID from dashboard
        if (activeLeadId) {
          const lead = allLeads.find(l => l.id === activeLeadId);
          if (lead) {
            setEditingLead(lead);
          }
          clearActiveLeadId();
        }
      } catch (err) {
        console.error("Error loading leads:", err);
      } finally {
        setLoading(false);
      }
    };
    
    loadLeads();
    window.addEventListener('goe_state_change', loadLeads);
    return () => window.removeEventListener('goe_state_change', loadLeads);
  }, [activeLeadId]);

  const boardRef = useRef(null);
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      if (e.target.closest('.column-cards')) return; // let card lists scroll vertically
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '12px' }}>
        <Loader className="spin" size={32} color="var(--amber)" />
        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Loading pipeline...</span>
      </div>
    );
  }

  const filteredLeads = selectedSource === 'All' 
    ? leads 
    : leads.filter(l => l.source === selectedSource);

  // Drag and Drop
  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetStage) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    
    handleStageTransition(lead, targetStage);
  };

  const handleStageTransition = async (lead, targetStage) => {
    if (lead.stage === targetStage) return;

    // Transition Side-effects
    if (targetStage === 'Replied') {
      // Prompt modal
      setRepliedPromptLead(lead);
    } else if (targetStage === 'Lost') {
      // Lost reason modal
      setLostReasonLead(lead);
    } else if (targetStage === 'Won') {
      // Confetti celebration
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
      
      const notes = [...(lead.notes || [])];
      notes.push({
        id: 'note-' + Date.now(),
        date: new Date().toISOString(),
        type: 'custom',
        content: 'Status updated to Won! Client acquired 🎉'
      });

      await updateLead(lead.id, { 
        stage: 'Won',
        monthly_retainer: lead.deal_value,
        start_date: getLocalDateString(),
        videos_per_month: 8,
        notes
      });
    } else {
      // Standard transition
      const notes = [...(lead.notes || [])];
      
      // Auto-increment DM counter if moved to DM Sent
      if (targetStage === 'DM Sent') {
        await incrementLogCount(getLocalDateString(), 'dms_sent', 1);
        notes.push({
          id: 'note-' + Date.now(),
          date: new Date().toISOString(),
          type: 'DM sent',
          content: 'Outreach DM sent (auto-logged from stage change).'
        });
      } else {
        notes.push({
          id: 'note-' + Date.now(),
          date: new Date().toISOString(),
          type: 'custom',
          content: `Moved from "${lead.stage}" to "${targetStage}".`
        });
      }

      await updateLead(lead.id, { 
        stage: targetStage,
        notes
      });
    }
  };

  // Confirm "Replied" Dialog
  const handleConfirmRepliedPrompt = async (suggestedAction) => {
    const lead = repliedPromptLead;
    const notes = [...(lead.notes || [])];
    notes.push({
      id: 'note-' + Date.now(),
      date: new Date().toISOString(),
      type: 'Replied',
      content: 'Replied to DM. Prompted with suggested next steps.'
    });

    await updateLead(lead.id, {
      stage: 'Replied',
      next_action: suggestedAction ? 'Send free video + ask for meeting' : lead.next_action,
      notes
    });

    if (Math.random() < 0.3) {
      const toasts = [
        "+Momentum! You are building habits that buy freedom. Keep going! 🚀",
        "+Momentum! The pipeline is warming up. Feed the machine! 🔥",
        "+Momentum! Momentum is your only moat. Keep pushing reps! 🏋️"
      ];
      const selectedToast = toasts[Math.floor(Math.random() * toasts.length)];
      alert(selectedToast);
    }

    setRepliedPromptLead(null);
  };

  // Confirm "Lost Reason" Dialog
  const handleConfirmLostReason = async (reason) => {
    const lead = lostReasonLead;
    const notes = [...(lead.notes || [])];
    notes.push({
      id: 'note-' + Date.now(),
      date: new Date().toISOString(),
      type: 'custom',
      content: `Lost lead. Reason: ${reason}`
    });

    await updateLead(lead.id, {
      stage: 'Lost',
      lost_reason: reason,
      notes
    });
    setLostReasonLead(null);
  };

  // Lead Form Validation
  const validateLeadForm = (form) => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!form.instagram_handle.trim()) errors.instagram_handle = 'Instagram handle is required';
    if (!form.next_action.trim()) errors.next_action = 'Next action is required';
    if (!form.next_action_date) errors.next_action_date = 'Next action date is required';
    return errors;
  };

  const handleAddLeadSubmit = async (e) => {
    e.preventDefault();
    const errors = validateLeadForm(newLeadForm);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const notes = [
      {
        id: 'n-init',
        date: new Date().toISOString(),
        type: 'custom',
        content: `Lead created. Source: ${newLeadForm.source}.`
      }
    ];

    try {
      setProcessing(true);
      await addLead({
        ...newLeadForm,
        notes
      });

      // Reset Form
      setNewLeadForm({
        name: '',
        instagram_handle: '',
        niche: '',
        city: '',
        phone: '',
        source: 'DM Outreach',
        stage: 'To DM',
        deal_value: '',
        next_action: '',
        next_action_date: getLocalDateString()
      });
      setFormErrors({});
      setIsAddModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to add lead to Supabase database.');
    } finally {
      setProcessing(false);
    }
  };

  // Lead Editing Save
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const errors = validateLeadForm(editingLead);
    if (Object.keys(errors).length > 0) {
      alert('Next action & Next action date are REQUIRED. Lead cannot be saved without them.');
      return;
    }
    
    try {
      setProcessing(true);
      await updateLead(editingLead.id, editingLead);
      setEditingLead(null);
    } catch (err) {
      console.error(err);
      alert('Failed to update lead details in Supabase.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (leadId) => {
    if (confirm('Are you sure you want to delete this lead? This will also delete any client payment records.')) {
      try {
        setProcessing(true);
        await deleteLead(leadId);
        setEditingLead(null);
      } catch (err) {
        console.error(err);
        alert('Failed to delete lead from database.');
      } finally {
        setProcessing(false);
      }
    }
  };

  // Add custom note during lead edit

  const handleAddNote = () => {
    if (!customNoteText.trim()) return;
    
    const updatedNotes = [...(editingLead.notes || [])];
    updatedNotes.push({
      id: 'note-' + Date.now(),
      date: new Date().toISOString(),
      type: customNoteType,
      content: customNoteText
    });

    const updates = { notes: updatedNotes };
    
    // Automatically increment DM counter if note type is DM Sent
    if (customNoteType === 'DM sent') {
      incrementLogCount(getLocalDateString(), 'dms_sent', 1);
    } else if (customNoteType === 'Replied') {
      incrementLogCount(getLocalDateString(), 'replies_received', 1);
    } else if (customNoteType === 'Free video sent') {
      incrementLogCount(getLocalDateString(), 'free_videos_sent', 1);
    } else if (customNoteType === 'Meeting booked') {
      incrementLogCount(getLocalDateString(), 'meetings_booked', 1);
    }

    const updated = {
      ...editingLead,
      ...updates
    };

    setEditingLead(updated);
    updateLead(editingLead.id, updates);
    setCustomNoteText('');
  };

  return (
    <div className="pipelines-container">
      
      {/* Filters & Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div className="filter-bar">
          {['All', 'DM Outreach', 'Organic Inbound', 'Facebook Ads'].map(src => (
            <button 
              key={src} 
              className={`filter-chip ${selectedSource === src ? 'active' : ''}`}
              onClick={() => setSelectedSource(src)}
            >
              {src === 'Organic Inbound' ? '★ Organic Inbound' : src}
            </button>
          ))}
        </div>
        
        <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => setIsAddModalOpen(true)}>
          <Plus size={16} /> Lead
        </button>
      </div>

      {/* Kanban Board */}
      <div className="kanban-board" ref={boardRef}>
        {PIPELINE_STAGES.map(stage => {
          const stageLeads = filteredLeads.filter(l => l.stage === stage);
          const stageTotalWorth = stageLeads.reduce((acc, l) => acc + (l.deal_value || 0), 0);
          
          return (
            <div 
              key={stage} 
              className="kanban-column"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
            >
              <div className="column-header">
                <div>
                  <div className="column-title">{stage}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {formatRupee(stageTotalWorth)}
                  </div>
                </div>
                <span className="column-count">{stageLeads.length}</span>
              </div>
              
              <div className="column-cards">
                {stageLeads.map(lead => {
                  const isOverdue = lead.next_action_date && new Date(lead.next_action_date) < new Date(getLocalDateString());
                  const scoreCategory = getScoreCategory(lead.score);
                  
                  // Score ring calculations
                  const radius = 10;
                  const circumference = 2 * Math.PI * radius;
                  const strokeDashoffset = circumference - (lead.score / 100) * circumference;

                  return (
                    <div 
                      key={lead.id} 
                      className={`kanban-card ${lead.source === 'Organic Inbound' ? 'urgent-glow' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onClick={() => setEditingLead(lead)}
                    >
                      <div className="card-header">
                        <div className="card-details">
                          <span className="card-name">
                            {lead.source === 'Organic Inbound' && '★ '}{lead.name}
                          </span>
                          <span className="card-handle">{lead.instagram_handle}</span>
                        </div>
                        
                        {/* Apple-ring Style Score Ring */}
                        {lead.stage !== 'Lost' && (
                          <div className="activity-ring-container" style={{ width: '28px', height: '28px' }}>
                            <svg width="28" height="28" style={{ transform: 'rotate(-90deg)' }}>
                              <circle cx="14" cy="14" r={radius} fill="transparent" stroke="var(--border)" strokeWidth="2.5" />
                              <circle 
                                cx="14" 
                                cy="14" 
                                r={radius} 
                                fill="transparent" 
                                stroke={scoreCategory.color} 
                                strokeWidth="2.5" 
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span className="ring-score-text" style={{ fontSize: '9px', color: scoreCategory.color }}>
                              {lead.score}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="card-deal">{formatRupee(lead.deal_value)}</span>
                        {lead.niche && (
                          <span style={{ fontSize: '10px', background: 'var(--bg-darker)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)' }}>
                            {lead.niche}
                          </span>
                        )}
                      </div>

                      {lead.next_action && (
                        <div className={`next-action-chip ${isOverdue ? 'overdue' : ''}`}>
                          <span className="next-action-chip-label">
                            {isOverdue ? '⚠️ Overdue Action' : 'Next Action'}
                          </span>
                          <span style={{ fontSize: '11px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {lead.next_action}
                          </span>
                          <span style={{ fontSize: '9px', opacity: 0.8, fontFamily: 'var(--font-mono)' }}>
                            {lead.next_action_date}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 1. Replied Stage Suggested Action Prompt Modal */}
      {repliedPromptLead && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckSquare color="var(--amber)" size={18} /> Update Suggested Action
              </h3>
            </div>
            <div className="modal-body" style={{ fontSize: '14px' }}>
              <p>You moved <strong>{repliedPromptLead.name}</strong> to <strong>Replied</strong>.</p>
              <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
                Would you like to set the next action to: <br/>
                <strong style={{ color: 'var(--amber)' }}>"Send free video + ask for meeting"</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => handleConfirmRepliedPrompt(false)}>
                Keep Current
              </button>
              <button className="btn btn-primary" onClick={() => handleConfirmRepliedPrompt(true)}>
                Apply & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Lost Stage Reason Selector Modal */}
      {lostReasonLead && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Select Lost Reason</h3>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                Why did we lose the deal with <strong>{lostReasonLead.name}</strong>? (Required diagnostic)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['No reply', 'Not interested', 'Budget', 'Ghosted after video'].map(reason => (
                  <button 
                    key={reason}
                    className="btn btn-secondary"
                    style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                    onClick={() => handleConfirmLostReason(reason)}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Add Lead Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleAddLeadSubmit}>
            <div className="modal-header">
              <h3>Create New Lead</h3>
              <button type="button" className="close-btn" onClick={() => setIsAddModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Name*</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="E.g. Aarav Mehta"
                    value={newLeadForm.name} 
                    onChange={e => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                  />
                  {formErrors.name && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{formErrors.name}</span>}
                </div>
                <div className="form-group">
                  <label>Instagram Handle*</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="@aarav_reps"
                    value={newLeadForm.instagram_handle} 
                    onChange={e => setNewLeadForm({ ...newLeadForm, instagram_handle: e.target.value })}
                  />
                  {formErrors.instagram_handle && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{formErrors.instagram_handle}</span>}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Niche / Business</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Fitness Coach"
                    value={newLeadForm.niche} 
                    onChange={e => setNewLeadForm({ ...newLeadForm, niche: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>City</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Mumbai"
                    value={newLeadForm.city} 
                    onChange={e => setNewLeadForm({ ...newLeadForm, city: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Phone Number</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="E.g. +91 98765 43210"
                    value={newLeadForm.phone || ''} 
                    onChange={e => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Lead Source</label>
                  <select 
                    className="form-control"
                    value={newLeadForm.source}
                    onChange={e => {
                      const src = e.target.value;
                      const stg = src === 'DM Outreach' ? 'To DM' : 'Replied';
                      setNewLeadForm({ ...newLeadForm, source: src, stage: stg });
                    }}
                  >
                    <option value="DM Outreach">DM Outreach (Outbound)</option>
                    <option value="Organic Inbound">Organic Inbound (DM Recieved)</option>
                    <option value="Facebook Ads">Facebook Ads (Ad Inbound)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Pipeline Stage</label>
                  <select 
                    className="form-control"
                    value={newLeadForm.stage}
                    onChange={e => setNewLeadForm({ ...newLeadForm, stage: e.target.value })}
                  >
                    {PIPELINE_STAGES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Deal Value (Monthly Retainer ₹)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="25000"
                    value={newLeadForm.deal_value} 
                    onChange={e => setNewLeadForm({ ...newLeadForm, deal_value: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0', paddingTop: '14px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--amber)', display: 'block', marginBottom: '8px' }}>
                  Required outreach habit settings
                </span>
                
                <div className="form-group">
                  <label>Next Action Plan*</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="E.g. Send customized audit review"
                    value={newLeadForm.next_action} 
                    onChange={e => setNewLeadForm({ ...newLeadForm, next_action: e.target.value })}
                  />
                  {formErrors.next_action && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{formErrors.next_action}</span>}
                </div>

                <div className="form-group">
                  <label>Next Action Target Date*</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={newLeadForm.next_action_date} 
                    onChange={e => setNewLeadForm({ ...newLeadForm, next_action_date: e.target.value })}
                  />
                  {formErrors.next_action_date && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{formErrors.next_action_date}</span>}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)} disabled={processing}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={processing}>
                {processing ? 'Adding lead...' : 'Create Lead'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Edit Lead / Detailed Activity Modal */}
      {editingLead && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={18} color="var(--amber)" /> Lead Details
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Created {new Date(editingLead.created_date).toLocaleString('en-IN')}</span>
              </div>
              <button className="close-btn" onClick={() => setEditingLead(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
              
              {/* Form editing details */}
              <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Name</label>
                    <input 
                      type="text" 
                      className="form-control"
                      value={editingLead.name}
                      onChange={e => setEditingLead({ ...editingLead, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Instagram Handle</label>
                    <input 
                      type="text" 
                      className="form-control"
                      value={editingLead.instagram_handle}
                      onChange={e => setEditingLead({ ...editingLead, instagram_handle: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Niche / Business Type</label>
                    <input 
                      type="text" 
                      className="form-control"
                      value={editingLead.niche || ''}
                      onChange={e => setEditingLead({ ...editingLead, niche: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>City</label>
                    <input 
                      type="text" 
                      className="form-control"
                      value={editingLead.city || ''}
                      onChange={e => setEditingLead({ ...editingLead, city: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input 
                      type="text" 
                      className="form-control"
                      value={editingLead.phone || ''}
                      onChange={e => setEditingLead({ ...editingLead, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Lead Stage</label>
                    <select 
                      className="form-control"
                      value={editingLead.stage}
                      onChange={e => handleStageTransition(editingLead, e.target.value)}
                    >
                      {PIPELINE_STAGES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Deal Value (₹ monthly)</label>
                    <input 
                      type="number" 
                      className="form-control"
                      value={editingLead.deal_value || ''}
                      onChange={e => setEditingLead({ ...editingLead, deal_value: Number(e.target.value) })}
                    />
                  </div>
                </div>

                {editingLead.stage === 'Won' && (
                  <div style={{ border: '1px dashed var(--green)', padding: '12px', borderRadius: '6px', background: 'var(--green-glow)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ color: 'var(--green)' }}>Monthly Retainer (₹)</label>
                      <input 
                        type="number" 
                        className="form-control"
                        style={{ borderColor: 'rgba(74, 222, 128, 0.4)' }}
                        value={editingLead.monthly_retainer || ''}
                        onChange={e => setEditingLead({ ...editingLead, monthly_retainer: Number(e.target.value) })}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ color: 'var(--green)' }}>Reels target/month</label>
                      <input 
                        type="number" 
                        className="form-control"
                        style={{ borderColor: 'rgba(74, 222, 128, 0.4)' }}
                        value={editingLead.videos_per_month || ''}
                        onChange={e => setEditingLead({ ...editingLead, videos_per_month: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                )}

                <div style={{ border: '1px solid var(--border)', padding: '12px', borderRadius: '6px', backgroundColor: 'var(--bg-darker)' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--amber)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Required Outreach Settings
                  </span>
                  
                  <div className="form-group">
                    <label>Next Action*</label>
                    <input 
                      type="text" 
                      className="form-control"
                      value={editingLead.next_action || ''}
                      onChange={e => setEditingLead({ ...editingLead, next_action: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Next Action Date*</label>
                    <input 
                      type="date" 
                      className="form-control"
                      value={editingLead.next_action_date || ''}
                      onChange={e => setEditingLead({ ...editingLead, next_action_date: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                  <button type="button" className="btn btn-danger" onClick={() => handleDelete(editingLead.id)} disabled={processing}>
                    {processing ? 'Deleting...' : <><Trash2 size={14} /> Delete Lead</>}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={processing}>
                    {processing ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>

              {/* Activity Logs shelf */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={14} /> Activity History & Rep Log
                </h4>
                
                {/* Add activity note log */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <select 
                    className="form-control" 
                    style={{ flex: '0 0 130px', fontSize: '12px' }}
                    value={customNoteType}
                    onChange={e => setCustomNoteType(e.target.value)}
                  >
                    <option value="custom">📝 Note</option>
                    <option value="DM sent">📨 DM Sent</option>
                    <option value="Replied">📩 Replied</option>
                    <option value="Free video sent">🎥 Video Sent</option>
                    <option value="Meeting booked">📅 Meet Booked</option>
                    <option value="Call done">📞 Call Done</option>
                  </select>
                  
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ flex: 1, fontSize: '12px' }}
                    placeholder="Log activity details..."
                    value={customNoteText}
                    onChange={e => setCustomNoteText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                  />
                  
                  <button type="button" className="btn btn-secondary" style={{ padding: '0 12px' }} onClick={handleAddNote}>
                    Log
                  </button>
                </div>

                {/* History timeline list */}
                 <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                   {(() => {
                     let notesArray = [];
                     try {
                       if (Array.isArray(editingLead.notes)) {
                         notesArray = editingLead.notes;
                       } else if (typeof editingLead.notes === 'string') {
                         notesArray = JSON.parse(editingLead.notes);
                       }
                     } catch (e) {
                       console.error("Failed to parse notes:", e);
                     }
                     if (!notesArray || notesArray.length === 0) {
                       return <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No activities logged yet.</span>;
                     }
                     return notesArray.slice().reverse().map(note => (
                       <div key={note.id} style={{ background: 'var(--bg-darker)', border: '1px solid var(--border)', borderRadius: '4px', padding: '8px 10px', fontSize: '12px' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '10px' }}>
                           <span style={{ 
                             color: note.type === 'DM sent' ? 'var(--amber)' : 
                                    note.type === 'Replied' ? 'var(--cyan)' : 
                                    note.type === 'Free video sent' ? 'var(--green)' : 
                                    note.type === 'Meeting booked' ? 'var(--amber)' : 'var(--text-muted)',
                             fontWeight: 700, 
                             textTransform: 'uppercase' 
                           }}>
                             {note.type}
                           </span>
                           <span style={{ color: 'var(--text-muted)' }}>{new Date(note.date).toLocaleDateString('en-IN')}</span>
                         </div>
                         <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{note.content}</p>
                       </div>
                     ));
                   })()}
                 </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
