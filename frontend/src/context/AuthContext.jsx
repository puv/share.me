import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'shareme_auth_token';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem(STORAGE_KEY);
        if (token) {
            fetch('/api/auth/me', {
                headers: { Authorization: 'Bearer ' + token },
            })
                .then(async (res) => {
                    if (res.ok) {
                        const data = await res.json();
                        setUser(data);
                        // Persist admin flag
                        if (data.isAdmin) {
                            localStorage.setItem('shareme_is_admin', '1');
                        }
                    } else {
                        localStorage.removeItem(STORAGE_KEY);
                        localStorage.removeItem('shareme_is_admin');
                    }
                })
                .catch(() => {
                    localStorage.removeItem(STORAGE_KEY);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = useCallback(async (username, password) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        localStorage.setItem(STORAGE_KEY, data.token);
        setUser(data.user);
        if (data.user.isAdmin) {
            localStorage.setItem('shareme_is_admin', '1');
        }
        return data;
    }, []);

    const register = useCallback(async (username, password) => {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        localStorage.setItem(STORAGE_KEY, data.token);
        setUser(data.user);
        return data;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('shareme_is_admin');
        setUser(null);
    }, []);

    function getToken() {
        return localStorage.getItem(STORAGE_KEY);
    }

    const value = { user, loading, login, register, logout, getToken };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
