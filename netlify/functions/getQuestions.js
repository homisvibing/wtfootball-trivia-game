require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI;

console.log('Attempting to connect with URI:', uri ? uri.substring(0, uri.indexOf('@') + 1) + '***' : 'URI not found');

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  if (!uri) {
    console.error('MONGODB_URI environment variable is not set.');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'MongoDB URI is not configured.' }),
    };
  }

  try {
    await client.connect();
    const db = client.db("wtfootball-trivia-game"); // Connect to your specific database

    // --- NEW CODE START ---
    const questionsCollection = db.collection("questions"); // Access the 'questions' collection
    const questions = await questionsCollection.find({}).toArray(); // Fetch all documents (questions)

    let message = '';
    if (questions.length > 0) {
      message = `Successfully connected to MongoDB and fetched ${questions.length} questions!`;
    } else {
      message = `Successfully connected to MongoDB, but no questions found in 'questions' collection.`;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: message,
        questions: questions // Send the fetched questions array
      }),
    };
    // --- NEW CODE END ---

  } catch (e) {
    console.error('MongoDB Operation Error:', e); // Changed error message for clarity
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch questions from database.', details: e.message }), // Added details for debugging
    };
  } finally {
    await client.close();
  }
};