/**
 * Application Configuration
 * 
 * This file is public and tracked by Git.
 * Private keys are read dynamically from Vite environment variables (stored in .env locally or Vercel settings).
 */

export const CONFIG = {
  // TMDB Read Access Token (v4 auth) or API Key (v3 auth)
  // Read from environment variable VITE_TMDB_API_KEY, fallback to empty string
  TMDB_API_KEY: import.meta.env.VITE_TMDB_API_KEY || 'YOUR_TMDB_API_KEY_HERE',
  
  // Base URL for fetching images from TMDB
  TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p',
  
  // Streaming Player configurations
  // Read from environment variables, fallback to standard defaults
  STREAM_MOVIE_URL: import.meta.env.VITE_STREAM_MOVIE_URL || 'https://vidsrc.to/embed/movie/{id}',
  STREAM_TV_URL: import.meta.env.VITE_STREAM_TV_URL || 'https://vidsrc.to/embed/tv/{id}/{season}/{episode}',

  // Temporary bypass for authentication overlays (set false to re-enable Firebase authentication protection)
  DISABLE_AUTH: false,

  // Firebase Configuration parameters for OAuth & user sync
  FIREBASE: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
  }
};
