import { CONFIG } from '../config.js';

// Helper to determine if Firebase config is fully supplied
export function isFirebaseConfigured() {
  return CONFIG.FIREBASE && 
         CONFIG.FIREBASE.apiKey && 
         CONFIG.FIREBASE.apiKey !== 'YOUR_FIREBASE_API_KEY' &&
         CONFIG.FIREBASE.apiKey.trim() !== '';
}
// Master admin email whitelisting check
export function isAdminEmail(email) {
  return email && email.toLowerCase() === 'muzaddidusama@gmail.com';
}

let app = null;
let auth = null;
let db = null;
let googleProvider = null;
export let firebaseActive = false;

// Dynamic imports load helper to avoid loading Firebase SDK libraries if offline/unconfigured
async function initializeFirebaseSDKs() {
  if (!isFirebaseConfigured()) {
    console.warn("Firebase credentials missing in config.js. Running in Mock/Offline Auth Mode.");
    return;
  }

  try {
    // Dynamic import firebase modules
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
    const { 
      getAuth, 
      GoogleAuthProvider, 
      signInWithPopup, 
      signInWithRedirect,
      signInWithEmailAndPassword, 
      createUserWithEmailAndPassword,
      signOut
    } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
    
    const { 
      getFirestore, 
      doc, 
      getDoc, 
      setDoc, 
      updateDoc, 
      collection, 
      getDocs, 
      query, 
      limit,
      onSnapshot
    } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

    // Initialize
    app = initializeApp(CONFIG.FIREBASE);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
    firebaseActive = true;

    // Clear mock cached session to prevent race conditions on dynamic imports initialization
    localStorage.removeItem('mock_current_user');

    // Expose helpers directly bound to current SDK context
    firebaseOperations.signInWithGoogle = async () => {
      try {
        const result = await signInWithPopup(auth, googleProvider);
        return syncUserProfile(result.user);
      } catch (err) {
        // If popup is blocked, closed, or third-party storage access is denied (common in Safari/Brave), fallback to redirect
        if (err.code === 'auth/popup-blocked' || 
            err.code === 'auth/popup-closed-by-user' || 
            err.code === 'auth/cancelled-popup-request' ||
            err.code === 'auth/network-request-failed' ||
            err.message?.includes('popup') ||
            err.message?.includes('third-party')) {
          console.warn("Google Popup blocked or failed. Redirecting instead...", err);
          await signInWithRedirect(auth, googleProvider);
        } else {
          throw err;
        }
      }
    };

    firebaseOperations.signUp = async (email, password) => {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      return syncUserProfile(result.user);
    };

    firebaseOperations.login = async (email, password) => {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return getUserProfile(result.user.uid);
    };

    firebaseOperations.logout = async () => {
      await signOut(auth);
    };

    let userUnsubscribe = null;

    firebaseOperations.onAuthStateChanged = (callback) => {
      const authUnsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
        if (userUnsubscribe) {
          userUnsubscribe();
          userUnsubscribe = null;
        }

        if (firebaseUser) {
          try {
            const profile = await syncUserProfile(firebaseUser);
            callback(profile);

            // Subscribe to real-time updates on this user's profile document
            const ref = doc(db, 'users', firebaseUser.uid);
            userUnsubscribe = onSnapshot(ref, (snap) => {
              if (snap.exists()) {
                const profileData = snap.data();
                const isDefaultAdmin = isAdminEmail(profileData.email);
                if (isDefaultAdmin) {
                  profileData.role = 'admin';
                  profileData.approved = true;
                }
                callback(profileData);
              }
            }, (err) => {
              console.warn("Real-time profile updates snapshot failed:", err);
            });
          } catch (err) {
            console.error('Error fetching user profile during state change:', err);
            window.dispatchEvent(new CustomEvent('auth-error', { detail: err }));
            callback(null);
          }
        } else {
          callback(null);
        }
      });

      return () => {
        authUnsubscribe();
        if (userUnsubscribe) {
          userUnsubscribe();
          userUnsubscribe = null;
        }
      };
    };

    // Database Sync Actions
    firebaseOperations.syncUserData = async (uid, data) => {
      const ref = doc(db, 'users', uid);
      await setDoc(ref, {
        watchlist: data.watchlist || [],
        history: data.history || [],
        lastUpdated: Date.now()
      }, { merge: true });
    };

    firebaseOperations.getUserData = async (uid) => {
      const ref = doc(db, 'users', uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data();
        return { watchlist: d.watchlist || [], history: d.history || [] };
      }
      return { watchlist: [], history: [] };
    };

    firebaseOperations.fetchGlobalConfig = async () => {
      const ref = doc(db, 'system', 'config');
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    };

    firebaseOperations.saveGlobalConfig = async (configData) => {
      const ref = doc(db, 'system', 'config');
      await setDoc(ref, configData, { merge: true });
    };

    // Admin Dashboard Actions
    firebaseOperations.getAllMembers = async () => {
      const q = collection(db, 'users');
      const snap = await getDocs(q);
      const users = [];
      snap.forEach(doc => {
        users.push({ uid: doc.id, ...doc.data() });
      });
      return users;
    };

    firebaseOperations.onMembersListChanged = (callback) => {
      const q = collection(db, 'users');
      return onSnapshot(q, (snap) => {
        const users = [];
        snap.forEach(doc => {
          users.push({ uid: doc.id, ...doc.data() });
        });
        callback(users);
      }, (err) => {
        console.error("Real-time members subscription failed:", err);
      });
    };

    firebaseOperations.updateMemberStatus = async (uid, approved, role) => {
      const ref = doc(db, 'users', uid);
      await updateDoc(ref, { approved, role });
    };

    // Helper functions for user registration profiles sync inside Firestore
    const syncUserProfile = async (user) => {
      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      
      let profile = null;
      if (!snap.exists()) {
        const isDefaultAdmin = isAdminEmail(user.email);
        
        let isFirstUser = false;
        try {
          const firstUserQuery = query(collection(db, 'users'), limit(1));
          const firstUserSnap = await getDocs(firstUserQuery);
          isFirstUser = firstUserSnap.empty;
        } catch (err) {
          console.warn("Failed to check if first user (likely due to Firestore read rules). Defaulting to false.", err);
        }

        profile = {
          uid: user.uid,
          email: user.email,
          role: (isFirstUser || isDefaultAdmin) ? 'admin' : 'member',
          approved: (isFirstUser || isDefaultAdmin) ? true : false,
          createdAt: Date.now(),
          lastLogin: Date.now(),
          watchlist: [],
          history: []
        };
        
        try {
          await setDoc(ref, profile);
        } catch (err) {
          console.error("Failed to save new user profile to database:", err);
          // If whitelisted admin, allow local memory fallback; otherwise throw so member knows database is broken
          if (!isDefaultAdmin) {
            throw new Error("Database profile creation blocked. Please contact admin.");
          }
        }
      } else {
        profile = snap.data();
        
        // Enforce whitelisted admin role/approval in memory
        const isDefaultAdmin = isAdminEmail(user.email);
        const needsUpdate = profile.role !== 'admin' || profile.approved !== true;
        
        if (isDefaultAdmin) {
          profile.role = 'admin';
          profile.approved = true;
        }
        
        // Attempt database updates but catch errors silently so login is never blocked
        try {
          const updates = { lastLogin: Date.now() };
          if (isDefaultAdmin && needsUpdate) {
            updates.role = 'admin';
            updates.approved = true;
          }
          await updateDoc(ref, updates);
        } catch (err) {
          console.warn("Failed to update user login metadata in database:", err);
        }
      }
      return profile;
    };

    const getUserProfile = async (uid) => {
      const ref = doc(db, 'users', uid);
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    };

  } catch (err) {
    console.error("Firebase SDK script loading failed. Falling back to Mock Mode.", err);
    firebaseActive = false;
  }
}

