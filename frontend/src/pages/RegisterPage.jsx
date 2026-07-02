import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            await register(username, password);
            navigate('/');
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="page-center">
            <div className="card center-card">
                <UserPlus size={40} color="var(--orange)" style={{ marginBottom: '12px' }} />
                <h1>Register</h1>
                <p style={{ marginBottom: '20px' }}>Create an account for 1 GB uploads</p>
                {error && <div className="alert alert-error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className="form-input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        placeholder="Username (letters, numbers, underscore)"
                        autoFocus
                        required
                        minLength={3}
                        maxLength={30}
                    />
                    <input
                        type="password"
                        className="form-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password (6+ characters)"
                        required
                        minLength={6}
                    />
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                        style={{ width: '100%', marginTop: '8px' }}
                    >
                        {submitting ? 'Creating account...' : 'Create Account'}
                    </button>
                </form>
                <p style={{ marginTop: '16px', fontSize: '0.9rem', color: 'var(--gray)' }}>
                    Already have an account? <Link to="/login">Login</Link>
                </p>
            </div>
        </div>
    );
}
