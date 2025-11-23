interface ProgressBarProps {
  completed: number;
  total: number;
  className?: string;
  showText?: boolean;
}

export default function ProgressBar({ completed, total, className = "", showText = true }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  return (
    <div className={`w-full ${className}`}>
      {showText && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium text-gray-700">
            {completed} of {total} completed
          </span>
          <span className="text-sm text-gray-500">{percentage}%</span>
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}