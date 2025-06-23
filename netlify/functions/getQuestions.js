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

                // Fetch enough random matches to get a good pool for questions and incorrect answers
                // We need at least one for the question, and then a few more for options.
                // Let's fetch 10 random matches to ensure enough unique team names.
                const sampleMatches = await matchesCollection.aggregate([
                    { $sample: { size: 10 } }
                ]).toArray();

                if (sampleMatches.length < 4) { // Still need at least 4 for basic question + 3 options
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
                    correctAnswer = "It was a draw";
                }

                // --- Generate incorrect options ---
                const incorrectOptionsSet = new Set(); // Use a Set to ensure unique options
                let optionsToFind = 2; // We need two incorrect options

                // First, try to get team names from other sample matches
                for (let i = 1; i < sampleMatches.length && incorrectOptionsSet.size < optionsToFind; i++) {
                    const match = sampleMatches[i];
                    if (match.home_team.home_team_name !== correctAnswer) {
                        incorrectOptionsSet.add(match.home_team.home_team_name);
                    }
                    if (incorrectOptionsSet.size < optionsToFind && match.away_team.away_team_name !== correctAnswer) {
                        incorrectOptionsSet.add(match.away_team.away_team_name);
                    }
                }

                // If "It was a draw" is not the correct answer, add it as an option if we still need one
                if (correctAnswer !== "It was a draw" && incorrectOptionsSet.size < optionsToFind) {
                    incorrectOptionsSet.add("It was a draw");
                }

                // Convert Set to Array and ensure we only take the required number
                const incorrectOptions = Array.from(incorrectOptionsSet).slice(0, optionsToFind);

                // Ensure we have exactly 2 incorrect options. If not, fill with generic names or repeat.
                // This part can be made more sophisticated later, e.g., by querying other teams in the competition.
                while (incorrectOptions.length < optionsToFind) {
                    incorrectOptions.push("Another Team"); // Fallback if not enough unique teams found
                }


                // Combine all options and shuffle them
                const allOptions = [correctAnswer, ...incorrectOptions].filter(Boolean); // Filter out any null/undefined
                // Shuffle function (Fisher-Yates)
                for (let i = allOptions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
                }

                // --- Structure the final question object ---
                const triviaQuestion = {
                    id: questionMatch.match_id,
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