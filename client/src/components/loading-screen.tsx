import { useEffect, useState } from "react";
import { Loader2, Search, Brain, CheckCircle } from "lucide-react";

interface ProcessStep {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  duration: number; // milliseconds
}

const PROCESS_STEPS: ProcessStep[] = [
  {
    id: "search",
    label: "Searching YouTube",
    description: "Finding educational videos related to your topic...",
    icon: Search,
    duration: 8000
  },
  {
    id: "analyze",
    label: "AI Analysis",
    description: "Claude AI is analyzing video content and quality...",
    icon: Brain,
    duration: 15000
  },
  {
    id: "curate",
    label: "Curating Selection",
    description: "Selecting the best videos for your time limit...",
    icon: CheckCircle,
    duration: 5000
  }
];

export default function LoadingScreen() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    let totalTime = 0;

    PROCESS_STEPS.forEach((step, index) => {
      // Start this step
      const startTimer = setTimeout(() => {
        setCurrentStepIndex(index);
      }, totalTime);
      timers.push(startTimer);

      // Complete this step
      const completeTimer = setTimeout(() => {
        setCompletedSteps(prev => new Set([...Array.from(prev), step.id]));
      }, totalTime + step.duration);
      timers.push(completeTimer);

      totalTime += step.duration;
    });

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, []);

  const currentStep = PROCESS_STEPS[currentStepIndex];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-white">
      <div className="text-center max-w-md w-full">
        {/* Main loading indicator */}
        <div className="mb-8">
          <Loader2 className="h-16 w-16 animate-spin text-red-600 mb-4 mx-auto" />
          <h2 className="text-xl font-medium text-gray-900 mb-2">Curating Videos</h2>
        </div>

        {/* Process steps */}
        <div className="space-y-4">
          {PROCESS_STEPS.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isCompleted = completedSteps.has(step.id);
            const isPending = index > currentStepIndex;
            
            return (
              <div 
                key={step.id}
                className={`flex items-center p-3 rounded-lg border transition-all duration-300 ${
                  isActive 
                    ? 'border-red-200 bg-red-50' 
                    : isCompleted 
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  isActive 
                    ? 'bg-red-600 text-white' 
                    : isCompleted 
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-300 text-gray-600'
                }`}>
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <step.icon className={`w-5 h-5 ${isActive ? 'animate-pulse' : ''}`} />
                  )}
                </div>
                
                <div className="ml-3 text-left">
                  <div className={`font-medium ${
                    isActive 
                      ? 'text-red-700' 
                      : isCompleted 
                      ? 'text-green-700'
                      : 'text-gray-500'
                  }`}>
                    {step.label}
                  </div>
                  {isActive && (
                    <div className="text-sm text-red-600 mt-1">
                      {step.description}
                    </div>
                  )}
                </div>
                
                {isActive && (
                  <div className="ml-auto">
                    <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress indicator */}
        <div className="mt-6">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Progress</span>
            <span>{Math.round(((currentStepIndex + 1) / PROCESS_STEPS.length) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-red-600 h-2 rounded-full transition-all duration-1000 ease-out"
              style={{ 
                width: `${((currentStepIndex + 1) / PROCESS_STEPS.length) * 100}%` 
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
