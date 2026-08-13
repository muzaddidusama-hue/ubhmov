# CineStream - Premium Movie & Series Streaming Platform

A sleek, modern, and mobile-responsive streaming platform inspired by Apple TV+ and Netflix. This web application integrates with the TMDB API to showcase trending movies, series, search catalogs, and stream media dynamically using a secure configuration setup.

## Features

- 🌟 **Premium Minimalist UI**: Glassmorphic styling, smooth hover zoom animations, skeleton placeholders, and vibrant cyan details.
- 📱 **Mobile Responsive Design**: Fixed sidebar layout for desktop, transitioning to a bottom tab bar on mobile phones.
- 🔍 **Interactive Discovery**: Real-time debounced keyword search and dynamic genre chip filtering with infinite scroll results.
- 🎬 **Cinematic Video Player**: Immersive full-screen player overlay with responsive season and episode quick-selectors for TV shows, and an ambient theatre glow effect.
- 📁 **Watchlist & History**: Built-in library tracking for bookmarking titles and saving watch progress (resume episode points) in `localStorage`.
- 🔐 **Credential Security**: Configured to run using local private keys, fully hidden from GitHub using Gitignore rule sets.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- A [TMDB API Key](https://www.themoviedb.org/settings/api)

### Installation & Launch

1. Clone or download the repository files.
2. Install the dev dependencies:
   ```bash
   npm install
   ```
3. Copy the configuration template file:
   ```bash
   cp config.example.js config.js
   ```
4. Open `config.js` in your editor and input your TMDB credentials:
   ```javascript
   export const CONFIG = {
     TMDB_API_KEY: 'YOUR_TMDB_READ_ACCESS_TOKEN_OR_API_KEY',
     // ...
   };
   ```
5. Start the development server:
   ```bash
   npm run dev
   ```
6. Open the local address (e.g., `http://localhost:5173`) in your web browser.

## Built With

- **Vite** - Frontend Tooling & Dev Server
- **Vanilla Javascript** - Application Architecture
- **Vanilla CSS** - Premium Styles & Micro-Animations
- **TMDB API** - Movie/Series Catalog Engine
