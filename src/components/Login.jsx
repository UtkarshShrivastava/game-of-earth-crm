import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Dumbbell, Mail, Lock, AlertCircle, Loader } from 'lucide-react';

export default function Login({ onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        setErrorMsg(error.message);
      } else {
        alert('Verification email sent! Check your inbox to complete registration.');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setErrorMsg(error.message);
      } else if (data?.user) {
        onAuthSuccess(data.user);
      }
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-darker)',
      padding: '20px'
    }}>
      <div className="panel" style={{
        maxWidth: '400px',
        width: '100%',
        padding: '30px 24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        border: '1px solid var(--border)',
        borderRadius: '12px'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--amber)',
            color: 'var(--bg-darker)',
            padding: '8px 12px',
            borderRadius: '6px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            fontSize: '18px',
            marginBottom: '12px'
          }}>
            GOE CRM
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            GAME OF EARTH
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginTop: '4px' }}>
            Train your business outreach habits
          </p>
        </div>

        {errorMsg && (
          <div style={{
            background: 'var(--red-glow)',
            border: '1px solid var(--red)',
            padding: '10px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--red)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '18px'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Mail size={12} color="var(--amber)" /> Email Address
            </label>
            <input
              type="email"
              className="form-control"
              placeholder="coach@gameofearth.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Lock size={12} color="var(--amber)" /> Password
            </label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{
              padding: '12px',
              fontSize: '14px',
              fontWeight: 800,
              justifyContent: 'center',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginTop: '10px'
            }}
            disabled={loading}
          >
            {loading ? (
              <Loader className="spin" size={16} />
            ) : (
              isSignUp ? 'Create Gym Profile' : 'Enter Scoreboard'
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--amber)',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
            onClick={() => setIsSignUp(!isSignUp)}
            disabled={loading}
          >
            {isSignUp ? 'Already have an account? Sign In' : 'New owner? Register profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
