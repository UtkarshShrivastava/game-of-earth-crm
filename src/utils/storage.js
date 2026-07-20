import { supabase } from './supabaseClient';

let currentUser = null;

// Listen to auth changes to update currentUser cache in memory
supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
});

export async function getSessionUser() {
  if (currentUser) return { data: { user: currentUser } };
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;
  return { data: { user: currentUser } };
}

export function getLocalDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

// Format currency in Indian grouping format
export function formatRupee(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
  
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  });
  
  return formatter.format(amount).replace(/^[A-Z\s]+/, '₹');
}

// Pure in-memory computations
export function calculateLeadScore(lead) {
  if (lead.stage === 'Lost') return 0;

  if (lead.priority === 'High') return 99;
  if (lead.priority === 'Medium') return 60;
  if (lead.priority === 'Low') return 20;
  
  let score = 15;
  
  if (lead.source === 'Organic Inbound') {
    score += 10;
  }
  
  switch (lead.stage) {
    case 'To DM':
      score += 0;
      break;
    case 'DM Sent':
      score += 10;
      break;
    case 'Replied':
      score += 25;
      break;
    case 'Free Video Sent':
      score += 45;
      break;
    case 'Meeting Booked':
      score += 75;
      break;
    case 'Won':
      score += 85;
      break;
    default:
      break;
  }

  let notesArray = [];
  try {
    if (Array.isArray(lead.notes)) {
      notesArray = lead.notes;
    } else if (typeof lead.notes === 'string') {
      notesArray = JSON.parse(lead.notes);
    }
  } catch (e) {
    console.error("Failed to parse notes for score:", e);
  }

  if (notesArray && notesArray.length > 0) {
    const positiveLogsCount = notesArray.filter(note => 
      note && ['Replied', 'Free video sent', 'Meeting booked', 'Call done'].includes(note.type)
    ).length;
    score += Math.min(20, positiveLogsCount * 5);
  }

  if (lead.last_touch_date) {
    const lastTouch = new Date(lead.last_touch_date);
    const today = new Date();
    const diffTime = today - lastTouch;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays >= 7) {
      const weeks = Math.floor(diffDays / 7);
      score -= weeks * 5;
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function getScoreCategory(score) {
  if (score >= 70) return { label: 'HOT', color: 'var(--red)' };
  if (score >= 40) return { label: 'WARM', color: 'var(--amber)' };
  return { label: 'COLD', color: 'var(--text-muted)' };
}

// In-memory caching layer for instant (0ms latency) optimistic updates
let cacheLeads = null;
let cachePayments = null;
let cacheDailyLogs = null;
let cacheShields = null;
let cacheUserId = null;

function checkCacheUser(user) {
  if (!user) {
    cacheLeads = null;
    cachePayments = null;
    cacheDailyLogs = null;
    cacheShields = null;
    cacheUserId = null;
    return;
  }
  if (cacheUserId !== user.id) {
    cacheLeads = null;
    cachePayments = null;
    cacheDailyLogs = null;
    cacheShields = null;
    cacheUserId = user.id;
  }
}

// Empty placeholder for back-compat
export function initializeStorage() {}

// Dynamic user metadata Streak Shields
export async function getShieldsInfo() {
  const { data: { user } } = await getSessionUser();
  if (!user) return { shields: 0, shields_awarded: 0, shielded_dates: [] };
  checkCacheUser(user);

  if (cacheShields) {
    getSessionUser().then(({ data: { user: freshUser } }) => {
      if (freshUser) {
        const meta = freshUser.user_metadata || {};
        const fresh = {
          shields: Number(meta.shields || 0),
          shields_awarded: Number(meta.shields_awarded || 0),
          shielded_dates: meta.shielded_dates || []
        };
        if (JSON.stringify(cacheShields) !== JSON.stringify(fresh)) {
          cacheShields = fresh;
          window.dispatchEvent(new Event('goe_state_change'));
        }
      }
    });
    return cacheShields;
  }

  const meta = user.user_metadata || {};
  cacheShields = {
    shields: Number(meta.shields || 0),
    shields_awarded: Number(meta.shields_awarded || 0),
    shielded_dates: meta.shielded_dates || []
  };
  return cacheShields;
}

export async function saveShieldsInfo(info) {
  const { data: { user } } = await getSessionUser();
  if (!user) return;
  checkCacheUser(user);

  cacheShields = {
    shields: info.shields,
    shields_awarded: info.shields_awarded,
    shielded_dates: info.shielded_dates
  };
  window.dispatchEvent(new Event('goe_state_change'));

  await supabase.auth.updateUser({
    data: {
      shields: info.shields,
      shields_awarded: info.shields_awarded,
      shadow_shielded_dates: info.shielded_dates, // compat
      shielded_dates: info.shielded_dates
    }
  });
}

// WIPE DB FOR THE USER
export async function clearDemoData() {
  const { data: { user } } = await getSessionUser();
  if (!user) return;
  
  cacheLeads = [];
  cachePayments = [];
  cacheDailyLogs = {};
  cacheShields = { shields: 0, shields_awarded: 0, shielded_dates: [] };
  window.dispatchEvent(new Event('goe_state_change'));

  await supabase.from('leads').delete().eq('user_id', user.id);
  await supabase.from('payments').delete().eq('user_id', user.id);
  await supabase.from('daily_logs').delete().eq('user_id', user.id);
  await saveShieldsInfo({ shields: 0, shields_awarded: 0, shielded_dates: [] });
}

// LEADS
const formatLeadNotes = (lead) => {
  if (!lead.notes) return [];
  try {
    if (Array.isArray(lead.notes)) {
      return lead.notes;
    } else if (typeof lead.notes === 'string') {
      const parsed = JSON.parse(lead.notes);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error("Error parsing notes for lead:", lead.id, e);
  }
  return [];
};

export async function getLeads() {
  const { data: { user } } = await getSessionUser();
  if (!user) return [];
  checkCacheUser(user);

  if (cacheLeads) {
    supabase.from('leads')
      .select('*')
      .order('created_date', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          const fresh = data.map(l => {
            const parsedNotes = formatLeadNotes(l);
            return {
              ...l,
              notes: parsedNotes,
              score: calculateLeadScore({ ...l, notes: parsedNotes })
            };
          });
          if (JSON.stringify(cacheLeads) !== JSON.stringify(fresh)) {
            cacheLeads = fresh;
            window.dispatchEvent(new Event('goe_state_change'));
          }
        }
      });
    return cacheLeads;
  }

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_date', { ascending: true });

  if (error) {
    console.error('getLeads error:', error);
    return [];
  }

  cacheLeads = data.map(l => {
    const parsedNotes = formatLeadNotes(l);
    return {
      ...l,
      notes: parsedNotes,
      score: calculateLeadScore({ ...l, notes: parsedNotes })
    };
  });
  return cacheLeads;
}

export async function saveLeads(leads) {
  // Empty stub for backwards compatibility
}

export async function addLead(lead) {
  const { data: { user } } = await getSessionUser();
  if (!user) throw new Error('Not authenticated');
  checkCacheUser(user);

  const tempId = 'temp-' + Date.now();
  const tempLead = {
    id: tempId,
    user_id: user.id,
    name: lead.name,
    instagram_handle: lead.instagram_handle,
    avatar: lead.avatar || '',
    niche: lead.niche || '',
    city: lead.city || '',
    phone: lead.phone || '',
    priority: lead.priority || null,
    source: lead.source || 'DM Outreach',
    stage: lead.stage || 'To DM',
    deal_value: Number(lead.deal_value) || 0,
    next_action: lead.next_action,
    next_action_date: lead.next_action_date,
    last_touch_date: new Date().toISOString(),
    created_date: new Date().toISOString(),
    notes: lead.notes || [{
      id: 'note-' + Date.now(),
      date: new Date().toISOString(),
      type: 'custom',
      content: 'Lead created.'
    }],
    monthly_retainer: Number(lead.monthly_retainer) || null,
    start_date: lead.start_date || null,
    videos_per_month: lead.videos_per_month ? Number(lead.videos_per_month) : null,
    lost_reason: lead.lost_reason || null,
    score: 0
  };
  tempLead.score = calculateLeadScore(tempLead);

  if (cacheLeads) {
    cacheLeads = [...cacheLeads, tempLead];
    window.dispatchEvent(new Event('goe_state_change'));
  }

  const insertPayload = {
    user_id: user.id,
    name: tempLead.name,
    instagram_handle: tempLead.instagram_handle,
    avatar: tempLead.avatar,
    niche: tempLead.niche,
    city: tempLead.city,
    source: tempLead.source,
    stage: tempLead.stage,
    deal_value: tempLead.deal_value,
    next_action: tempLead.next_action,
    next_action_date: tempLead.next_action_date,
    last_touch_date: tempLead.last_touch_date,
    created_date: tempLead.created_date,
    notes: tempLead.notes,
    monthly_retainer: tempLead.monthly_retainer,
    start_date: tempLead.start_date,
    videos_per_month: tempLead.videos_per_month,
    lost_reason: tempLead.lost_reason
  };

  if (tempLead.phone) {
    insertPayload.phone = tempLead.phone;
  }
  
  if (tempLead.priority) {
    insertPayload.priority = tempLead.priority;
  }

  let result = await supabase
    .from('leads')
    .insert(insertPayload)
    .select()
    .single();

  let data = result.data;
  let error = result.error;

  if (error && error.message && (error.message.includes("column") || error.code === "PGRST204")) {
    console.warn("Table is missing custom columns. Retrying insert without custom fields...");
    delete insertPayload.phone;
    delete insertPayload.priority;

    const retryResult = await supabase
      .from('leads')
      .insert(insertPayload)
      .select()
      .single();

    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) {
    if (cacheLeads) {
      cacheLeads = cacheLeads.filter(l => l.id !== tempId);
      window.dispatchEvent(new Event('goe_state_change'));
    }
    console.error('addLead error:', error);
    throw error;
  }

  if (cacheLeads) {
    const formatted = { ...data, notes: formatLeadNotes(data) };
    cacheLeads = cacheLeads.map(l => l.id === tempId ? { ...formatted, score: calculateLeadScore(formatted) } : l);
    window.dispatchEvent(new Event('goe_state_change'));
  }
  return data;
}

export async function updateLead(leadId, updates) {
  const { data: { user } } = await getSessionUser();
  if (!user) throw new Error('Not authenticated');
  checkCacheUser(user);

  let original = null;
  if (cacheLeads) {
    original = cacheLeads.find(l => l.id === leadId);
    if (original) {
      const stageChanged = updates.stage && updates.stage !== original.stage;
      const noteAdded = updates.notes && updates.notes.length > (original.notes?.length || 0);

      const optimisticLead = {
        ...original,
        ...updates,
        last_touch_date: (stageChanged || noteAdded) ? new Date().toISOString() : original.last_touch_date
      };

      if (optimisticLead.stage === 'Won' && original.stage !== 'Won') {
        optimisticLead.monthly_retainer = optimisticLead.monthly_retainer || optimisticLead.deal_value || original.deal_value || 0;
        optimisticLead.start_date = optimisticLead.start_date || getLocalDateString();
        optimisticLead.videos_per_month = optimisticLead.videos_per_month || 8;
      }
      optimisticLead.score = calculateLeadScore(optimisticLead);

      cacheLeads = cacheLeads.map(l => l.id === leadId ? optimisticLead : l);
      window.dispatchEvent(new Event('goe_state_change'));
    }
  }

  const dbColumns = [
    'user_id',
    'name',
    'instagram_handle',
    'avatar',
    'niche',
    'city',
    'phone',
    'priority',
    'source',
    'stage',
    'deal_value',
    'next_action',
    'next_action_date',
    'last_touch_date',
    'created_date',
    'notes',
    'monthly_retainer',
    'start_date',
    'videos_per_month',
    'lost_reason'
  ];

  const filteredUpdates = {};
  for (const col of dbColumns) {
    if (col in updates) {
      if (col === 'phone' && !updates[col]) {
        continue;
      }
      if (col === 'priority' && !updates[col]) {
        continue;
      }
      filteredUpdates[col] = updates[col];
    }
  }

  const { data: serverOriginal } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (!serverOriginal) return null;

  const stageChanged = updates.stage && updates.stage !== serverOriginal.stage;
  const noteAdded = updates.notes && updates.notes.length > (serverOriginal.notes?.length || 0);

  const fieldsToUpdate = {
    ...filteredUpdates,
    last_touch_date: (stageChanged || noteAdded) ? new Date().toISOString() : (updates.last_touch_date || serverOriginal.last_touch_date)
  };

  if (fieldsToUpdate.stage === 'Won' && serverOriginal.stage !== 'Won') {
    fieldsToUpdate.monthly_retainer = fieldsToUpdate.monthly_retainer || fieldsToUpdate.deal_value || serverOriginal.deal_value || 0;
    fieldsToUpdate.start_date = fieldsToUpdate.start_date || getLocalDateString();
    fieldsToUpdate.videos_per_month = fieldsToUpdate.videos_per_month || 8;
  }

  let result = await supabase
    .from('leads')
    .update(fieldsToUpdate)
    .eq('id', leadId)
    .select()
    .single();

  let data = result.data;
  let error = result.error;

  if (error && error.message && (error.message.includes("column") || error.code === "PGRST204")) {
    console.warn("Table is missing custom columns. Retrying update without custom fields...");
    delete fieldsToUpdate.phone;
    delete fieldsToUpdate.priority;

    const retryResult = await supabase
      .from('leads')
      .update(fieldsToUpdate)
      .eq('id', leadId)
      .select()
      .single();

    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) {
    console.error('updateLead database error:', error);
    throw error;
  }

  if (cacheLeads) {
    const formatted = { ...data, notes: formatLeadNotes(data) };
    cacheLeads = cacheLeads.map(l => l.id === leadId ? { ...formatted, score: calculateLeadScore(formatted) } : l);
    window.dispatchEvent(new Event('goe_state_change'));
  }
  return data;
}

export async function deleteLead(leadId) {
  const { data: { user } } = await getSessionUser();
  if (!user) throw new Error('Not authenticated');
  checkCacheUser(user);

  if (cacheLeads) {
    cacheLeads = cacheLeads.filter(l => l.id !== leadId);
    window.dispatchEvent(new Event('goe_state_change'));
  }

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', leadId);

  if (error) {
    console.error('deleteLead error:', error);
    throw error;
  }
}

// PAYMENTS
export async function getPayments() {
  const { data: { user } } = await getSessionUser();
  if (!user) return [];
  checkCacheUser(user);

  if (cachePayments) {
    supabase.from('payments')
      .select('*')
      .then(({ data, error }) => {
        if (!error && data) {
          const mapped = data.map(p => ({ ...p, clientId: p.client_id }));
          if (JSON.stringify(cachePayments) !== JSON.stringify(mapped)) {
            cachePayments = mapped;
            window.dispatchEvent(new Event('goe_state_change'));
          }
        }
      });
    return cachePayments;
  }

  const { data, error } = await supabase
    .from('payments')
    .select('*');

  if (error) {
    console.error('getPayments error:', error);
    return [];
  }

  cachePayments = data.map(p => ({
    ...p,
    clientId: p.client_id
  }));
  return cachePayments;
}

export async function savePayments(payments) {
  // stub
}

export async function addPayment(payment) {
  const { data: { user } } = await getSessionUser();
  if (!user) throw new Error('Not authenticated');
  checkCacheUser(user);

  const tempId = 'temp-' + Date.now();
  const optimisticPayment = {
    id: tempId,
    user_id: user.id,
    clientId: payment.clientId || payment.client_id,
    client_id: payment.clientId || payment.client_id,
    amount: Number(payment.amount) || 0,
    amount_paid: Number(payment.amount_paid) || 0,
    due_date: payment.due_date,
    paid_date: payment.paid_date || null,
    status: payment.status || 'Pending'
  };

  if (cachePayments) {
    cachePayments = [...cachePayments, optimisticPayment];
    window.dispatchEvent(new Event('goe_state_change'));
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      user_id: user.id,
      client_id: optimisticPayment.client_id,
      amount: optimisticPayment.amount,
      amount_paid: optimisticPayment.amount_paid,
      due_date: optimisticPayment.due_date,
      paid_date: optimisticPayment.paid_date,
      status: optimisticPayment.status
    })
    .select()
    .single();

  if (error) {
    if (cachePayments) {
      cachePayments = cachePayments.filter(p => p.id !== tempId);
      window.dispatchEvent(new Event('goe_state_change'));
    }
    console.error('addPayment error:', error);
    throw error;
  }

  const result = { ...data, clientId: data.client_id };
  if (cachePayments) {
    cachePayments = cachePayments.map(p => p.id === tempId ? result : p);
    window.dispatchEvent(new Event('goe_state_change'));
  }
  return result;
}

