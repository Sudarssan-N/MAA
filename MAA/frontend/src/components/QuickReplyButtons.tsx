import React from 'react';

interface QuickReplyButtonsProps {
  handleSend: (text: string) => void;
  isProcessing: boolean;
  sessionError: boolean;
  suggestions?: string[];
}

const QuickReplyButtons: React.FC<QuickReplyButtonsProps> = ({ 
  handleSend, 
  isProcessing, 
  sessionError,
  suggestions = []
}) => {
  // Default suggestions if none are provided
  const defaultSuggestions = [
    { text: "Book an appointment for tomorrow", label: "Book for tomorrow" },
    { text: "Show my upcoming appointments", label: "My appointments" },
    { text: "Find nearest branch", label: "Find branch" },
    { text: "I need help with my account", label: "Account help" }
  ];

  // If we have dynamic suggestions, use those instead of the defaults
  const buttons = suggestions.length > 0 
    ? suggestions.map((suggestion, index) => ({
        text: suggestion,
        label: suggestion // Show the full text without truncation
      }))
    : defaultSuggestions;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {buttons.map((button, index) => (
        <button
          key={index}
          onClick={() => handleSend(button.text)}
          disabled={isProcessing || sessionError}
          className="px-4 py-2 bg-[#CD1309] text-white rounded-lg hover:bg-red-700 transition-colors text-sm whitespace-normal inline-block"
        >
          {button.label}
        </button>
      ))}
    </div>
  );
};

export default QuickReplyButtons;
