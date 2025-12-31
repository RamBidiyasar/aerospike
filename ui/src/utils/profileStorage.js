// Connection profile management
const PROFILES_KEY = 'aerospike_connection_profiles';

export const profileStorage = {
    // Get all saved profiles
    getProfiles: () => {
        try {
            const stored = localStorage.getItem(PROFILES_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error reading profiles:', error);
            return [];
        }
    },

    // Save a new profile
    saveProfile: (profile) => {
        try {
            const profiles = profileStorage.getProfiles();
            const newProfile = {
                id: Date.now().toString(),
                ...profile,
                createdAt: new Date().toISOString(),
            };
            profiles.push(newProfile);
            localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
            return newProfile;
        } catch (error) {
            console.error('Error saving profile:', error);
            throw error;
        }
    },

    // Update existing profile
    updateProfile: (id, updates) => {
        try {
            const profiles = profileStorage.getProfiles();
            const index = profiles.findIndex(p => p.id === id);
            if (index !== -1) {
                profiles[index] = { ...profiles[index], ...updates };
                localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
                return profiles[index];
            }
            return null;
        } catch (error) {
            console.error('Error updating profile:', error);
            throw error;
        }
    },

    // Delete a profile
    deleteProfile: (id) => {
        try {
            const profiles = profileStorage.getProfiles();
            const filtered = profiles.filter(p => p.id !== id);
            localStorage.setItem(PROFILES_KEY, JSON.stringify(filtered));
            return true;
        } catch (error) {
            console.error('Error deleting profile:', error);
            throw error;
        }
    },

    // Get active profile ID
    getActiveProfileId: () => {
        return localStorage.getItem('active_profile_id');
    },

    // Set active profile
    setActiveProfileId: (id) => {
        localStorage.setItem('active_profile_id', id);
    },
};
