# **App Name**: NyeriConnect

## Core Features:

- User Authentication & KYC: Users can register using email/password or phone number with OTP verification, and upload ID and a selfie for KYC. Store KYC data in Firebase Storage.
- User Profiles: Users can create and manage their profiles, including updating profile pictures, bio, and contact information. Implement different user roles: Buyer, Seller, and Admin.
- Item Listings: Sellers can list items with details like title, description, images, price, category, and location. Buyers can view and filter items on the home screen.
- Real-Time Messaging: Buyers and sellers can communicate in real-time using Firebase Realtime Database or Firestore. Include features like message timestamps and typing indicators.
- Escrow Payment Integration: Implement an escrow payment system using Firebase Functions. Buyers pay through the app, and the money is held until the buyer confirms receipt. Admin can resolve disputes.
- Chatbot Assistant: Integrate a basic chatbot using Genkit to assist users with common FAQs. The chatbot is a tool that can answer questions like "How do I list an item?", "How does payment work?", and "How do I resolve a dispute?".

## Style Guidelines:

- Primary color: Green (#388E3C) to represent growth and trust.
- Secondary color: Light gray (#EEEEEE) for backgrounds and neutral elements.
- Accent: Orange (#FF9800) for call-to-action buttons and highlights.
- Clean and readable sans-serif fonts for body text and headings.
- Use flat, minimalist icons for navigation and actions.
- Mobile-first, responsive design with a clear and intuitive layout.

## Original User Request:
Build a full-stack mobile-first application called "Nyeri Marketplace" targeting users in Nyeri County, Kenya. The platform should allow users to register, list items for sale, chat in real-time, and process in-app payments via an escrow system. Use Firebase tools and services where appropriate. Include a chatbot and admin tools.

🧩 Features to include:

1. 🔐 User Authentication:
   - Email/password & phone number sign-up
   - OTP verification
   - KYC verification: ID upload & selfie (store in Firebase Storage)

2. 👤 User Profiles:
   - Update profile picture, bio, and contact info
   - User roles: Buyer, Seller, Admin

3. 📦 Item Listings:
   - Users can post items with: title, description, images, price, category, and location (Nyeri area)
   - Ability to edit or delete listings
   - View all items on home screen with filters (price, category, location)

4. 💬 Real-Time Messaging:
   - Buyer can chat with seller about an item
   - Use Firebase Realtime DB or Firestore + Firebase Authentication for chat
   - Show message timestamps, read receipts, typing indicators

5. 💸 Escrow Payment Integration:
   - Buyers pay through the app (simulate via test gateway or integrate IntaSend/Mpesa via callable functions or HTTPS triggers)
   - Money held in escrow until buyer confirms receipt
   - Admin can resolve disputes
   - Notify users via push/email on payment status

6. 📢 Notifications:
   - Push notifications for new messages, listing updates, payment confirmations

7. 🛡️ Admin Dashboard:
   - Manage users, listings, disputes
   - View reported chats or flagged listings
   - Approve or reject KYC and seller withdrawals

8. 🤖 Chatbot:
   - Basic chatbot to assist users with FAQs like: "How do I list an item?", "How does payment work?", "How do I resolve a dispute?"
   - Can be powered by Dialogflow or Genkit AI agent

🛠 Tech stack and Firebase Services to use:
- Firebase Authentication
- Cloud Firestore (for listings, chat, users)
- Firebase Storage (for item images, ID uploads)
- Firebase Functions (for payments and escrow logic)
- Firebase Cloud Messaging (for notifications)
- Firebase Hosting (if building web version)
- Firebase Extensions (if needed)
- Optional: Genkit for chatbot logic

Include a clean, modern UI with views for:
- Login / Register
- Home / Listings page
- Item detail
- Chat screen
- Payment screen
- Profile page
- Admin dashboard

Generate TypeScript (React Native or Web) and Firebase backend code. Scaffold the database with sample schema and security rules.
  