export async function updatePayment(paymentId, updates) {
  const { data: { user } } = await getSessionUser();
  if (!user) throw new Error('Not authenticated');
  checkCacheUser(user);

  if (cachePayments) {
    cachePayments = cachePayments.map(p => p.id === paymentId ? { ...p, ...updates } : p);
    window.dispatchEvent(new Event('goe_state_change'));
  }

  const payload = { ...updates };
  if (payload.clientId) {
    payload.client_id = payload.clientId;
    delete payload.clientId;
  }

  const { data, error } = await supabase
    .from('payments')
    .update(payload)
    .eq('id', paymentId)
    .select()
    .single();

  if (error) {
    console.error('updatePayment error:', error);
    throw error;
  }

  const result = { ...data, clientId: data.client_id };
  if (cachePayments) {
    cachePayments = cachePayments.map(p => p.id === paymentId ? result : p);
    window.dispatchEvent(new Event('goe_state_change'));
  }
  return result;
}

export async function deletePayment(paymentId) {
  const { data: { user } } = await getSessionUser();
  if (!user) throw new Error('Not authenticated');
  checkCacheUser(user);

  if (cachePayments) {
    cachePayments = cachePayments.filter(p => p.id !== paymentId);
    window.dispatchEvent(new Event('goe_state_change'));
  }

  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', paymentId);

  if (error) {
    console.error('deletePayment error:', error);
    throw error;
  }
}

