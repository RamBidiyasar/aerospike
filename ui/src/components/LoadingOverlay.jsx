import { FiLoader } from 'react-icons/fi';
import './LoadingOverlay.css';

export const LoadingOverlay = ({ message = 'Loading...', fullScreen = false }) => {
    return (
        <div className={`loading-overlay-container ${fullScreen ? 'fullscreen' : ''}`}>
            <div className="loading-content">
                <div className="loading-spinner-modern">
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                    <FiLoader className="spinner-icon" />
                </div>
                <p className="loading-message">{message}</p>
                <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    );
};
