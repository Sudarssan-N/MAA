import React from 'react';
import clsx from 'clsx';

interface QuickReplyButtonsProps {
  handleSend: (text: string) => void;
  isProcessing: boolean;
  sessionError: boolean;
  suggestions?: string[];
  suggestionType?: 'reason' | 'time' | 'location' | 'confirmation';
}

const QuickReplyButtons: React.FC<QuickReplyButtonsProps> = ({
  handleSend,
  isProcessing,
  sessionError,
  suggestions = [],
  suggestionType = 'reason',
}) => {
  // Default suggestions if none provided
  const defaultSuggestions = [
    { text: 'Book for loan consultation', label: 'Loan Consultation' },
    { text: 'Book for opening new account', label: 'Open New Account' },
    { text: 'Book for credit card application', label: 'Credit Card Application' },
  ];

  // Map suggestions to buttons
  const buttons = suggestions.length > 0
    ? suggestions.map((suggestion, index) => {
        let label = suggestion;
        if (suggestionType === 'reason') {
          // Clean up "Book for ..." prefix for display
          label = suggestion.replace(/^Book for\s+/i, '');
        } else if (suggestionType === 'time') {
          // Shorten time suggestions if needed
          label = suggestion.replace(/ at /, ' @ ');
        }
        return { text: suggestion, label: label.charAt(0).toUpperCase() + label.slice(1) };
      })
    : defaultSuggestions;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {buttons.map((button, index) => (
        <button
          key={index}
          onClick={() => handleSend(button.text)}
          disabled={isProcessing || sessionError}
          className={clsx(
            'px-4 py-2 rounded-lg text-white text-sm whitespace-normal inline-block transition-colors',
            suggestionType === 'reason' ? 'bg-[#CD1309] hover:bg-red-700' :
            suggestionType === 'time' ? 'bg-blue-500 hover:bg-blue-600' :
            suggestionType === 'location' ? 'bg-green-500 hover:bg-green-600' :
            'bg-gray-500 hover:bg-gray-600',
            'disabled:opacity-50'
          )}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
};

export default QuickReplyButtons;