// DAILY ACTIVITY LOGS
export async function getDailyLogs() {
  const { data: { user } } = await getSessionUser();
  if (!user) return {};
  checkCacheUser(user);

  if (cacheDailyLogs) {
    supabase.from('daily_logs')
      .select('*')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (!error && data) {
          const fresh = {};
          data.forEach(log => {
            fresh[log.log_date] = {
              dms_sent: log.dms_sent,
              replies_received: log.replies_received,
              free_videos_sent: log.free_videos_sent,
              meetings_booked: log.meetings_booked,
              videos_delivered: log.videos_delivered,
              content_posted: log.content_posted
            };
          });
          if (JSON.stringify(cacheDailyLogs) !== JSON.stringify(fresh)) {
            cacheDailyLogs = fresh;
            window.dispatchEvent(new Event('goe_state_change'));
          }
        }
      });
    return cacheDailyLogs;
  }

  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', user.id);

  if (error) {
    console.error('getDailyLogs error:', error);
    return {};
  }

  const dict = {};
  data.forEach(log => {
    dict[log.log_date] = {
      dms_sent: log.dms_sent,
      replies_received: log.replies_received,
      free_videos_sent: log.free_videos_sent,
      meetings_booked: log.meetings_booked,
      videos_delivered: log.videos_delivered,
      content_posted: log.content_posted
    };
  });
  cacheDailyLogs = dict;
  return cacheDailyLogs;
}

