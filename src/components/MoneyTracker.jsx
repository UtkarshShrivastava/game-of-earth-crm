import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  PlusCircle, 
  Trash2, 
  Calendar, 
  Check, 
  Coins, 
  ChevronRight,
  TrendingDown,
  User,
  XCircle,
  FileCheck,
  Loader
} from 'lucide-react';
import { 
  getLeads, 
  getPayments, 
  addPayment, 
  updatePayment, 
  deletePayment, 
  getCollectedThisMonth, 
  getToCollectPayments,
  formatRupee,
  getLocalDateString 
} from '../utils/storage';

export default function MoneyTracker() {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [payments, setPayments] = useState([]);
  
  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  
  // Payment Form State
  const [paymentForm, setPaymentForm] = useState({
    clientId: '',
    amount: '',
    due_date: getLocalDateString(),
    status: 'Pending',
    amount_paid: ''
  });

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [freshLeads, freshPayments] = await Promise.all([
        getLeads(),
        getPayments()
      ]);
      setLeads(freshLeads);
      setPayments(freshPayments);
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
        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Loading accounts...</span>
      </div>
    );
  }

  const clients = leads.filter(l => l.stage === 'Won');
  const collectedThisMonth = getCollectedThisMonth(payments);
  const owedTotal = getToCollectPayments(payments);

  // Group payments by client
  const clientPayments = clients.map(client => {
    const list = payments.filter(p => p.clientId === client.id);
    const paidSum = list.filter(p => p.status === 'Paid').reduce((sum, p) => sum + p.amount, 0);
    const partialSum = list.filter(p => p.status === 'Partial').reduce((sum, p) => sum + p.amount_paid, 0);
    const totalCollected = paidSum + partialSum;
    
    const pendingSum = list.filter(p => p.status === 'Pending').reduce((sum, p) => sum + p.amount, 0);
    const overdueSum = list.filter(p => p.status === 'Overdue').reduce((sum, p) => sum + (p.amount - p.amount_paid), 0);
    const totalOwed = pendingSum + overdueSum;

    return {
      ...client,
      paymentList: list,
      collected: totalCollected,
      owed: totalOwed
    };
  });

  const handleCreatePaymentSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!paymentForm.clientId) errors.clientId = 'Client is required';
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) errors.amount = 'Valid amount is required';
    if (!paymentForm.due_date) errors.due_date = 'Due date is required';
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const amt = Number(paymentForm.amount);
    const status = paymentForm.status;
    let amtPaid = Number(paymentForm.amount_paid) || 0;
    
    if (status === 'Paid') {
      amtPaid = amt;
    } else if (status === 'Pending') {
      amtPaid = 0;
    } else if (status === 'Partial') {
      if (amtPaid <= 0 || amtPaid >= amt) {
        alert('Partial payments must have an amount paid between 0 and total value.');
        return;
      }
    }

    await addPayment({
      clientId: paymentForm.clientId,
      amount: amt,
      due_date: paymentForm.due_date,
      status: status,
      amount_paid: amtPaid,
      paid_date: status === 'Paid' ? getLocalDateString() : null
    });

    // Reset Form
    setPaymentForm({
      clientId: '',
      amount: '',
      due_date: getLocalDateString(),
      status: 'Pending',
      amount_paid: ''
    });
    setFormErrors({});
    setIsAddModalOpen(false);
  };

  const handleMarkAsPaid = async (paymentId) => {
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return;

    await updatePayment(paymentId, {
      status: 'Paid',
      amount_paid: payment.amount,
      paid_date: getLocalDateString()
    });
  };

  const handleRecordPartial = async (paymentId) => {
    const amountStr = prompt('Enter partial amount collected:');
    if (!amountStr || isNaN(amountStr)) return;
    const partialAmt = Number(amountStr);
    
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return;

    if (partialAmt <= 0 || partialAmt >= payment.amount) {
      alert('Invalid partial payment amount.');
      return;
    }

    await updatePayment(paymentId, {
      status: 'Partial',
      amount_paid: partialAmt
    });
  };

  const handleDeletePayment = async (paymentId) => {
    if (confirm('Delete this payment log?')) {
      await deletePayment(paymentId);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Scoreboard stats */}
      <div className="money-summary-grid">
        <div className="stat-box">
          <div className="stat-label">
            <Coins size={14} color="var(--green)" /> ₹ Collected (This Month)
          </div>
          <div className="stat-value scoreboard-number green-text" style={{ fontSize: '32px' }}>
            {formatRupee(collectedThisMonth)}
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-label">
            <TrendingDown size={14} color="var(--amber)" /> ₹ To Collect (from clients)
          </div>
          <div className="stat-value scoreboard-number amber-text" style={{ fontSize: '32px' }}>
            {formatRupee(owedTotal)}
          </div>
        </div>
      </div>

      {/* Action panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Clients Ledger</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Money clients still have to pay you. Goal: drive this to ₹0 every month.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
          <PlusCircle size={16} /> Log Payment Schedule
        </button>
      </div>

      {/* Clients list ledger */}
      {clientPayments.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--text-muted)' }}>No active clients. Convert leads from the pipeline to see them here! ⚡</p>
        </div>
      ) : (
        <div className="money-table-wrapper">
          <table className="money-table">
            <thead>
              <tr>
                <th>Client Details</th>
                <th>Monthly Retainer</th>
                <th>Collected (All Time)</th>
                <th>To Collect</th>
                <th>Outstanding Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientPayments.map(client => (
                <tr key={client.id}>
                  <td onClick={() => setSelectedClient(client)} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: 'var(--amber)' }}>{client.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{client.instagram_handle}</span>
                    </div>
                  </td>
                  <td className="scoreboard-number">{formatRupee(client.monthly_retainer)}</td>
                  <td className="scoreboard-number" style={{ color: 'var(--green)' }}>{formatRupee(client.collected)}</td>
                  <td className="scoreboard-number" style={{ color: client.owed > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{formatRupee(client.owed)}</td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setSelectedClient(client)}>
                      View Invoices ({client.paymentList.length}) <ChevronRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 1. View Client Invoice List Modal */}
      {selectedClient && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={18} color="var(--amber)" /> Billing Ledger
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedClient.name} ({selectedClient.instagram_handle})</span>
              </div>
              <button className="close-btn" onClick={() => setSelectedClient(null)}>
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', background: 'var(--bg-darker)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Monthly Rate</span>
                  <div className="scoreboard-number" style={{ fontSize: '18px' }}>{formatRupee(selectedClient.monthly_retainer)}</div>
                </div>
                <div>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Paid</span>
                  <div className="scoreboard-number" style={{ fontSize: '18px', color: 'var(--green)' }}>{formatRupee(selectedClient.collected)}</div>
                </div>
                <div>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Outstanding</span>
                  <div className="scoreboard-number" style={{ fontSize: '18px', color: 'var(--red)' }}>{formatRupee(selectedClient.owed)}</div>
                </div>
              </div>

              <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>Payment Log Entries</h4>

              {selectedClient.paymentList.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No payments logged yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                  {selectedClient.paymentList.map(pay => (
                    <div key={pay.id} style={{ background: 'var(--bg-darker)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="scoreboard-number" style={{ fontSize: '15px' }}>{formatRupee(pay.amount)}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <Calendar size={10} />
                          <span>Due: {pay.due_date}</span>
                          {pay.paid_date && (
                            <span style={{ color: 'var(--green)' }}>· Paid: {pay.paid_date}</span>
                          )}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`status-chip ${pay.status.toLowerCase()}`}>
                          {pay.status === 'Partial' ? `Partial (${formatRupee(pay.amount_paid)})` : pay.status}
                        </span>

                        {pay.status !== 'Paid' && (
                          <>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => handleMarkAsPaid(pay.id)}
                              title="Mark Fully Paid"
                            >
                              <Check size={12} />
                            </button>
                            {pay.status !== 'Partial' && (
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                onClick={() => handleRecordPartial(pay.id)}
                                title="Record Partial Collection"
                              >
                                %
                              </button>
                            )}
                          </>
                        )}
                        
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => handleDeletePayment(pay.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedClient(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Add Invoice Payment modal */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" style={{ maxWidth: '420px' }} onSubmit={handleCreatePaymentSubmit}>
            <div className="modal-header">
              <h3>Log Payment Schedule</h3>
              <button type="button" className="close-btn" onClick={() => setIsAddModalOpen(false)}>
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Select Client*</label>
                <select 
                  className="form-control"
                  value={paymentForm.clientId}
                  onChange={e => setPaymentForm({ ...paymentForm, clientId: e.target.value })}
                >
                  <option value="">-- Choose Client --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.instagram_handle})</option>
                  ))}
                </select>
                {formErrors.clientId && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{formErrors.clientId}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Total Amount (₹)*</label>
                  <input 
                    type="number" 
                    className="form-control"
                    placeholder="E.g. 50000"
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  />
                  {formErrors.amount && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{formErrors.amount}</span>}
                </div>
                <div className="form-group">
                  <label>Due Date*</label>
                  <input 
                    type="date" 
                    className="form-control"
                    value={paymentForm.due_date}
                    onChange={e => setPaymentForm({ ...paymentForm, due_date: e.target.value })}
                  />
                  {formErrors.due_date && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{formErrors.due_date}</span>}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Collection Status</label>
                  <select 
                    className="form-control"
                    value={paymentForm.status}
                    onChange={e => setPaymentForm({ ...paymentForm, status: e.target.value })}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Partial">Partial Payment</option>
                    <option value="Paid">Fully Paid</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </div>

                {paymentForm.status === 'Partial' && (
                  <div className="form-group">
                    <label>Amount Collected So Far*</label>
                    <input 
                      type="number" 
                      className="form-control"
                      placeholder="E.g. 15000"
                      value={paymentForm.amount_paid}
                      onChange={e => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Schedule Invoicing</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
