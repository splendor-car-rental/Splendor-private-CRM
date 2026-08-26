// Vercel serverless function entry point.
//
// Everything the app's backend needs to do (auth checks, all /api/*
// business logic, Firestore access via firebase-admin) already lives in
// server.ts as a plain Express `app`. This file just re-exports that same
// app as the default export of a function under /api -- which is Vercel's
// convention for "this file is a serverless function". Vercel's Node.js
// runtime knows how to invoke an Express app directly as a request handler.
//
// vercel.json rewrites every /api/* request to this one function, and
// since every route in server.ts is already defined with its full
// "/api/..." path (e.g. app.get('/api/leads', ...)), no path-stripping or
// extra routing logic is needed here.
export { default } from '../server';