export async function saveDailyLogs(logs) {
  const { data: { user } } = await getSessionUser();
  if (!user) return;
  checkCacheUser(user);

  cacheDailyLogs = { ...logs };
  window.dispatchEvent(new Event('goe_state_change'));

  const rows = Object.entries(logs).map(([dateStr, log]) => ({
    user_id: user.id,
    log_date: dateStr,
    dms_sent: log.dms_sent || 0,
    replies_received: log.replies_received || 0,
    free_videos_sent: log.free_videos_sent || 0,
    meetings_booked: log.meetings_booked || 0,
    videos_delivered: log.videos_delivered || 0,
    content_posted: !!log.content_posted
  }));

  const { error } = await supabase
    .from('daily_logs')
    .upsert(rows, { onConflict: 'user_id,log_date' });

  if (error) {
    console.error('saveDailyLogs error:', error);
    throw error;
  }

  await updateStreakShieldsEarned();
}

export async function incrementLogCount(dateStr, key, amount = 1) {
  const { data: { user } } = await getSessionUser();
  if (!user) throw new Error('Not authenticated');
  checkCacheUser(user);

  if (!cacheDailyLogs) cacheDailyLogs = {};
  const current = cacheDailyLogs[dateStr] || {
    dms_sent: 0,
    replies_received: 0,
    free_videos_sent: 0,
    meetings_booked: 0,
    videos_delivered: 0,
    content_posted: false
  };

  let updatedVal;
  if (key === 'content_posted') {
    updatedVal = !current.content_posted;
  } else {
    updatedVal = Math.max(0, (current[key] || 0) + amount);
  }

  cacheDailyLogs[dateStr] = {
    ...current,
    [key]: updatedVal
  };
  window.dispatchEvent(new Event('goe_state_change'));

  const { data: serverLogs } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('log_date', dateStr)
    .maybeSingle();

  const serverCurrent = serverLogs || {
    dms_sent: 0,
    replies_received: 0,
    free_videos_sent: 0,
    meetings_booked: 0,
    videos_delivered: 0,
    content_posted: false
  };

  let serverUpdatedVal;
  if (key === 'content_posted') {
    serverUpdatedVal = !serverCurrent.content_posted;
  } else {
    serverUpdatedVal = Math.max(0, (serverCurrent[key] || 0) + amount);
  }

  const payload = {
    user_id: user.id,
    log_date: dateStr,
    dms_sent: serverCurrent.dms_sent,
    replies_received: serverCurrent.replies_received,
    free_videos_sent: serverCurrent.free_videos_sent,
    meetings_booked: serverCurrent.meetings_booked,
    videos_delivered: serverCurrent.videos_delivered,
    content_posted: serverCurrent.content_posted
  };
  payload[key] = serverUpdatedVal;

  const { error } = await supabase
    .from('daily_logs')
    .upsert(payload, { onConflict: 'user_id,log_date' });

  if (error) {
    console.error('incrementLogCount upsert error:', error);
    throw error;
  }

  await updateStreakShieldsEarned();
  
  // Re-fetch final to align with database updates
  const { data: finalData } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('log_date', dateStr)
    .maybeSingle();

  if (finalData) {
    cacheDailyLogs[dateStr] = {
      dms_sent: finalData.dms_sent || 0,
      replies_received: finalData.replies_received || 0,
      free_videos_sent: finalData.free_videos_sent || 0,
      meetings_booked: finalData.meetings_booked || 0,
      videos_delivered: finalData.videos_delivered || 0,
      content_posted: finalData.content_posted || false
    };
    window.dispatchEvent(new Event('goe_state_change'));
  }
  
  return payload;
}

