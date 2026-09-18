# PKC BIZOFT Mobile

A first mobile-app shell built with Expo + React Native + Expo Router.

## Includes

- PKC BIZOFT mobile login
- Supabase email/password authentication
- Persistent Supabase session
- Protected navigation
- Dashboard shell
- Jobs tab
- Profile and sign out
- Robot branding
- Ready for the existing PKC BIZOFT backend

## Setup

1. Install Node.js LTS.
2. Copy `.env.example` to `.env`.
3. Put the existing Supabase URL and publishable/anon key in `.env`.
4. Run `npm install`.
5. Run `npx expo start`.

Never put a Supabase service-role/secret key in a mobile application.

## Structure

app/
  _layout.tsx
  login.tsx
  (tabs)/
    _layout.tsx
    index.tsx
    jobs.tsx
    profile.tsx

components/
constants/
lib/
