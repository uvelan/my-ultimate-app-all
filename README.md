# Next.js End-to-End Auth System

A production-ready Authentication System built with Next.js 16 (App Router), React 19, MongoDB, Prisma, and Bootstrap 5.

## Features

- **Authentication**: Custom implementation using JWT (Access + Refresh tokens) and HttpOnly cookies.
- **Security**: Password hashing (bcrypt), CSRF protection, Protected Routes (Middleware).
- **Roles**: Granular access control (Admin/User).
- **UI/UX**: Modern Glassmorphism design with Bootstrap 5 and customized Tailwind utilities.
- **Admin Dashboard**: Manage users, promote/demote roles, delete accounts.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Server Actions)
- **Language**: TypeScript
- **Database**: MongoDB (Atlas or Local)
- **ORM**: Prisma
- **Styling**: Bootstrap 5 + Tailwind CSS (for utilities)
- **Auth**: Custom JWT (jsonwebtoken, jose for edge)

## Setup Instructions

1.  **Clone the repository**
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Variables**:
    Rename `.env.example` to `.env` (or create `.env`) and populate:
    ```env
    DATABASE_URL="mongodb+srv://..."
    JWT_SECRET="complex-secret-here"
    JWT_REFRESH_SECRET="another-complex-secret"
    NEXT_PUBLIC_APP_URL="http://localhost:3000"
    ```
4.  **Database Setup**:
    ```bash
    npx prisma generate
    # If using MongoDB Atlas, ensure IP whitelist allows connection
    ```
5.  **Seed Admin User**:
    You can run the seed script to create an initial Admin user:
    ```bash
    npx ts-node --compiler-options {\"module\":\"CommonJS\"} src/prisma/seed.ts
    ```
    *(Note: You might need to install ts-node: `npm install -D ts-node`)*

6.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## Deployment (Vercel)

1.  Push code to GitHub.
2.  Import project in Vercel.
3.  Add Environment Variables (`DATABASE_URL`, `JWT_SECRET`, etc.) in Vercel Project Settings.
4.  Deploy!

## MongoDB Atlas Guide

1.  Create a cluster (Free Tier M0 is fine).
2.  Create a database user (username/password).
3.  Network Access: Allow access from anywhere (0.0.0.0/0) for testing, or whitelist Vercel IPs.
4.  Get Connection String: `mongodb+srv://<username>:<password>@cluster0.rew3a.mongodb.net/myFirstDatabase`