// Streak Shield forgiver logic
export async function checkAndApplyStreakShield() {
  const logs = await getDailyLogs();
  const info = await getShieldsInfo();
  if (info.shields <= 0) return null;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  const yesterdayLog = logs[yesterdayStr];
  const yesterdaySuccess = yesterdayLog && (yesterdayLog.dms_sent >= 5) && yesterdayLog.content_posted;

  if (yesterdaySuccess || info.shielded_dates.includes(yesterdayStr)) {
    return null; 
  }

  info.shields = Math.max(0, info.shields - 1);
  info.shielded_dates = [...info.shielded_dates, yesterdayStr];
  await saveShieldsInfo(info);
  
  return yesterdayStr; 
}

// Streak Shield earner check
export async function updateStreakShieldsEarned() {
  const logs = await getDailyLogs();
  const dates = Object.keys(logs).sort((a, b) => new Date(a) - new Date(b));
  
  const info = await getShieldsInfo();
  if (info.shields >= 2) return;

  let fullDayStreak = 0;
  let shieldsEarnedFromHistory = 0;

  for (const dateStr of dates) {
    const log = logs[dateStr];
    const isFull = log && log.dms_sent >= 20 && log.content_posted;
    if (isFull) {
      fullDayStreak++;
      if (fullDayStreak === 7) {
        shieldsEarnedFromHistory++;
        fullDayStreak = 0; 
      }
    } else {
      fullDayStreak = 0;
    }
  }

  if (shieldsEarnedFromHistory > info.shields_awarded) {
    const added = shieldsEarnedFromHistory - info.shields_awarded;
    info.shields = Math.min(2, info.shields + added);
    info.shields_awarded = shieldsEarnedFromHistory;
    await saveShieldsInfo(info);
  }
}

// Pure metrics math operations
export function calculateStreak(dailyLogs, shieldedDates = []) {
  const todayStr = getLocalDateString(new Date());
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  const isSuccess = (dateStr) => {
    if (shieldedDates.includes(dateStr)) return true;
    const log = dailyLogs[dateStr];
    return log && (log.dms_sent >= 5) && log.content_posted;
  };
  
  let streakCount = 0;
  let checkDate = new Date();
  
  if (isSuccess(todayStr)) {
    // Start from today
  } else if (isSuccess(yesterdayStr)) {
    // Start from yesterday
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
}

export function get7DayAverageDMs(dailyLogs) {
  let totalDMs = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);
    const log = dailyLogs[dateStr];
    totalDMs += log ? log.dms_sent : 0;
  }
  return Number((totalDMs / 7).toFixed(1));
}

