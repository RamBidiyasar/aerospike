import { useState, useCallback, useEffect } from 'react';
import './ResizeHandle.css';

export const ResizeHandle = ({ onResize, minWidth = 300, maxWidth = 800 }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;

        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= minWidth && newWidth <= maxWidth) {
            onResize(newWidth);
        }
    }, [isDragging, onResize, minWidth, maxWidth]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    return (
        <div
            className={`resize-handle ${isDragging ? 'dragging' : ''}`}
            onMouseDown={handleMouseDown}
        >
            <div className="resize-handle-bar" />
        </div>
    );
};
