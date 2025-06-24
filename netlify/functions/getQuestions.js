// netlify/functions/getQuestions.js
const { MongoClient } = require('mongodb');
require('dotenv').config(); // For local development on your machine

const uri = process.env.MONGODB_URI;

// Helper function to format question details (country, comp, season, stage/week)
function getQuestionDetails(match) {
    const competitionName = match.competition.competition_name;
    const seasonName = match.season.season_name;
    const countryName = match.competition.country_name || (match.stadium && match.stadium.country && match.stadium.country.name) || ''; // Get country from competition or stadium

    let stageOrWeek = '';
    if (match.competition_stage && match.competition_stage.name && match.competition_stage.name !== 'Regular Season') {
        // For tournaments or specific stages
        stageOrWeek = ` (${match.competition_stage.name})`;
    } else if (match.match_week) {
        // For leagues
        stageOrWeek = ` Week ${match.match_week}`;
    }

    return `at ${countryName} ${competitionName} ${seasonName}${stageOrWeek}`;
}


// --- Question Type 1: Match Outcome Question ---
async function generateMatchOutcomeQuestion(matchesCollection, sampleMatches) {
    const questionMatch = sampleMatches[0]; // Use the first sampled match as the question basis
    const details = getQuestionDetails(questionMatch);

    const questionText = `Who won the match between ${questionMatch.home_team.home_team_name} vs ${questionMatch.away_team.away_team_name} ${details}?`;

    let correctAnswer;
    if (questionMatch.home_score > questionMatch.away_score) {
        correctAnswer = questionMatch.home_team.home_team_name;
    } else if (questionMatch.away_score > questionMatch.home_score) {
        correctAnswer = questionMatch.away_team.away_team_name;
    } else {
        correctAnswer = "It was a draw";
    }

    // --- Generate incorrect options from the sampleMatches pool ---
    const incorrectOptionsSet = new Set();
    const optionsToFind = 2;

    const allSampleTeamNames = new Set();
    sampleMatches.forEach(match => {
        allSampleTeamNames.add(match.home_team.home_team_name);
        allSampleTeamNames.add(match.away_team.away_team_name);
    });

    const usedOptions = new Set([correctAnswer, questionMatch.home_team.home_team_name, questionMatch.away_team.away_team_name]);

    const possibleIncorrectTeams = Array.from(allSampleTeamNames).filter(
        team => !usedOptions.has(team)
    );

    // Shuffle possible incorrect teams
    for (let i = possibleIncorrectTeams.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [possibleIncorrectTeams[i], possibleIncorrectTeams[j]] = [possibleIncorrectTeams[j], possibleIncorrectTeams[i]];
    }

    for (let i = 0; i < optionsToFind && i < possibleIncorrectTeams.length; i++) {
        incorrectOptionsSet.add(possibleIncorrectTeams[i]);
    }

    if (correctAnswer !== "It was a draw" && incorrectOptionsSet.size < optionsToFind) {
        incorrectOptionsSet.add("It was a draw");
    }

    while (incorrectOptionsSet.size < optionsToFind) {
        incorrectOptionsSet.add(`Other Team ${incorrectOptionsSet.size + 1}`);
    }

    const finalIncorrectOptions = Array.from(incorrectOptionsSet).slice(0, optionsToFind);

    // Combine all options and shuffle them
    const allOptions = [correctAnswer, ...finalIncorrectOptions].filter(Boolean);
    for (let i = allOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }

    return {
        id: questionMatch.match_id,
        question: questionText,
        options: allOptions,
        correctAnswer: correctAnswer
    };
}

// --- Question Type 2: Score Question ---
async function generateScoreQuestion(matchesCollection, sampleMatches) {
    const questionMatch = sampleMatches[0];
    const details = getQuestionDetails(questionMatch);

    const questionText = `What was the final score of the match between ${questionMatch.home_team.home_team_name} and ${questionMatch.away_team.away_team_name} ${details}?`;

    const correctAnswer = `${questionMatch.home_score} - ${questionMatch.away_score}`;

    const incorrectOptions = new Set();
    const commonScores = ["0 - 0", "1 - 0", "1 - 1", "2 - 0", "2 - 1", "3 - 0"];

    // Try to generate variations of the correct score
    const [home, away] = [questionMatch.home_score, questionMatch.away_score];
    if (`${home + 1} - ${away}` !== correctAnswer) incorrectOptions.add(`${home + 1} - ${away}`);
    if (`${home} - ${away + 1}` !== correctAnswer) incorrectOptions.add(`${home} - ${away + 1}`);
    if (`${home - 1} - ${away}` !== correctAnswer && home - 1 >= 0) incorrectOptions.add(`${home - 1} - ${away}`);
    if (`${home} - ${away - 1}` !== correctAnswer && away - 1 >= 0) incorrectOptions.add(`${home} - ${away - 1}`);

    // Add random common scores if needed
    let commonScoresShuffled = [...commonScores].sort(() => 0.5 - Math.random());
    for (const score of commonScoresShuffled) {
        if (incorrectOptions.size >= 2) break;
        if (score !== correctAnswer) {
            incorrectOptions.add(score);
        }
    }

    while (incorrectOptions.size < 2) {
        // Fallback: Generate completely random scores if still not enough
        const randHome = Math.floor(Math.random() * 4); // 0-3 goals
        const randAway = Math.floor(Math.random() * 4);
        const randomScore = `${randHome} - ${randAway}`;
        if (randomScore !== correctAnswer) {
            incorrectOptions.add(randomScore);
        }
    }

    const finalIncorrectOptions = Array.from(incorrectOptions).slice(0, 2);

    const allOptions = [correctAnswer, ...finalIncorrectOptions].filter(Boolean);
    for (let i = allOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }

    return {
        id: questionMatch.match_id,
        question: questionText,
        options: allOptions,
        correctAnswer: correctAnswer
    };
}


// --- Main Handler ---
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
        // const eventsCollection = database.collection("events_data"); // Will be used later

        const sampleMatches = await matchesCollection.aggregate([
            { $sample: { size: 10 } }
        ]).toArray();

        if (sampleMatches.length < 4) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Not enough unique match data in the database to generate a question. Need at least 4 matches." })
            };
        }

        // Randomly select question type
        const questionTypes = ['matchOutcome', 'score']; // Add more types here as they are implemented
        const selectedType = questionTypes[Math.floor(Math.random() * questionTypes.length)];

        let triviaQuestion;
        switch (selectedType) {
            case 'matchOutcome':
                triviaQuestion = await generateMatchOutcomeQuestion(matchesCollection, sampleMatches);
                break;
            case 'score':
                triviaQuestion = await generateScoreQuestion(matchesCollection, sampleMatches);
                break;
            // case 'goalScorer': // Will be implemented next
            //     triviaQuestion = await generateGoalScorerQuestion(matchesCollection, eventsCollection, sampleMatches);
            //     break;
            default:
                triviaQuestion = await generateMatchOutcomeQuestion(matchesCollection, sampleMatches); // Default fallback
        }


        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify([triviaQuestion])
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