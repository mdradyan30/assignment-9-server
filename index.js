const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { connectDB, getCollections } = require('./db');
const { generateToken, verifyToken } = require('./middleware/auth');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- Middleware ----------
app.use(
  cors({
    origin: process.env. CLIENT_URL || '*',
    credentials: true,
  })
);
app.use(express.json());

// ---------- Server bootstrap ----------
async function run() {
  const db = await connectDB();
  const { usersCollection, ideasCollection, commentsCollection, bookmarksCollection } =
    getCollections(db);

  // =========================================================
  //  ROOT
  // =========================================================
  app.get('/', (req, res) => {
    res.send('IdeaVault API is running ');
  });

  // =========================================================
  //  AUTH ROUTES
  // =========================================================

  // Register (password/email) - creates user, hashes password, returns JWT
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, photoURL, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email and password are required' });
      }

      const existing = await usersCollection.findOne({ email });
      if (existing) {
        return res.status(409).json({ message: 'An account with this email already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = {
        name,
        email,
        photoURL: photoURL || '',
        password: hashedPassword,
        provider: 'credentials',
        bio: '',
        createdAt: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);
      const user = { ...newUser, _id: result.insertedId };
      const token = generateToken(user);

      res.status(201).json({
        message: 'Registration successful',
        token,
        user: {
          id: result.insertedId,
          name: user.name,
          email: user.email,
          photoURL: user.photoURL,
          bio: user.bio,
        },
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ message: 'Server error during registration' });
    }
  });

  // Login (email/password)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      const user = await usersCollection.findOne({ email });
      if (!user || !user.password) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const token = generateToken(user);

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          photoURL: user.photoURL,
          bio: user.bio || '',
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error during login' });
    }
  });

  // Google login — upserts the user, then issues a JWT
  app.post('/api/auth/google', async (req, res) => {
    try {
      const { name, email, photoURL } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required for Google login' });
      }

      let user = await usersCollection.findOne({ email });

      if (!user) {
        const newUser = {
          name: name || 'Google User',
          email,
          photoURL: photoURL || '',
          provider: 'google',
          bio: '',
          createdAt: new Date(),
        };
        const result = await usersCollection.insertOne(newUser);
        user = { ...newUser, _id: result.insertedId };
      }

      const token = generateToken(user);

      res.json({
        message: 'Google login successful',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          photoURL: user.photoURL,
          bio: user.bio || '',
        },
      });
    } catch (error) {
      console.error('Google login error:', error);
      res.status(500).json({ message: 'Server error during Google login' });
    }
  });

  // =========================================================
  //  USER PROFILE ROUTES
  // =========================================================

  // Get current user's profile
  app.get('/api/users/me', verifyToken, async (req, res) => {
    try {
      const user = await usersCollection.findOne(
        { _id: new ObjectId(req.user.id) },
        { projection: { password: 0 } }
      );
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json(user);
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Update profile
  app.patch('/api/users/me', verifyToken, async (req, res) => {
    try {
      const { name, photoURL, bio } = req.body;
      const updateFields = {};
      if (name !== undefined) updateFields.name = name;
      if (photoURL !== undefined) updateFields.photoURL = photoURL;
      if (bio !== undefined) updateFields.bio = bio;

      await usersCollection.updateOne(
        { _id: new ObjectId(req.user.id) },
        { $set: updateFields }
      );

      const updated = await usersCollection.findOne(
        { _id: new ObjectId(req.user.id) },
        { projection: { password: 0 } }
      );
      res.json({ message: 'Profile updated', user: updated });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // =========================================================
  //  IDEA ROUTES
  // =========================================================

  // Get all ideas — supports search, category filter, date range, limit
  app.get('/api/ideas', async (req, res) => {
    try {
      const { search, category, limit, sort, startDate, endDate } = req.query;
      const query = {};

      // Case-insensitive search by title
      if (search) {
        query.title = { $regex: search, $options: 'i' };
      }

      // Filter by category
      if (category && category !== 'All') {
        query.category = category;
      }

      // Optional date range filter
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }

      let cursor = ideasCollection.find(query);

      // Trending sort = most liked + recent
      if (sort === 'trending') {
        cursor = cursor.sort({ likesCount: -1, createdAt: -1 });
      } else {
        cursor = cursor.sort({ createdAt: -1 });
      }

      if (limit) {
        cursor = cursor.limit(parseInt(limit));
      }

      const ideas = await cursor.toArray();
      res.json(ideas);
    } catch (error) {
      console.error('Get ideas error:', error);
      res.status(500).json({ message: 'Server error fetching ideas' });
    }
  });

  // Trending ideas (top 6 by likes + recency)
  app.get('/api/ideas/trending', async (req, res) => {
    try {
      const ideas = await ideasCollection
        .find({})
        .sort({ likesCount: -1, createdAt: -1 })
        .limit(6)
        .toArray();
      res.json(ideas);
    } catch (error) {
      console.error('Trending error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Get a single idea by id
  app.get('/api/ideas/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid idea id' });
      }
      const idea = await ideasCollection.findOne({ _id: new ObjectId(id) });
      if (!idea) return res.status(404).json({ message: 'Idea not found' });
      res.json(idea);
    } catch (error) {
      console.error('Get idea error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Create a new idea (protected)
  app.post('/api/ideas', verifyToken, async (req, res) => {
    try {
      const {
        title,
        shortDescription,
        detailedDescription,
        category,
        tags,
        imageURL,
        estimatedBudget,
        targetAudience,
        problemStatement,
        proposedSolution,
      } = req.body;

      if (!title || !shortDescription || !detailedDescription || !category) {
        return res
          .status(400)
          .json({ message: 'Title, descriptions and category are required' });
      }

      const newIdea = {
        title,
        shortDescription,
        detailedDescription,
        category,
        tags: Array.isArray(tags) ? tags : tags ? [tags] : [],
        imageURL: imageURL || '',
        estimatedBudget: estimatedBudget || '',
        targetAudience: targetAudience || '',
        problemStatement: problemStatement || '',
        proposedSolution: proposedSolution || '',
        authorId: req.user.id,
        authorName: req.user.name,
        authorEmail: req.user.email,
        likes: [],
        likesCount: 0,
        commentsCount: 0,
        createdAt: new Date(),
      };

      const result = await ideasCollection.insertOne(newIdea);
      res.status(201).json({
        message: 'Idea submitted successfully',
        idea: { ...newIdea, _id: result.insertedId },
      });
    } catch (error) {
      console.error('Create idea error:', error);
      res.status(500).json({ message: 'Server error creating idea' });
    }
  });

  // Update an idea (protected, owner only)
  app.put('/api/ideas/:id', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid idea id' });
      }

      const idea = await ideasCollection.findOne({ _id: new ObjectId(id) });
      if (!idea) return res.status(404).json({ message: 'Idea not found' });
      if (idea.authorId !== req.user.id) {
        return res.status(403).json({ message: 'You can only edit your own ideas' });
      }

      const allowed = [
        'title',
        'shortDescription',
        'detailedDescription',
        'category',
        'tags',
        'imageURL',
        'estimatedBudget',
        'targetAudience',
        'problemStatement',
        'proposedSolution',
      ];
      const updateFields = {};
      allowed.forEach((key) => {
        if (req.body[key] !== undefined) updateFields[key] = req.body[key];
      });

      await ideasCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      const updated = await ideasCollection.findOne({ _id: new ObjectId(id) });
      res.json({ message: 'Idea updated successfully', idea: updated });
    } catch (error) {
      console.error('Update idea error:', error);
      res.status(500).json({ message: 'Server error updating idea' });
    }
  });

  // Delete an idea (protected, owner only)
  app.delete('/api/ideas/:id', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid idea id' });
      }

      const idea = await ideasCollection.findOne({ _id: new ObjectId(id) });
      if (!idea) return res.status(404).json({ message: 'Idea not found' });
      if (idea.authorId !== req.user.id) {
        return res.status(403).json({ message: 'You can only delete your own ideas' });
      }

      await ideasCollection.deleteOne({ _id: new ObjectId(id) });
      await commentsCollection.deleteMany({ ideaId: id });

      res.json({ message: 'Idea deleted successfully' });
    } catch (error) {
      console.error('Delete idea error:', error);
      res.status(500).json({ message: 'Server error deleting idea' });
    }
  });

  // Get ideas created by the logged-in user
  app.get('/api/my-ideas', verifyToken, async (req, res) => {
    try {
      const ideas = await ideasCollection
        .find({ authorId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();
      res.json(ideas);
    } catch (error) {
      console.error('My ideas error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Toggle like on an idea (protected)
  app.patch('/api/ideas/:id/like', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid idea id' });
      }

      const idea = await ideasCollection.findOne({ _id: new ObjectId(id) });
      if (!idea) return res.status(404).json({ message: 'Idea not found' });

      const likes = idea.likes || [];
      const hasLiked = likes.includes(req.user.id);

      const update = hasLiked
        ? { $pull: { likes: req.user.id }, $inc: { likesCount: -1 } }
        : { $addToSet: { likes: req.user.id }, $inc: { likesCount: 1 } };

      await ideasCollection.updateOne({ _id: new ObjectId(id) }, update);
      const updated = await ideasCollection.findOne({ _id: new ObjectId(id) });

      res.json({
        message: hasLiked ? 'Like removed' : 'Idea liked',
        liked: !hasLiked,
        likesCount: updated.likesCount,
      });
    } catch (error) {
      console.error('Like error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // =========================================================
  //  COMMENT ROUTES
  // =========================================================

  // Get comments for an idea
  app.get('/api/ideas/:id/comments', async (req, res) => {
    try {
      const { id } = req.params;
      const comments = await commentsCollection
        .find({ ideaId: id })
        .sort({ createdAt: -1 })
        .toArray();
      res.json(comments);
    } catch (error) {
      console.error('Get comments error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Add a comment (protected)
  app.post('/api/ideas/:id/comments', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { text } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({ message: 'Comment text is required' });
      }
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid idea id' });
      }

      const newComment = {
        ideaId: id,
        text: text.trim(),
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        createdAt: new Date(),
      };

      const result = await commentsCollection.insertOne(newComment);
      await ideasCollection.updateOne(
        { _id: new ObjectId(id) },
        { $inc: { commentsCount: 1 } }
      );

      res.status(201).json({
        message: 'Comment added',
        comment: { ...newComment, _id: result.insertedId },
      });
    } catch (error) {
      console.error('Add comment error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Edit a comment (protected, owner only)
  app.put('/api/comments/:commentId', verifyToken, async (req, res) => {
    try {
      const { commentId } = req.params;
      const { text } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({ message: 'Comment text is required' });
      }
      if (!ObjectId.isValid(commentId)) {
        return res.status(400).json({ message: 'Invalid comment id' });
      }

      const comment = await commentsCollection.findOne({
        _id: new ObjectId(commentId),
      });
      if (!comment) return res.status(404).json({ message: 'Comment not found' });
      if (comment.userId !== req.user.id) {
        return res.status(403).json({ message: 'You can only edit your own comments' });
      }

      await commentsCollection.updateOne(
        { _id: new ObjectId(commentId) },
        { $set: { text: text.trim(), editedAt: new Date() } }
      );

      const updated = await commentsCollection.findOne({
        _id: new ObjectId(commentId),
      });
      res.json({ message: 'Comment updated', comment: updated });
    } catch (error) {
      console.error('Edit comment error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Delete a comment (protected, owner only)
  app.delete('/api/comments/:commentId', verifyToken, async (req, res) => {
    try {
      const { commentId } = req.params;
      if (!ObjectId.isValid(commentId)) {
        return res.status(400).json({ message: 'Invalid comment id' });
      }

      const comment = await commentsCollection.findOne({
        _id: new ObjectId(commentId),
      });
      if (!comment) return res.status(404).json({ message: 'Comment not found' });
      if (comment.userId !== req.user.id) {
        return res
          .status(403)
          .json({ message: 'You can only delete your own comments' });
      }

      await commentsCollection.deleteOne({ _id: new ObjectId(commentId) });
      if (ObjectId.isValid(comment.ideaId)) {
        await ideasCollection.updateOne(
          { _id: new ObjectId(comment.ideaId) },
          { $inc: { commentsCount: -1 } }
        );
      }

      res.json({ message: 'Comment deleted' });
    } catch (error) {
      console.error('Delete comment error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // =========================================================
  //  MY INTERACTIONS
  // =========================================================

  // All ideas the user has commented on
  app.get('/api/my-interactions', verifyToken, async (req, res) => {
    try {
      const myComments = await commentsCollection
        .find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();

      // Collect unique idea ids
      const ideaIds = [
        ...new Set(myComments.map((c) => c.ideaId).filter((id) => ObjectId.isValid(id))),
      ];

      const ideas = await ideasCollection
        .find({ _id: { $in: ideaIds.map((id) => new ObjectId(id)) } })
        .toArray();

      res.json({ comments: myComments, commentedIdeas: ideas });
    } catch (error) {
      console.error('My interactions error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // =========================================================
  //  BOOKMARK ROUTES (optional feature)
  // =========================================================

  app.get('/api/bookmarks', verifyToken, async (req, res) => {
    try {
      const bookmarks = await bookmarksCollection
        .find({ userId: req.user.id })
        .toArray();
      const ideaIds = bookmarks
        .map((b) => b.ideaId)
        .filter((id) => ObjectId.isValid(id));
      const ideas = await ideasCollection
        .find({ _id: { $in: ideaIds.map((id) => new ObjectId(id)) } })
        .toArray();
      res.json(ideas);
    } catch (error) {
      console.error('Get bookmarks error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.patch('/api/ideas/:id/bookmark', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid idea id' });
      }

      const existing = await bookmarksCollection.findOne({
        userId: req.user.id,
        ideaId: id,
      });

      if (existing) {
        await bookmarksCollection.deleteOne({ _id: existing._id });
        return res.json({ message: 'Bookmark removed', bookmarked: false });
      }

      await bookmarksCollection.insertOne({
        userId: req.user.id,
        ideaId: id,
        createdAt: new Date(),
      });
      res.json({ message: 'Idea bookmarked', bookmarked: true });
    } catch (error) {
      console.error('Bookmark error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // =========================================================
  //  404 fallback
  // =========================================================
  app.use((req, res) => {
    res.status(404).json({ message: 'API route not found' });
  });

  // Start listening only after DB is ready
  app.listen(PORT, () => {
    console.log(`🚀 IdeaVault server listening on port ${PORT}`);
  });
}

run().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
