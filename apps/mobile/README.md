# Nimbus Mobile

React Native + Expo app for the Nimbus workspace.

## Stack
- **Expo SDK 52** with Expo Router (file-based navigation)
- **React Native 0.76**
- **TypeScript 5**

## Structure
```
app/              # Expo Router pages
  _layout.tsx     # Root layout (AuthProvider + Stack navigator)
  index.tsx       # Role-based redirect
  login.tsx       # Token paste login
  (admin)/        # Super admin screens (Sprint S2-5 mobile)
  (manager)/      # Manager screens (Sprint S2-6 mobile)
  (tabs)/         # User screens — inbox, calendar
src/
  api/client.ts   # Typed fetch client (mirrors apps/frontend)
  context/        # AuthContext with AsyncStorage persistence
  components/     # Shared RN components
assets/           # Icons, splash
```

## Getting started
```bash
pnpm install
pnpm start         # Expo dev server
pnpm ios           # iOS simulator
pnpm android       # Android emulator
```

## Backend connection
Edit `src/context/AuthContext.tsx` → `API_BASE` when testing on a physical device (replace `localhost` with your machine's LAN IP).