export function getFunnelSnapshot(leads, dailyLogs) {
  let dms = 0;
  let replies = 0;
  let videos = 0;
  let meetings = 0;
  
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);
    const log = dailyLogs[dateStr];
    if (log) {
      dms += log.dms_sent || 0;
      replies += log.replies_received || 0;
      videos += log.free_videos_sent || 0;
      meetings += log.meetings_booked || 0;
    }
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const clientsWon = leads.filter(lead => {
    if (lead.stage !== 'Won') return false;
    const start = lead.start_date ? new Date(lead.start_date) : null;
    return start && start >= sevenDaysAgo;
  }).length;

  return { dms, replies, videos, meetings, clientsWon };
}

export function getDirectionSplit(leads) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const outbound = leads.filter(l => new Date(l.created_date) >= sevenDaysAgo && l.source === 'DM Outreach').length;
  const inbound = leads.filter(l => new Date(l.created_date) >= sevenDaysAgo && l.source === 'Organic Inbound').length;
  const ads = leads.filter(l => new Date(l.created_date) >= sevenDaysAgo && l.source === 'Facebook Ads').length;

  return { outbound, inbound, ads };
}

export function getPersonalRecords(leads, payments, dailyLogs, shieldedDates = []) {
  const badges = [];
  const logValues = Object.values(dailyLogs);
  const logDates = Object.keys(dailyLogs).sort((a, b) => new Date(a) - new Date(b));

  const closedFromDMs = leads.some(l => l.stage === 'Won' && l.source === 'DM Outreach');
  badges.push({
    id: 'pr-first-dm-client',
    title: 'First DM Client',
    description: 'Signed a client sourced from direct cold DM outreach.',
    unlocked: closedFromDMs,
    hidden: false
  });

  const currentStreak = calculateStreak(dailyLogs, shieldedDates);
  badges.push({
    id: 'pr-streak-champ',
    title: 'Streak Champ (10d)',
    description: 'Achieve 10 consecutive days hitting DM minimums & posting.',
    unlocked: currentStreak >= 10,
    hidden: false
  });

  const collected = getCollectedThisMonth(payments);
  badges.push({
    id: 'pr-best-collection',
    title: 'Revenue Milestone',
    description: 'Collect ₹50,000+ in payments within a calendar month.',
    unlocked: collected >= 50000,
    hidden: false
  });

  const fastConversion = leads.some(l => {
    if (l.stage !== 'Won') return false;
    const diff = (new Date(l.last_touch_date) - new Date(l.created_date)) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  });
  badges.push({
    id: 'pr-speed-demon',
    title: 'Speed Demon',
    description: 'Move a lead from new discovery to Client (Won) in under 7 days.',
    unlocked: fastConversion,
    hidden: false
  });

  const sent25 = logValues.some(log => log.dms_sent >= 25);
  badges.push({
    id: 'pr-super-outreacher',
    title: 'Iron Reps (25+ DMs)',
    description: 'Log 25 or more DMs in a single calendar day.',
    unlocked: sent25,
    hidden: false
  });

  const firstReply = leads.some(l => l.notes && l.notes.some(n => n.type === 'Replied'));
  badges.push({
    id: 'pr-first-reply',
    title: 'First Reply',
    description: 'Log your first DM reply from a lead.',
    unlocked: firstReply,
    hidden: false
  });

  const totalDMs = logValues.reduce((sum, log) => sum + (log.dms_sent || 0), 0);
  badges.push({
    id: 'pr-century-club',
    title: 'Century Club',
    description: 'Log 100 total DMs in your outreach history.',
    unlocked: totalDMs >= 100,
    hidden: false
  });

  badges.push({
    id: 'pr-iron-marathon',
    title: 'Iron Marathon',
    description: 'Log 500 total DMs in your outreach history.',
    unlocked: totalDMs >= 500,
    hidden: false
  });

  badges.push({
    id: 'pr-week-one',
    title: 'Week One',
    description: 'Maintain a 7-day habit streak.',
    unlocked: currentStreak >= 7,
    hidden: false
  });

  badges.push({
    id: 'pr-habit-locked',
    title: 'Habit Locked',
    description: 'Maintain a 30-day habit streak.',
    unlocked: currentStreak >= 30,
    hidden: false
  });

  const paymentsByMonth = {};
  payments.forEach(p => {
    if (p.paid_date) {
      const date = new Date(p.paid_date);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      paymentsByMonth[key] = (paymentsByMonth[key] || 0) + (p.amount_paid || p.amount);
    }
  });
  const hasLakhpati = Object.values(paymentsByMonth).some(v => v >= 100000);
  badges.push({
    id: 'pr-lakhpati-month',
    title: 'Lakhpati Month',
    description: 'Collect ₹1,00,000+ in payments within a single month.',
    unlocked: hasLakhpati,
    hidden: false
  });

  const inboundLeads = leads.filter(l => l.source === 'Organic Inbound' && l.created_date);
  inboundLeads.sort((a,b) => new Date(a.created_date) - new Date(b.created_date));
  let hasMagnet = false;
  for (let i = 0; i < inboundLeads.length; i++) {
    const start = new Date(inboundLeads[i].created_date);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const count = inboundLeads.filter(l => {
      const d = new Date(l.created_date);
      return d >= start && d <= end;
    }).length;
    if (count >= 5) {
      hasMagnet = true;
      break;
    }
  }
  badges.push({
    id: 'pr-inbound-magnet',
    title: 'Inbound Magnet',
    description: 'Receive 5 organic inbound leads in a single week.',
    unlocked: hasMagnet,
    hidden: false
  });

  const activeClients = leads.filter(l => l.stage === 'Won');
  const toCollect = getToCollectPayments(payments);
  const hasZeroBalance = activeClients.length >= 1 && toCollect === 0;
  badges.push({
    id: 'pr-zero-balance',
    title: 'Zero Balance',
    description: 'Drive client "To Collect" balance to ₹0 with active accounts.',
    unlocked: hasZeroBalance,
    hidden: false
  });

  const videosByMonth = {};
  Object.entries(dailyLogs).forEach(([dateStr, log]) => {
    const date = new Date(dateStr);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    videosByMonth[key] = (videosByMonth[key] || 0) + (log.videos_delivered || 0);
  });
  const hasDeliveryMachine = Object.values(videosByMonth).some(v => v >= 15);
  badges.push({
    id: 'pr-delivery-machine',
    title: 'Delivery Machine',
    description: 'Deliver 15 client videos in a single month.',
    unlocked: hasDeliveryMachine,
    hidden: false
  });

  let postedStreak = 0;
  let hasFullWeekContent = false;
  for (const dateStr of logDates) {
    if (dailyLogs[dateStr]?.content_posted) {
      postedStreak++;
      if (postedStreak >= 7) {
        hasFullWeekContent = true;
        break;
      }
    } else {
      postedStreak = 0;
    }
  }
  badges.push({
    id: 'pr-full-week-content',
    title: 'Full Week Content',
    description: 'Post raw videos on 7 consecutive days.',
    unlocked: hasFullWeekContent,
    hidden: false
  });

  // --- HIDDEN BADGES ---
  let consecutiveFailures = 0;
  let hasComeback = false;
  for (const dateStr of logDates) {
    const log = dailyLogs[dateStr];
    const isSuccess = log && log.dms_sent >= 5 && log.content_posted;
    if (isSuccess) {
      if (consecutiveFailures >= 7) {
        hasComeback = true;
        break;
      }
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
    }
  }
  badges.push({
    id: 'pr-comeback-kid',
    title: 'Comeback Kid',
    description: 'Water your planet and complete a full day after a 7+ day break.',
    unlocked: hasComeback,
    hidden: true
  });

  const hasNightOwl = leads.some(l => l.notes && l.notes.some(n => {
    if (n.type !== 'DM sent') return false;
    const hour = new Date(n.date).getHours();
    return hour >= 23 || hour <= 4;
  }));
  badges.push({
    id: 'pr-night-owl',
    title: 'Night Owl',
    description: 'Log an outreach DM late night (after 11 PM or before 4 AM).',
    unlocked: hasNightOwl,
    hidden: true
  });

  const hasEarlyBird = leads.some(l => l.notes && l.notes.some(n => {
    const dt = new Date(n.date);
    if (n.type === 'DM sent' && dt.getHours() < 9) {
      const dateStr = getLocalDateString(dt);
      return dailyLogs[dateStr] && dailyLogs[dateStr].dms_sent >= 5;
    }
    return false;
  }));
  badges.push({
    id: 'pr-early-bird',
    title: 'Early Bird',
    description: 'Complete your 5-DM outreach minimum early (before 9 AM).',
    unlocked: hasEarlyBird,
    hidden: true
  });

  const hasDoubleDay = logValues.some(log => log.dms_sent >= 40);
  badges.push({
    id: 'pr-double-day',
    title: 'Double Day',
    description: 'Perform double reps: log 40+ DMs in one single day.',
    unlocked: hasDoubleDay,
    hidden: true
  });

  let hasHatTrick = false;
  const meetDates = [];
  Object.entries(dailyLogs).forEach(([dateStr, log]) => {
    if (log.meetings_booked > 0) {
      for (let j = 0; j < log.meetings_booked; j++) {
        meetDates.push(new Date(dateStr));
      }
    }
  });
  meetDates.sort((a,b) => a - b);
  for (let i = 0; i < meetDates.length; i++) {
    const start = meetDates[i];
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const count = meetDates.filter(d => d >= start && d <= end).length;
    if (count >= 3) {
      hasHatTrick = true;
      break;
    }
  }
  badges.push({
    id: 'pr-hat-trick',
    title: 'Hat-trick',
    description: 'Book 3 outreach strategy meetings within a 7-day window.',
    unlocked: hasHatTrick,
    hidden: true
  });

  const wonMonths = {};
  leads.forEach(l => {
    if (l.stage === 'Won' && l.start_date) {
      const date = new Date(l.start_date);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      wonMonths[key] = (wonMonths[key] || 0) + 1;
    }
  });
  const hasRainmaker = Object.values(wonMonths).some(c => c >= 2);
  badges.push({
    id: 'pr-rainmaker',
    title: 'Rainmaker',
    description: 'Convert and win 2 new Clients in the same calendar month.',
    unlocked: hasRainmaker,
    hidden: true
  });

  const hasPlanetReviver = currentStreak >= 7;
  badges.push({
    id: 'pr-planet-reviver',
    title: 'Planet Reviver',
    description: 'Bring your broken planet back to life: reach a 7-day streak.',
    unlocked: hasPlanetReviver,
    hidden: true
  });

  return badges;
}

