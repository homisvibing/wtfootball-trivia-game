// netlify/functions/getQuestions.js (inside exports.handler try block)
        // ... (keep the initial part where you fetch 10 sample matches)

        // --- Generate incorrect options (Simplified approach to avoid large queries) ---
        const incorrectOptions = new Set();
        let optionsToFind = 2;

        // Try to get incorrect team names from other sample matches
        for (let i = 1; i < sampleMatches.length && incorrectOptions.size < optionsToFind; i++) {
            const match = sampleMatches[i];
            // Add home team if it's not the correct answer and not already in options
            if (match.home_team.home_team_name && match.home_team.home_team_name !== correctAnswer && !incorrectOptions.has(match.home_team.home_team_name)) {
                incorrectOptions.add(match.home_team.home_team_name);
            }
            // Add away team if it's not the correct answer and not already in options
            if (incorrectOptions.size < optionsToFind && match.away_team.away_team_name && match.away_team.away_team_name !== correctAnswer && !incorrectOptions.has(match.away_team.away_team_name)) {
                incorrectOptions.add(match.away_team.away_team_name);
            }
        }

        // If "It was a draw" is not the correct answer, add it as an option if needed
        if (correctAnswer !== "It was a draw" && incorrectOptions.size < optionsToFind) {
            incorrectOptions.add("It was a draw");
        }

        // Convert Set to Array
        const finalIncorrectOptions = Array.from(incorrectOptions);

        // Ensure we have exactly 2 incorrect options. Fill with a fallback if needed.
        while (finalIncorrectOptions.length < optionsToFind) {
            finalIncorrectOptions.push("Random Team"); // Fallback for testing
        }

        // Slice to ensure only 2 are taken if more were somehow generated
        const slicedIncorrectOptions = finalIncorrectOptions.slice(0, optionsToFind);

        // Combine all options and shuffle them
        const allOptions = [correctAnswer, ...slicedIncorrectOptions].filter(Boolean); // Filter out any null/undefined

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
            body: JSON.stringify([triviaQuestion])
        };