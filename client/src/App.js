// This is a conceptual example, likely in client/src/App.js or a game component
import React, { useState, useEffect } from 'react';
import './App.css'; // Assuming you have a CSS file

function App() {
  const [question, setQuestion] = useState(null); // State to hold the fetched question
  const [loading, setLoading] = useState(true); // State to indicate loading status
  const [error, setError] = useState(null); // State to hold any error messages

  useEffect(() => {
    // This effect runs once when the component mounts
    const fetchQuestion = async () => {
      try {
        const response = await fetch('/.netlify/functions/getQuestions');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch questions');
        }
        const data = await response.json();
        
        // Assuming the backend sends an array, and we want the first question
        if (data && data.length > 0) {
          setQuestion(data[0]);
        } else {
          setQuestion(null); // No questions received
        }
      } catch (err) {
        console.error("Error fetching question:", err);
        setError(err.message);
      } finally {
        setLoading(false); // Done loading, regardless of success or error
      }
    };

    fetchQuestion();
  }, []); // Empty dependency array means this effect runs only once on mount

  if (loading) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Football Trivia Game</h1>
          <p>Loading question...</p>
        </header>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Football Trivia Game</h1>
          <p>Error: {error}</p>
        </header>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Football Trivia Game</h1>
          <p>No question available. Please check the backend setup.</p>
        </header>
      </div>
    );
  }

  // If we have a question, render it
  return (
    <div className="App">
      <header className="App-header">
        <h1>Football Trivia Game</h1>
        <p>{question.question}</p>
        <div className="options-container">
          {question.options.map((option, index) => (
            <button key={index} className="option-button">
              {option}
            </button>
          ))}
        </div>
        {/* You'll add logic here for checking answers, next question, etc. */}
        {/* For now, just confirming the question and options appear */}
      </header>
    </div>
  );
}

export default App;