// ==========================================================================
// Fallback Mock System (Offline mode triggers if config is empty)
// ==========================================================================
const mockUsersDb = JSON.parse(localStorage.getItem('mock_users_db')) || [];
let currentMockUser = JSON.parse(localStorage.getItem('mock_current_user')) || null;

function saveMockDbs() {
  localStorage.setItem('mock_users_db', JSON.stringify(mockUsersDb));
  localStorage.setItem('mock_current_user', JSON.stringify(currentMockUser));
  window.dispatchEvent(new CustomEvent('mock-users-changed'));
}

// Central Operations Exporter (Exposes Firebase actions, fallback to Mocks)
export const firebaseOperations = {
  signInWithGoogle: async () => {
    // Simulated Google login in offline mode
    const email = prompt("Enter a Google/Gmail address for simulated login:", "admin@ubhstream.com") || "user@ubhstream.com";
    return simulateMockLogin(email, "Google User");
  },

  signUp: async (email, password) => {
    const exists = mockUsersDb.some(u => u.email === email);
    if (exists) throw new Error("Email already registered in local directory.");
    
    // First user check for mock admin bootstrap
    const isFirstUser = mockUsersDb.length === 0;

    const isDefaultAdmin = isAdminEmail(email);
    const user = {
      uid: 'mock-' + Math.random().toString(36).substring(2, 9),
      email: email,
      role: (isFirstUser || isDefaultAdmin) ? 'admin' : 'member',
      approved: (isFirstUser || isDefaultAdmin) ? true : false,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      watchlist: [],
      history: []
    };

    mockUsersDb.push(user);
    currentMockUser = user;
    saveMockDbs();
    return user;
  },

  login: async (email, password) => {
    const user = mockUsersDb.find(u => u.email === email);
    if (!user) throw new Error("Invalid email or password.");
    
    // Enforce whitelisted admin status in mock database
    if (isAdminEmail(email)) {
      user.role = 'admin';
      user.approved = true;
    }
    
    user.lastLogin = Date.now();
    currentMockUser = user;
    saveMockDbs();
    return user;
  },

  logout: async () => {
    currentMockUser = null;
    saveMockDbs();
  },

  onAuthStateChanged: (callback) => {
    setTimeout(() => {
      callback(currentMockUser);
    }, 100);

    const listener = () => {
      if (currentMockUser) {
        const freshUser = mockUsersDb.find(u => u.uid === currentMockUser.uid);
        if (freshUser) {
          currentMockUser = freshUser;
          callback(currentMockUser);
        }
      }
    };

    window.addEventListener('mock-users-changed', listener);
    return () => {
      window.removeEventListener('mock-users-changed', listener);
    };
  },

  syncUserData: async (uid, data) => {
    if (currentMockUser && currentMockUser.uid === uid) {
      currentMockUser.watchlist = data.watchlist || [];
      currentMockUser.history = data.history || [];
      saveMockDbs();
    }
    const idx = mockUsersDb.findIndex(u => u.uid === uid);
    if (idx > -1) {
      mockUsersDb[idx].watchlist = data.watchlist || [];
      mockUsersDb[idx].history = data.history || [];
      saveMockDbs();
    }
  },

  getUserData: async (uid) => {
    const user = mockUsersDb.find(u => u.uid === uid);
    if (user) {
      return { watchlist: user.watchlist || [], history: user.history || [] };
    }
    return { watchlist: [], history: [] };
  },

  fetchGlobalConfig: async () => {
    try {
      return JSON.parse(localStorage.getItem('mock_global_config')) || null;
    } catch {
      return null;
    }
  },

  saveGlobalConfig: async (configData) => {
    localStorage.setItem('mock_global_config', JSON.stringify(configData));
  },

  getAllMembers: async () => {
    return mockUsersDb;
  },

  onMembersListChanged: (callback) => {
    callback(mockUsersDb);
    const listener = () => callback(mockUsersDb);
    window.addEventListener('mock-users-changed', listener);
    return () => {
      window.removeEventListener('mock-users-changed', listener);
    };
  },

  updateMemberStatus: async (uid, approved, role) => {
    const idx = mockUsersDb.findIndex(u => u.uid === uid);
    if (idx > -1) {
      mockUsersDb[idx].approved = approved;
      mockUsersDb[idx].role = role;
      if (currentMockUser && currentMockUser.uid === uid) {
        currentMockUser.approved = approved;
        currentMockUser.role = role;
      }
      saveMockDbs();
    }
  }
};

function simulateMockLogin(email, name) {
  let user = mockUsersDb.find(u => u.email === email);
  
  if (!user) {
    const isFirstUser = mockUsersDb.length === 0;
    // Enforce whitelisted admin status in mock database
    const isDefaultAdmin = isAdminEmail(email);
    user = {
      uid: 'mock-' + Math.random().toString(36).substring(2, 9),
      email: email,
      role: (isFirstUser || isDefaultAdmin) ? 'admin' : 'member',
      approved: (isFirstUser || isDefaultAdmin) ? true : false,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      watchlist: [],
      history: []
    };
    mockUsersDb.push(user);
  } else {
    // Enforce whitelisted admin status in mock database
    if (isAdminEmail(email)) {
      user.role = 'admin';
      user.approved = true;
    }
    user.lastLogin = Date.now();
  }
  
  currentMockUser = user;
  saveMockDbs();
  return user;
}

// Trigger SDK load check asynchronously and export promise
export const firebaseInitPromise = initializeFirebaseSDKs();
