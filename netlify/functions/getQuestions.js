// netlify/functions/getQuestions.js
const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed. Please use GET.' })
        };
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db("wtfootball-trivia-game");
        const matchesCollection = database.collection("matches_data");

        const sampleMatches = await matchesCollection.aggregate([
            { $sample: { size: 4 } } // Get 4 random match documents (one for correct, three for incorrect options)
        ]).toArray();

        if (sampleMatches.length < 4) { // Ensure we have enough matches to create options
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Not enough unique match data in the database to generate a question. Need at least 4 matches." })
            };
        }

        // --- Select one match to be the basis of the question ---
        const questionMatch = sampleMatches[0];

        // --- Formulate the question ---
        const questionText = `Who won the match between ${questionMatch.home_team.home_team_name} and ${questionMatch.away_team.away_team_name} on ${new Date(questionMatch.match_date).toLocaleDateString()}?`;

        // --- Determine the correct answer ---
        let correctAnswer;
        if (questionMatch.home_score > questionMatch.away_score) {
            correctAnswer = questionMatch.home_team.home_team_name;
        } else if (questionMatch.away_score > questionMatch.home_score) {
            correctAnswer = questionMatch.away_team.away_team_name;
        } else {
            correctAnswer = "It was a draw"; // Or you can filter out draws for now
        }

        // --- Generate incorrect options ---
        const incorrectOptions = [];
        // Use other sample matches to get team names for incorrect options
        for (let i = 1; i < sampleMatches.length; i++) {
            const otherMatch = sampleMatches[i];
            if (otherMatch.home_team.home_team_name !== correctAnswer && otherMatch.away_team.away_team_name !== correctAnswer) {
                // Add one of their teams as an incorrect option, ensure it's not the correct answer
                incorrectOptions.push(otherMatch.home_team.home_team_name);
                if (incorrectOptions.length === 2) break; // We need 2 incorrect options
            }
        }

        // Add "It was a draw" as an incorrect option if it's not the correct answer and not already present
        if (correctAnswer !== "It was a draw" && !incorrectOptions.includes("It was a draw")) {
            incorrectOptions.push("It was a draw");
        }

        // Trim incorrect options to 2 if more were generated
        while (incorrectOptions.length > 2) {
            incorrectOptions.pop();
        }

        // Combine all options and shuffle them
        const allOptions = [correctAnswer, ...incorrectOptions].filter(Boolean); // Filter out any null/undefined
        // Shuffle function (Fisher-Yates)
        for (let i = allOptions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
        }

        // --- Structure the final question object as your frontend likely expects ---
        const triviaQuestion = {
            id: questionMatch.match_id, // Use match ID as a unique ID for the question
            question: questionText,
            options: allOptions,
            correctAnswer: correctAnswer
        };

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify([triviaQuestion]) // Send an array containing one question object
        };

    } catch (error) {
        console.error("Error fetching or formulating questions:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Error fetching or formulating questions: " + error.message })
        };
    } finally {
        if (client) {
            await client.close();
        }
    }
};