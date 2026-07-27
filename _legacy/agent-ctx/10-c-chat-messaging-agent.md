# Task 10-c: Real-Time Chat Messaging System with Socket.IO

## Summary
Added a complete real-time messaging system using Socket.IO as a mini-service. Tenants and landlords can now chat in real-time about property inquiries with typing indicators, online status, read receipts, and more.

## Work Completed

### 1. Chat Service Mini-Service (`/mini-services/chat-service/`)
- Created new bun project with `package.json` and `index.ts` entry file
- Hardcoded port 3003
- Uses socket.io for WebSocket communication
- Handles events:
  - `join-room` - joins an inquiry chat room, leaves previous room
  - `send-message` - broadcasts message to all room participants
  - `typing` - broadcasts typing indicator to room
  - `stop-typing` - broadcasts stop typing to room
  - `mark-read` - notifies room that messages have been read
- Stores connected users in memory (`socketId → { userId, inquiryId }`)
- Handles `user-online`, `user-offline`, `online-users` events
- CORS configured with `origin: "*"`
- Uses `bun --hot index.ts` for auto-restart on changes
- Graceful shutdown on SIGTERM/SIGINT

### 2. Frontend: ChatView Component (`/src/components/house-for-rent/ChatView.tsx`)
- Full chat interface with:
  - Left sidebar: searchable list of inquiry conversations with online indicators, unread badges, last message preview
  - Right panel: chat messages with sender avatars, timestamps, message grouping
  - Message input with send button
  - Animated typing indicator (3 bouncing dots + "X is typing...")
  - Online/offline status indicators (green dots on avatars)
  - Unread message count badges (emerald green)
  - Read receipts (✓/✓✓) on sent messages
  - Live/Offline connection status badge
  - Connection error message when offline
- Socket.IO client connection: `io("/?XTransformPort=3003")` (gateway-compliant)
- Joins room when selecting an inquiry
- Send/receive messages in real-time
- Persists messages via REST API `/api/inquiries` (POST to send, GET to load history)
- Shows message timestamps with 5-minute grouping
- Different styling: emerald for sent messages, gray for received
- Responsive: on mobile, shows conversation list OR chat (not both), with back button
- Typing indicator with 2-second timeout auto-stop
- Mark messages as read when opening a conversation (via both REST PUT and socket event)

### 3. API Route Updates (`/src/app/api/inquiries/route.ts`)
- **GET**: Enhanced to include `sender` info on messages (`include: { sender: { select: { id, name, avatar } } }`)
- **POST**: Added participant verification (user must be tenant or landlord of the inquiry property)
- **PUT** (new): Marks all unread messages in an inquiry as read for the current user

### 4. Navigation Updates
- **Header.tsx**: Changed Messages nav from `view: 'inquiries'` to `view: 'messages'` (desktop nav, mobile sheet, and dropdown menu)
- **MobileBottomNav.tsx**: Changed Messages from `view: 'inquiries'` to `view: 'messages'`
- **AppShell.tsx**: Added `case 'messages': return <ChatView />` to renderView switch
- **LandlordDashboard.tsx**: Changed "View All Messages" button from `inquiries` to `messages`
- **UserProfile.tsx**: Changed inquiry click from `inquiries` to `messages`
- **Breadcrumbs.tsx**: Already had `messages` breadcrumb mapping

### 5. Package Installation
- `socket.io-client@4.8.3` added to main project dependencies
- `socket.io@4.8.3` added to chat-service dependencies

## Technical Details
- Socket connection created once per user session (not per inquiry change)
- Used refs (`userIdRef`, `activeInquiryIdRef`) to avoid stale closures in socket event handlers
- Room management: automatically leaves previous room when joining new one
- Message deduplication: socket `new-message` handler checks for existing message IDs
- Typing indicator auto-stops after 2 seconds of inactivity
- REST API used for persistence, Socket.IO for real-time delivery
- All navigation consistently points to 'messages' view for the chat feature
