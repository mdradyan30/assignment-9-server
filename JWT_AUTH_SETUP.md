# 🔐 JWT Authentication with HTTP-Only Cookies - Setup Complete

## ✅ Implementation Summary

Your backend now has a **secure JWT authentication system** using HTTP-Only Cookies. Here's what was implemented:

---

## 📦 Installation

Run this command to install the required package:

```bash
npm install cookie-parser
```

**Already installed:**
- `jsonwebtoken` ✅
- `bcryptjs` ✅

---

## 🔑 Key Features Implemented

### 1. **Updated Auth Middleware** (`middleware/auth.js`)

#### New Middleware Function: `protectRoute`
- Extracts JWT from HTTP-Only cookies (not Authorization header)
- Verifies the token validity
- Attaches user data to `req.user` object
- Returns **401 Unauthorized** if token is missing or invalid

#### Updated Token Generation: `generateToken(user)`
- Creates JWT with **1 day expiration** (24 hours)
- Includes: `userId`, `email`, `name` in payload
- Uses `process.env.JWT_SECRET` (fallback: `'your_long_random_secret_here'`)

#### Token Settings for Cookies:
```javascript
{
  httpOnly: true,                              // Cannot be accessed via JavaScript (XSS protection)
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production, HTTP in development
  sameSite: 'lax',                             // CSRF protection
  maxAge: 24 * 60 * 60 * 1000                 // Expires in 1 day
}
```

---

## 🚀 Updated Auth Routes

### **POST** `/api/auth/register`
Creates a new user and sets JWT in cookie.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "photoURL": "https://example.com/photo.jpg" // optional
}
```

**Response:**
```json
{
  "message": "Registration successful",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "photoURL": "https://example.com/photo.jpg",
    "bio": ""
  }
}
```

✅ **Cookie automatically set** - no need to send token in response body

---

### **POST** `/api/auth/login`
Authenticates user and sets JWT in cookie.

**Request:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "photoURL": "https://example.com/photo.jpg",
    "bio": ""
  }
}
```

✅ **Cookie automatically set** - client doesn't need to store token

---

### **POST** `/api/auth/google`
Google OAuth login/registration and sets JWT in cookie.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@gmail.com",
  "photoURL": "https://lh3.googleusercontent.com/..."
}
```

**Response:**
```json
{
  "message": "Google login successful",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@gmail.com",
    "photoURL": "https://lh3.googleusercontent.com/...",
    "bio": ""
  }
}
```

---

### **POST** `/api/auth/logout` ⭐ (NEW)
Clears the JWT cookie from the browser.

**Request:**
```
POST /api/auth/logout
```

**Response:**
```json
{
  "message": "Logout successful"
}
```

✅ **Token automatically cleared** - user is logged out

---

## 🛡️ Protected Routes

All protected routes now use the `protectRoute` middleware and automatically extract the JWT from cookies. No additional configuration needed!

### **Already Protected Routes:**
- `GET /api/users/me` - Get current user profile
- `PATCH /api/users/me` - Update user profile
- `POST /api/ideas` - Create a new idea
- `PUT /api/ideas/:id` - Update idea (owner only)
- `DELETE /api/ideas/:id` - Delete idea (owner only)
- `GET /api/my-ideas` - Get all user's ideas
- `PATCH /api/ideas/:id/like` - Toggle like on idea
- `POST /api/ideas/:id/comments` - Add comment
- `PUT /api/comments/:commentId` - Edit comment (owner only)
- `DELETE /api/comments/:commentId` - Delete comment (owner only)
- `GET /api/my-interactions` - Get user's commented ideas
- `GET /api/bookmarks` - Get bookmarked ideas
- `PATCH /api/ideas/:id/bookmark` - Toggle bookmark

### **How It Works:**
When you send a request to a protected route, the middleware:
1. Reads the JWT from `authToken` cookie
2. Verifies it's valid and not expired
3. Attaches user data to `req.user`:
   ```javascript
   req.user = {
     id: user._id,
     email: user.email,
     name: user.name
   }
   ```
4. Route handler can use `req.user.id`, `req.user.email`, etc.

---

## 💻 Frontend Integration

### **Browser Automatically Handles Cookies**
The browser automatically sends cookies with each request. Ensure:

1. **CORS Credentials Enabled:**
   ```javascript
   // In your fetch/axios calls
   fetch('/api/protected-route', {
     credentials: 'include', // IMPORTANT: Send cookies with request
   })

   // or with Axios
   axios.defaults.withCredentials = true;
   ```

2. **After Login:**
   - User is logged in ✅
   - Token is stored in HTTP-Only cookie (secure, invisible to JavaScript)
   - Token automatically sent with every request

3. **After Logout:**
   - Call `POST /api/auth/logout`
   - Cookie is cleared
   - User is logged out ✅

### **Example React Code:**
```javascript
// Login
const handleLogin = async (email, password) => {
  const response = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Send cookies
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  console.log('User logged in:', data.user);
};