export function getCollectedThisMonth(payments) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  return payments
    .filter(p => {
      if (!p.paid_date) return false;
      const paidDate = new Date(p.paid_date);
      return paidDate.getFullYear() === currentYear && paidDate.getMonth() === currentMonth;
    })
    .reduce((sum, p) => sum + (p.amount_paid || p.amount), 0);
}

export function getToCollectPayments(payments) {
  return payments
    .filter(p => p.status === 'Pending' || p.status === 'Overdue' || p.status === 'Partial')
    .reduce((sum, p) => sum + (p.amount - (p.amount_paid || 0)), 0);
}

// BACKUP & EXPORTS
export async function exportDatabase() {
  const leads = await getLeads();
  // Map internal clientIds back to clientId expectation for JSON download
  const paymentsRaw = await getPayments();
  const payments = paymentsRaw.map(p => ({
    ...p,
    clientId: p.client_id
  }));
  const logs = await getDailyLogs();
  const shieldsInfo = await getShieldsInfo();
  
  const db = {
    leads,
    payments,
    logs,
    shields: shieldsInfo.shields,
    shields_awarded: shieldsInfo.shields_awarded,
    shielded_dates: shieldsInfo.shielded_dates
  };
  return JSON.stringify(db, null, 2);
}

export async function importDatabase(jsonString) {
  try {
    const db = JSON.parse(jsonString);
    const { data: { user } } = await getSessionUser();
    if (!user) return false;
    
    // 1. Clear existing database for this user
    await supabase.from('leads').delete().eq('user_id', user.id);
    await supabase.from('payments').delete().eq('user_id', user.id);
    await supabase.from('daily_logs').delete().eq('user_id', user.id);

    // 2. Leads mapping
    if (db.leads && Array.isArray(db.leads)) {
      const leadsToInsert = db.leads.map(l => ({
        user_id: user.id,
        name: l.name || 'Imported Lead',
        instagram_handle: l.instagram_handle || '@handle',
        avatar: l.avatar || '',
        niche: l.niche || '',
        city: l.city || '',
        source: l.source || 'DM Outreach',
        stage: l.stage || 'To DM',
        deal_value: Number(l.deal_value) || 0,
        next_action: l.next_action || 'First contact',
        next_action_date: l.next_action_date || getLocalDateString(),
        last_touch_date: l.last_touch_date || new Date().toISOString(),
        created_date: l.created_date || new Date().toISOString(),
        monthly_retainer: l.monthly_retainer ? Number(l.monthly_retainer) : null,
        start_date: l.start_date || null,
        videos_per_month: l.videos_per_month ? Number(l.videos_per_month) : null,
        lost_reason: l.lost_reason || null,
        notes: l.notes || []
      }));
      
      if (leadsToInsert.length > 0) {
        const { error } = await supabase.from('leads').insert(leadsToInsert);
        if (error) throw error;
      }
    }
    
    // Re-fetch database generated UUID keys for linking payments correctly
    const { data: freshLeads, error: lErr } = await supabase
      .from('leads')
      .select('id, instagram_handle')
      .eq('user_id', user.id);
    if (lErr) throw lErr;
    
    // 3. Payments mapping
    if (db.payments && Array.isArray(db.payments)) {
      const paymentsToInsert = db.payments.map(p => {
        const originalLead = db.leads?.find(l => l.id === p.clientId || l.id === p.client_id);
        const matchedLead = originalLead ? freshLeads.find(fl => fl.instagram_handle === originalLead.instagram_handle) : null;
        
        return {
          user_id: user.id,
          client_id: matchedLead ? matchedLead.id : null,
          amount: Number(p.amount) || 0,
          amount_paid: Number(p.amount_paid) || 0,
          due_date: p.due_date || getLocalDateString(),
          paid_date: p.paid_date || null,
          status: p.status || 'Pending'
        };
      }).filter(p => p.client_id !== null);
      
      if (paymentsToInsert.length > 0) {
        const { error } = await supabase.from('payments').insert(paymentsToInsert);
        if (error) throw error;
      }
    }
    
    // 4. Daily Logs mapping
    if (db.logs && typeof db.logs === 'object') {
      const rows = Object.entries(db.logs).map(([dateStr, log]) => ({
        user_id: user.id,
        log_date: dateStr,
        dms_sent: log.dms_sent || 0,
        replies_received: log.replies_received || 0,
        free_videos_sent: log.free_videos_sent || 0,
        meetings_booked: log.meetings_booked || 0,
        videos_delivered: log.videos_delivered || 0,
        content_posted: !!log.content_posted
      }));
      
      if (rows.length > 0) {
        const { error } = await supabase.from('daily_logs').insert(rows);
        if (error) throw error;
      }
    }
    
    // 5. Shields mapping
    await saveShieldsInfo({
      shields: db.shields !== undefined ? Number(db.shields) : 0,
      shields_awarded: db.shields_awarded !== undefined ? Number(db.shields_awarded) : 0,
      shielded_dates: db.shielded_dates || []
    });
    
    window.dispatchEvent(new Event('goe_state_change'));
    return true;
  } catch (e) {
    console.error('Import failed', e);
    return false;
  }
}
