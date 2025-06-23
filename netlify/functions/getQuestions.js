// netlify/functions/getQuestions.js
const { MongoClient } = require('mongodb');
require('dotenv').config(); // For local development on your machine

const uri = process.env.MONGODB_URI;

exports.handler = async function(event, context) {
    // Ensure only GET requests are allowed for fetching questions (standard practice)
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed. Please use GET.' })
        };
    }

    const client = new MongoClient(uri); // Client is now declared inside the handler

    try {
        await client.connect();
        const database = client.db("wtfootball-trivia-game"); // Replace with your database name if different
        const matchesCollection = database.collection("matches_data");

        // --- Fetch a few random matches to test ---
        // In a real scenario, you'd add more complex logic to select
        // specific data points and generate well-formed questions.
        const sampleMatches = await matchesCollection.aggregate([
            { $sample: { size: 3 } } // Get 3 random match documents
        ]).toArray();

        // For now, let's just return the raw match data to the frontend
        // so we can confirm the function is working and fetching from the new collection.
        if (sampleMatches.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "No matches found in the database." })
            };
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(sampleMatches) // Send the raw match data
        };

    } catch (error) {
        console.error("Error fetching questions from database:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Error connecting to backend or fetching questions: " + error.message })
        };
    } finally {
        if (client) {
            await client.close();
        }
    }
};