// Access protected route
const getMyProfile = async () => {
  const response = await fetch('http://localhost:5000/api/users/me', {
    credentials: 'include', // Send cookies (includes JWT)
  });
  const profile = await response.json();
  console.log('My profile:', profile);
};

// Logout
const handleLogout = async () => {
  await fetch('http://localhost:5000/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  console.log('User logged out');
};
```

---

## 🔒 Security Features

| Feature | Benefit |
|---------|---------|
| **httpOnly: true** | Cookie cannot be accessed by JavaScript, preventing XSS attacks |
| **secure: true** (in production) | Cookie only sent over HTTPS |
| **sameSite: 'lax'** | Provides CSRF protection |
| **1-day expiration** | Limits token lifespan, reduces damage from stolen tokens |
| **Server-side JWT verification** | Backend validates every request |
| **Password hashing** | Passwords encrypted with bcryptjs |

---

## ⚙️ Environment Variables

Add to your `.env` file:

```env
PORT=5000
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/
JWT_SECRET=your_very_long_random_secret_key_here_at_least_32_chars
NODE_ENV=development  # Change to 'production' for deployment
CLIENT_URL=http://localhost:3000
```

**Important:** In production, set `NODE_ENV=production` to enable HTTPS-only cookies.

---

## 🧪 Testing with Postman/Thunder Client

### **Step 1: Register/Login**
```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "testPassword123"
}
```

✅ Check "Cookies" tab - you'll see `authToken` cookie

### **Step 2: Access Protected Route**
```
GET http://localhost:5000/api/users/me
```

✅ The cookie is automatically sent, no Authorization header needed

### **Step 3: Logout**
```
POST http://localhost:5000/api/auth/logout
```

✅ Cookie is cleared

---

## 📝 Code Changes Summary

### **Files Modified:**
1. **middleware/auth.js** - Updated with new middleware and 1-day token expiration
2. **index.js** - Added cookie-parser, updated auth routes, changed `verifyToken` to `protectRoute`

### **What Changed:**
- ✅ JWT now stored in HTTP-Only cookies (not in response body)
- ✅ Token extraction from cookies (not Authorization header)
- ✅ 1-day expiration (was 7 days)
- ✅ New logout endpoint
- ✅ All protected routes use `protectRoute` middleware
- ✅ `req.user` object properly populated with id, email, name

---

## 🚀 Next Steps

1. **Install cookie-parser:**
   ```bash
   npm install cookie-parser
   ```

2. **Test the auth routes** using Postman/Thunder Client

3. **Update frontend** to:
   - Enable `credentials: 'include'` in fetch/axios
   - Remove manual token storage from localStorage
   - Remove Authorization header (cookies handle it)

4. **Deploy:** Set `NODE_ENV=production` for HTTPS-only secure cookies

---

## ❓ FAQ

**Q: Why HTTP-Only cookies instead of localStorage?**
A: HTTP-Only cookies prevent XSS attacks (malicious scripts can't steal tokens). localStorage is accessible to JavaScript.

**Q: Why sameSite: 'lax'?**
A: Prevents CSRF attacks by limiting cross-site cookie sending.

**Q: Can I extend the token expiration?**
A: Change `expiresIn: '1d'` in `middleware/auth.js` to `'7d'`, `'30d'`, etc.

**Q: What if I need Authorization header for some routes?**
A: Keep using `authenticateToken` middleware for those specific routes (legacy support included).

---

✨ **Your backend is now secure and production-ready!**
