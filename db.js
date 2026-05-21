const { MongoClient, ServerApiVersion } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config();

const uri = process.env.MONGO_URL;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Cache the connected database so we connect only once
let db = null;

async function connectDB() {
  if (db) return db;
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    console.log('✅ Pinged your deployment. Successfully connected to MongoDB!');
    db = client.db('ideavault');
    return db;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    throw error;
  }
}

// Collection helpers
function getCollections(database) {
  return {
    usersCollection: database.collection('users'),
    ideasCollection: database.collection('ideas'),
    commentsCollection: database.collection('comments'),
    bookmarksCollection: database.collection('bookmarks'),
  };
}

module.exports = { connectDB, getCollections, client };
