# School Alt - AI-Powered Educational Learning Platform

## Overview

School Alt is a production-grade educational learning platform that transforms YouTube videos into structured learning paths with AI-powered intelligence. The platform provides:

- **Transcript-based intelligence** with quality scoring (TQS 0-100)
- **Concept extraction and knowledge graphs** connecting ideas across videos
- **Explainable curation** showing why each video is ranked #1
- **Live learning context** with prerequisite/next concept overlays during playback
- **Mastery tracking** with spaced repetition scheduling
- **1,000+ pre-built learning paths** for major topics

This is a comprehensive redesign from the original "Learn on YouTube" MVP to meet production requirements for intelligent learning path construction.

## User Preferences

Preferred communication style: Simple, everyday language.

## Project Status

**Current Phase**: Enhanced Player Implementation Complete ✓

### Completed Milestones

**Phase 1: System Design & Planning** ✓
- `SCHOOL_ALT_SYSTEM_DESIGN.md` - Complete production architecture
- `SCHOOL_ALT_INTEGRATION_PLAN.md` - Integration strategy with zero breaking changes

**Phase 2: Enhanced Player Dual-Rail Layout** ✓ (November 10, 2025)
- Three-column responsive layout (left rail + center player + right rail)
- Real-time concept intelligence with 30s polling
- Learning path visualization with progress tracking
- Graceful degradation when paths/concepts unavailable
- All components architect-reviewed and production-ready

**Implemented Components**:
- ✅ Google OAuth authentication (`server/googleAuth.ts`)
- ✅ BYOK key management (`server/keyManager.ts`, `server/apiKeySelector.ts`)
- ✅ Multi-level curation engine (`server/routes.ts`)
- ✅ **NEW**: Video Intelligence API (`GET /api/video-intelligence/:videoId`)
- ✅ **NEW**: Learning Paths API (`GET /api/paths/:pathId`)
- ✅ **NEW**: LeftRailPath component (path visualization)
- ✅ **NEW**: RightRailContext component (live concept intelligence with 30s polling)
- ✅ **NEW**: ReflectiveTray component (collapsible learning prompts)
- ✅ **NEW**: Enhanced PlayerPage (three-column dual-rail layout)

### Enhanced Player Features

**Left Rail - Learning Path Visualization**
- Shows active learning path with node sequence
- Progress indicators (completed, current, upcoming)
- Mastery level display (0-100)
- Graceful degradation: "No active learning path" when pathId not provided
- Component: `client/src/components/LeftRailPath.tsx`

**Center Column - Video Player**
- YouTube player with full controls
- Concept timeline below player showing concept spans
- Visual timeline with color-coded difficulty levels
- Seekable timeline (click to jump to concept)
- Component: `client/src/pages/PlayerPage.tsx`, `client/src/components/ConceptTimeline.tsx`

**Right Rail - Live Concept Intelligence**
- Current concept display with description
- Prerequisites with mastery status (green checkmark if mastered)
- Next concepts preview
- Key terms extraction from transcript
- 30-second polling (auto-refreshes every 30s)
- Time-bucketed queries for efficient caching
- Component: `client/src/components/RightRailContext.tsx`

**Bottom Tray - Reflective Learning**
- Collapsible tray with reflection prompts
- "What did you learn?" and "What questions do you have?"
- Submit/Skip actions
- Component: `client/src/components/ReflectiveTray.tsx`

**Responsive Design**:
- Desktop (lg+): Three-column layout (3-6-3 grid)
- Mobile: Center column only (left/right rails hidden)
- All components fully responsive

**Next Steps**: 
- Create demo learning paths for testing path visualization
- Implement automatic concept extraction (currently manual trigger)
- Add path creation UI for users to build custom learning paths

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite.
- **UI Library**: Shadcn/ui components built on Radix UI primitives.
- **Styling**: Tailwind CSS with a custom YouTube-inspired design system.
- **State Management**: TanStack Query for server state, React hooks for local state.
- **Routing**: Wouter for lightweight client-side routing.
- **Design**: Mobile-first, responsive design optimized for mobile devices with PWA capabilities.

### Backend Architecture
- **Runtime**: Node.js with Express.js server.
- **Language**: TypeScript with ES modules.
- **API Design**: RESTful endpoints for video curation and retrieval.
- **Error Handling**: Centralized error middleware with structured logging.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM.
- **Connection**: Neon serverless PostgreSQL with connection pooling.
- **Schema**: Two main tables for user preferences and curated videos with progress tracking.
- **Migrations**: Drizzle Kit for database schema management.
- **Progress Storage**: Hybrid approach using localStorage for client-side progress and database for search history.
- **Resume Functionality**: Cached video data in localStorage for offline resume capability.


## External Dependencies

### APIs and Services
- **Anthropic Claude API**: AI-powered content curation and analysis.
- **YouTube Data API v3**: Video metadata, thumbnails, and statistics.
- **Neon Database**: Serverless PostgreSQL hosting.

### UI/UX Libraries
- **Radix UI**: Accessible component primitives.
- **Lucide Icons**: Consistent icon system.
- **Class Variance Authority**: Type-safe CSS class management.