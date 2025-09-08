# GOOBR - Movie Prototype App

**"tap in, get there."** - A fully functional ride-hailing app prototype for film production.

## 🎬 About

GOOBR is a complete, movie-ready ride-hailing app prototype built with Next.js 14. It features a rider app, driver app, operations console, and Director Mode for scripting on-screen events during filming.

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📱 App Structure

### Rider App (`/`)
- **Landing Page**: Hero section with "Get a ride" CTA
- **Request Ride** (`/request`): Pickup/dropoff selection, ride types, pricing
- **Live Ride** (`/live`): Driver matching, ETA, driver info
- **Trip Progress** (`/trip`): Progress bar, cancel option
- **Receipt** (`/receipt`): Payment breakdown, rating, tips

### Driver App (`/driver`)
- **Sign In**: Passcode entry (use `000000`)
- **Dashboard**: Online/offline toggle, earnings overview
- **Queue** (`/queue`): Incoming ride requests
- **Active Trip** (`/run`): Trip controls (arrived, picked up, end)
- **Earnings** (`/earnings`): Daily summary and charts

### Operations Console (`/ops`)
- **Live Map**: Real-time vehicle tracking
- **Trip Management**: Active rides table
- **Surge Controls**: Toggle surge pricing
- **Quick Actions**: Spawn demand, add drivers, etc.

### Director Mode (`/director`)
- **Scenario Selection**: Pre-built scenarios for filming
- **Timeline Control**: Playback controls and timeline scrubbing
- **Hotkeys**: Keyboard shortcuts for live events
- **Cinematic Mode**: Full-screen overlay for filming

## 🎮 Demo Controls

### Rider Flow
- **Request Page**: Toggle surge pricing demo
- **Live Page**: Manual control of ride status (searching → matched → en route)
- **Trip Page**: Progress bar controls (reset, 50%, complete)
- **Receipt Page**: Rating and tip controls

### Driver Flow
- **Sign In**: Use passcode `000000`
- **Dashboard**: Toggle online/offline status
- **Queue**: Accept/decline incoming rides

### Operations
- **Surge Toggle**: Enable/disable surge pricing visualization
- **Global Pause**: Pause all operations
- **Quick Actions**: Spawn demand spikes, add drivers

### Director Mode
- **Scenario Picker**: Select from 6 pre-built scenarios
- **Playback Controls**: Play/pause/reset timeline
- **Hotkeys**: 
  - `1` - Spawn demand spike
  - `2` - Toggle heavy rain
  - `3` - Force surge pricing
  - `4` - Trigger driver chat
  - `5` - Cancel ride
- **Cinematic Mode**: Full-screen overlay for filming

## 🎬 Filming Shot List

### Essential Shots
1. **Landing Hero** - GOOBR wordmark with "tap in, get there." tagline
2. **Ride Request** - Estimate wiggle when switching between Eco/Comfort/XL
3. **Driver Matching** - Spinning loader and driver card entrance animation
4. **Live Map** - Car sprite gliding with smooth easing
5. **Surge Pricing** - Pulsing halo effect over neighborhoods
6. **Driver Actions** - Tapping "Arrived" then "Picked Up" buttons
7. **Trip Progress** - Animated progress bar completion
8. **Receipt** - 5-star rating with confetti animation
9. **Operations Console** - Live map with surge controls
10. **Director Mode** - Timeline scrubbing and scenario selection

### Cinematic Mode
- Access via Director Mode or add `?film=1` to any URL
- Hides browser chrome for clean filming
- Slows UI animations for dramatic effect
- Full-screen overlay with timeline controls

## 🎨 Brand Guidelines

### Colors
- **Goobr Black**: `#0B0B0F`
- **Goobr White**: `#F7F7FB`
- **Goobr Purple**: `#6C5CE7`
- **Goobr Mint**: `#2EE6A6`
- **Goobr Amber**: `#FFB02E`

### Typography
- **Font**: Inter (Google Fonts)
- **Base Size**: 14-16px
- **Display**: 32-48px

### Motion
- **Duration**: 150ms ease-out
- **Car Animation**: Springy easing for vehicle movement
- **Surge Halo**: 2s pulse animation

## 🛠️ Technical Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Animations**: CSS transitions + keyframes
- **State**: React hooks (useState, useEffect)
- **No External APIs**: Everything runs locally with mock data

## 📁 Project Structure

```
src/
├── app/
│   ├── (rider)/           # Rider app pages
│   ├── (driver)/          # Driver app pages
│   ├── (ops)/             # Operations console
│   ├── director/          # Director Mode
│   └── layout.tsx         # Root layout
├── components/
│   ├── GoobrLogo.tsx      # Brand logo component
│   └── FakeMap.tsx        # SVG map with animations
└── globals.css            # Global styles and animations
```

## 🎯 Filming Tips

### Camera Angles
- **Mobile**: Use browser dev tools to simulate mobile viewport
- **Desktop**: Full-screen for operations console shots
- **Tablet**: Medium viewport for driver app

### Lighting
- **Day Mode**: Default light theme
- **Night Mode**: Director Mode cinematic overlay
- **Focus**: Use browser zoom for close-up UI shots

### Audio
- **Sound Effects**: Add post-production sound effects
- **Voiceover**: Record narration separately
- **Music**: Add background music in editing

### Transitions
- **Page Transitions**: Smooth navigation between screens
- **State Changes**: Animate UI state changes
- **Loading States**: Show loading spinners and skeletons

## 🚀 Production Notes

This is a **prototype only** - no real payments, GPS, or external services are integrated. All data is mocked for demonstration purposes.

### Mock Data
- **Drivers**: 30 fictional drivers with unique names and vehicles
- **Locations**: 8 neighborhoods with realistic names
- **Pricing**: Dynamic fare calculation with surge multipliers
- **Events**: Scripted scenarios for consistent filming

### Performance
- **Optimized**: Fast loading with minimal dependencies
- **Responsive**: Works on all screen sizes
- **Accessible**: Keyboard navigation and focus management
- **Cross-browser**: Tested on Chrome, Safari, Firefox

## 📞 Support

For filming support or technical questions, refer to the Director Mode controls and demo features built into each page.

---

**GOOBR** - *tap in, get there.* 🚗✨
