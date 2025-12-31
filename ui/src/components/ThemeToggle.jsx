import { FiMoon, FiSun } from 'react-icons/fi';
import { useState, useEffect } from 'react';
import './ThemeToggle.css';

export const ThemeToggle = () => {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('theme') || 'light';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
    };

    return (
        <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            {theme === 'light' ? <FiMoon /> : <FiSun />}
        </button>
    );
};
