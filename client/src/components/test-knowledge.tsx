import { useState } from "react";
import { Brain, CheckCircle, XCircle, ArrowLeft, RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type TopicProgress } from "../lib/progress";

interface TestKnowledgeProps {
  topicProgress: TopicProgress;
  onBack: () => void;
}

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export default function TestKnowledge({ topicProgress, onBack }: TestKnowledgeProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);

  // Generate contextual quiz questions based on the topic
  const generateQuizQuestions = (topic: string): QuizQuestion[] => {
    const baseQuestions = [
      {
        id: 1,
        question: `What is the most important foundational concept in ${topic}?`,
        options: [
          "Understanding the basic terminology and definitions",
          "Memorizing all the technical details",
          "Jumping straight to advanced techniques",
          "Watching videos without taking notes"
        ],
        correctAnswer: 0,
        explanation: "Building a strong foundation with key concepts and terminology is essential before advancing to more complex topics.",
        difficulty: 'beginner' as const
      },
      {
        id: 2,
        question: `When learning ${topic}, what's the best approach to retain information?`,
        options: [
          "Watch all videos at once without breaks",
          "Apply concepts through practice and examples",
          "Only focus on the most advanced content",
          "Skip the beginner-level material"
        ],
        correctAnswer: 1,
        explanation: "Active application and practice help solidify learning and improve long-term retention of concepts.",
        difficulty: 'intermediate' as const
      },
      {
        id: 3,
        question: `What should you do after completing a ${topic} learning sequence?`,
        options: [
          "Immediately start a completely different topic",
          "Review key concepts and test your understanding",
          "Forget about it and move on",
          "Only watch more advanced videos"
        ],
        correctAnswer: 1,
        explanation: "Reviewing and testing your knowledge helps reinforce learning and identify areas that need more attention.",
        difficulty: 'intermediate' as const
      },
      {
        id: 4,
        question: `How can you best apply your ${topic} knowledge in real situations?`,
        options: [
          "Just remember the theory from videos",
          "Start with complex projects immediately",
          "Practice with simple examples first, then progress to complex applications",
          "Only work on theoretical problems"
        ],
        correctAnswer: 2,
        explanation: "Progressive practice from simple to complex applications builds confidence and competence effectively.",
        difficulty: 'advanced' as const
      }
    ];

    return baseQuestions;
  };

  const quizQuestions = generateQuizQuestions(topicProgress.topic);
  const currentQuestion = quizQuestions[currentQuestionIndex];

  const handleAnswerSelect = (optionIndex: number) => {
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestionIndex] = optionIndex;
    setSelectedAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentQuestionIndex < quizQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      setQuizCompleted(true);
      setShowResults(true);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleRestartQuiz = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswers([]);
    setShowResults(false);
    setQuizCompleted(false);
  };

  const calculateScore = () => {
    const correctAnswers = selectedAnswers.filter((answer, index) => 
      answer === quizQuestions[index].correctAnswer
    ).length;
    return {
      correct: correctAnswers,
      total: quizQuestions.length,
      percentage: Math.round((correctAnswers / quizQuestions.length) * 100)
    };
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'beginner': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'advanced': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600 dark:text-green-400';
    if (percentage >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreMessage = (percentage: number) => {
    if (percentage >= 80) return "Excellent! You have a strong understanding of the topic.";
    if (percentage >= 60) return "Good job! You understand most concepts with room for improvement.";
    return "Keep learning! Review the concepts and try again.";
  };

  if (showResults) {
    const score = calculateScore();
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                <CardTitle>Quiz Results</CardTitle>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6 ml-12 mr-4">
            {/* Score Summary */}
            <div className="text-center bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
              <div className={`text-4xl font-bold mb-2 ${getScoreColor(score.percentage)}`}>
                {score.percentage}%
              </div>
              <div className="text-lg mb-2">
                {score.correct} out of {score.total} correct
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                {getScoreMessage(score.percentage)}
              </p>
            </div>

            {/* Question Review */}
            <div className="space-y-4">
              <h3 className="font-medium">Review Your Answers</h3>
              {quizQuestions.map((question, index) => {
                const userAnswer = selectedAnswers[index];
                const isCorrect = userAnswer === question.correctAnswer;
                
                return (
                  <Card key={question.id} className="border border-gray-200 dark:border-gray-700">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          {isCorrect ? (
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                          )}
                          <Badge className={`text-xs ${getDifficultyColor(question.difficulty)}`}>
                            {question.difficulty}
                          </Badge>
                        </div>
                        <span className="text-sm font-medium text-gray-500">
                          Question {index + 1}
                        </span>
                      </div>
                      
                      <h4 className="font-medium mb-3">{question.question}</h4>
                      
                      <div className="space-y-2 mb-3">
                        {question.options.map((option, optionIndex) => (
                          <div
                            key={optionIndex}
                            className={`p-2 rounded text-sm ${
                              optionIndex === question.correctAnswer
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                                : optionIndex === userAnswer && !isCorrect
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                                : 'bg-gray-50 dark:bg-gray-700'
                            }`}
                          >
                            {option}
                            {optionIndex === question.correctAnswer && (
                              <span className="ml-2 text-green-600 dark:text-green-400">✓ Correct</span>
                            )}
                            {optionIndex === userAnswer && !isCorrect && (
                              <span className="ml-2 text-red-600 dark:text-red-400">✗ Your answer</span>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      <div className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                        <strong>Explanation:</strong> {question.explanation}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={onBack}
                variant="outline"
                className="flex-1"
              >
                Back to Celebration
              </Button>
              <Button
                onClick={handleRestartQuiz}
                variant="default"
                className="flex-1"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Retake Quiz
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <CardTitle>Test Your Knowledge</CardTitle>
            </div>
          </div>
          <div className="ml-12">
            <p className="text-gray-600 dark:text-gray-400">
              Test what you learned about <strong>{topicProgress.topic}</strong>
            </p>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span>Question {currentQuestionIndex + 1} of {quizQuestions.length}</span>
              <Badge className={`text-xs ${getDifficultyColor(currentQuestion.difficulty)}`}>
                {currentQuestion.difficulty}
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 ml-12 mr-4">
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentQuestionIndex + 1) / quizQuestions.length) * 100}%` }}
            ></div>
          </div>

          {/* Question */}
          <div>
            <h3 className="font-medium text-lg mb-4">{currentQuestion.question}</h3>
            
            <div className="space-y-3">
              {currentQuestion.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleAnswerSelect(index)}
                  className={`w-full p-4 text-left rounded-lg border transition-all ${
                    selectedAnswers[currentQuestionIndex] === index
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      selectedAnswers[currentQuestionIndex] === index
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {selectedAnswers[currentQuestionIndex] === index && (
                        <div className="w-full h-full rounded-full bg-white scale-50"></div>
                      )}
                    </div>
                    <span>{option}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4">
            <Button
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0}
              variant="outline"
            >
              Previous
            </Button>
            
            <Button
              onClick={handleNext}
              disabled={selectedAnswers[currentQuestionIndex] === undefined}
              variant="default"
            >
              {currentQuestionIndex === quizQuestions.length - 1 ? 'Finish Quiz' : 'Next'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}