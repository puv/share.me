import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const result = await login(username, password);
            navigate(result.user.isAdmin ? '/admin' : '/');
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="page-center">
            <div className="card center-card">
                <LogIn size={40} color="var(--orange)" style={{ marginBottom: '12px' }} />
                <h1>Login</h1>
                <p style={{ marginBottom: '20px' }}>Sign in to unlock 1 GB uploads</p>
                {error && <div className="alert alert-error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className="form-input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Username"
                        autoFocus
                        required
                    />
                    <input
                        type="password"
                        className="form-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                    />
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                        style={{ width: '100%', marginTop: '8px' }}
                    >
                        {submitting ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
                <p style={{ marginTop: '16px', fontSize: '0.9rem', color: 'var(--gray)' }}>
                    Don&apos;t have an account? <Link to="/register">Register</Link>
                </p>
            </div>
        </div>
    );
}
