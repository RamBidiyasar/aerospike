import { useState } from 'react';
import { FiServer, FiPlus, FiEdit2, FiTrash2, FiCheck, FiX } from 'react-icons/fi';
import { profileStorage } from '../utils/profileStorage';
import './ClusterSelector.css';

export const ClusterSelector = ({ onSelectProfile, currentProfile }) => {
    const [profiles, setProfiles] = useState(profileStorage.getProfiles());
    const [isOpen, setIsOpen] = useState(false);
    const [showManageModal, setShowManageModal] = useState(false);

    const handleSelectProfile = (profile) => {
        profileStorage.setActiveProfileId(profile.id);
        onSelectProfile(profile);
        setIsOpen(false);
    };

    const handleDeleteProfile = (id, e) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this connection profile?')) {
            profileStorage.deleteProfile(id);
            setProfiles(profileStorage.getProfiles());
        }
    };

    const activeProfileId = profileStorage.getActiveProfileId();

    return (
        <div className="cluster-selector">
            <button
                className="cluster-selector-btn"
                onClick={() => setIsOpen(!isOpen)}
            >
                <FiServer className="selector-icon" />
                <span className="selector-text">
                    {currentProfile ? currentProfile.name : 'Select Cluster'}
                </span>
                <span className="selector-arrow">{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
                <div className="cluster-dropdown">
                    <div className="dropdown-header">
                        <span>Saved Clusters</span>
                        <button
                            className="btn-manage"
                            onClick={() => setShowManageModal(true)}
                        >
                            <FiEdit2 /> Manage
                        </button>
                    </div>

                    <div className="dropdown-list">
                        {profiles.length === 0 ? (
                            <div className="dropdown-empty">
                                <p>No saved clusters</p>
                                <small>Connect and save a cluster to get started</small>
                            </div>
                        ) : (
                            profiles.map(profile => (
                                <div
                                    key={profile.id}
                                    className={`dropdown-item ${activeProfileId === profile.id ? 'active' : ''}`}
                                    onClick={() => handleSelectProfile(profile)}
                                >
                                    <div className="item-info">
                                        <div className="item-name">
                                            {profile.name}
                                            {activeProfileId === profile.id && (
                                                <FiCheck className="active-icon" />
                                            )}
                                        </div>
                                        <div className="item-details">
                                            {profile.host}:{profile.port}
                                        </div>
                                    </div>
                                    <button
                                        className="btn-delete"
                                        onClick={(e) => handleDeleteProfile(profile.id, e)}
                                        title="Delete profile"
                                    >
                                        <FiTrash2 />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {showManageModal && (
                <ManageProfilesModal
                    profiles={profiles}
                    onClose={() => {
                        setShowManageModal(false);
                        setProfiles(profileStorage.getProfiles());
                    }}
                />
            )}
        </div>
    );
};

const ManageProfilesModal = ({ profiles, onClose }) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content manage-profiles-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Manage Connection Profiles</h2>
                    <button className="modal-close-btn" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    {profiles.length === 0 ? (
                        <div className="no-profiles">
                            <FiServer className="no-profiles-icon" />
                            <p>No connection profiles saved yet</p>
                            <small>Connect to a cluster and save the profile to manage it here</small>
                        </div>
                    ) : (
                        <div className="profiles-list">
                            {profiles.map(profile => (
                                <div key={profile.id} className="profile-card">
                                    <div className="profile-header">
                                        <FiServer />
                                        <h4>{profile.name}</h4>
                                    </div>
                                    <div className="profile-details">
                                        <div><strong>Host:</strong> {profile.host}</div>
                                        <div><strong>Port:</strong> {profile.port}</div>
                                        {profile.username && (
                                            <div><strong>Username:</strong> {profile.username}</div>
                                        )}
                                        <div><strong>Created:</strong> {new Date(profile.createdAt).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
