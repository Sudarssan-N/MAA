import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Send, MessageSquare, AlertCircle, CheckCircle, Mic, Bookmark } from 'lucide-react';
import clsx from 'clsx';
import QuickReplyButtons from './QuickReplyButtons';
import { ChatInterfaceProps, ChatInterfaceHandle, Message, AppointmentDetails, GuidedStep } from './types';

// SpeechRecognition support
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const API_BASE_URL = 'http://localhost:3000/api';

const CUSTOMER_PROMPTS = [
  'I need an appointment with my preferred banker and branch',
  'Reschedule my upcoming appointment to next Tuesday at 2pm',
  'Find me a branch within 5 miles with 24hrs Drive-thru ATM service',
];
const GUEST_PROMPTS = [
  'I’m new and want to open an account',
  'I need help with a loan application',
  'Can I schedule an appointment for tomorrow?',
];

const PLACEHOLDER_SUGGESTIONS = [
  'For Example .... Book an appointment for next Monday 2pm at Manhattan for a loan consultation',
  'For Example .... Find me the nearest branch with 24hrs Check Deposit with drive-thru service',
  'For Example .... Reschedule my upcoming appointment on 6th March at 3pm',
  'For Example .... Check my upcoming bookings',
];
const debounce = (func: (...args: any[]) => void, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

function formatAppointmentTime(isoDateTime: string | null): string {
  if (!isoDateTime) return '(Not specified)';
  const date = new Date(isoDateTime);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  let formatted = date.toLocaleString('en-US', options);
  formatted = formatted.replace(/(\d+),/, '$1th,');
  return formatted;
}

async function generatePersonalizedGreeting(customerType: string, chatHistory: any[] = [], username?: string): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/generate-greeting`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        customerType,
        chatHistory,
        username,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.greeting;
  } catch (error) {
    console.error('Error generating personalized greeting:', error);
    return `Welcome${username ? `, ${username}` : ''}! How can I assist you today?`;
  }
}

const ChatInterface = forwardRef<ChatInterfaceHandle, ChatInterfaceProps>(({
  isLoggedIn,
  userName,
  userType,
  token,
  isGuidedMode,
  onReasonChange,
  onToggleRecommendations,
}, ref) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionError, setSessionError] = useState<boolean>(false);
  const [appointmentStatusComponent, setAppointmentStatusComponent] = useState<JSX.Element | null>(null);
  const [appointmentStatus, setAppointmentStatus] = useState<{
    details: AppointmentDetails | null;
    missingFields: string[];
  }>({ details: null, missingFields: [] });

  // Guided flow states
  const [guidedStep, setGuidedStep] = useState<GuidedStep>('reason');
  const [selectedReason, setSelectedReason] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [suggestionType, setSuggestionType] = useState<'reason' | 'time' | 'location' | 'confirmation'>('reason');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any | null>(null);
  const retryCount = useRef(0);
  const MAX_RETRIES = 2;

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [currentPlaceholder, setCurrentPlaceholder] = useState('');
  const [charIndex, setCharIndex] = useState(0);

  // State for dynamic quick reply suggestions
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);

  const prompts = userType === 'customer' ? CUSTOMER_PROMPTS : GUEST_PROMPTS;

  const fetchAppointmentStatus = async () => {
    const component = await renderAppointmentStatus();
    setAppointmentStatusComponent(component);
  };

  useImperativeHandle(ref, () => ({
    handleSend,
  }));

  const checkSessionHealth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/session-health`, {
        credentials: 'include',
      });
      return response.ok;
    } catch (error) {
      console.error('Error checking session health:', error);
      return false;
    }
  };

  const chatWithAssistant = async (query: string, step: GuidedStep = guidedStep) => {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({
        query,
        customerType: userType === 'customer' ? 'Regular' : 'Guest',
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired or invalid');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Fetch suggested replies
    const suggestionsResponse = await fetch(`${API_BASE_URL}/suggestedReplies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        chatHistory: messages,
        userQuery: query,
        userType: userType === 'customer' ? 'Regular' : 'Guest',
        sfData: {
          appointments: appointmentStatus.details ? [appointmentStatus.details] : [],
          customerInfo: {
            Customer_Type__c: userType === 'customer' ? 'Regular' : 'Guest',
            Preferred_Branch__c: appointmentStatus.details?.Location__c,
            Contact__c: '003dM000005H5A7QAK',
          },
        },
        missingFields: data.missingFields || [],
        guidedFlow: {
          reason: selectedReason || null,
          date: selectedDate || null,
          time: selectedTime || null,
          location: selectedLocation || null,
        },
      }),
    });

    let suggestions = [];
    if (suggestionsResponse.ok) {
      const suggestionsData = await suggestionsResponse.json();
      if (suggestionsData.suggestions && Array.isArray(suggestionsData.suggestions)) {
        suggestions = suggestionsData.suggestions;
      }
    }

    return {
      response: data.response,
      appointmentDetails: data.appointmentDetails || null,
      missingFields: data.missingFields || [],
      suggestions,
    };
  };

  const getDefaultMessages = async (): Promise<Message[]> => {
    try {
      const customerType = userType === 'customer' ? 'Regular' : 'Guest';
      const chatHistoryForGreeting = messages.map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.text,
      }));

      const personalizedGreeting = await generatePersonalizedGreeting(customerType, chatHistoryForGreeting, userName);

      return [
        { type: 'assistant', text: personalizedGreeting },
        { type: 'assistant', text: 'I can help you schedule an appointment, find a branch, or answer questions about our services. Just let me know what you need!' },
      ];
    } catch (error) {
      console.error('Error generating personalized greeting:', error);
      const greeting = userType === 'customer' && userName
        ? `Welcome back, ${userName}! How can I assist you with your banking needs today?`
        : `Welcome to MyBank appointment booking! How can I help you today?`;
      return [
        { type: 'assistant', text: greeting },
        { type: 'assistant', text: 'I can help you schedule an appointment, find a branch, or answer questions about our services. Just let me know what you need!' },
      ];
    }
  };

  // SpeechRecognition setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      let finalTranscript = '';
      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        setInput(finalTranscript + interimTranscript);
        if (finalTranscript) {
          finalTranscript = ''; // Reset final transcript after processing
        }
      };

      recognitionRef.current.onstart = () => {
        setIsRecording(true);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
        if (input.trim()) {
          handleSend(input); // Auto-send if there's input
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        setMessages(prev => [...prev, {
          type: 'assistant',
          text: `Speech recognition error: ${event.error}. Please try again.`,
        }]);
      };
    }
  }, [input]);

  // Placeholder typing effect
  useEffect(() => {
    if (input || isProcessing || sessionError || isRecording) {
      setCurrentPlaceholder('');
      return;
    }

    const currentText = PLACEHOLDER_SUGGESTIONS[placeholderIndex];
    const typingSpeed = 50;
    const pauseDuration = 2000;

    if (charIndex < currentText.length) {
      const timeout = setTimeout(() => {
        setCurrentPlaceholder(currentText.slice(0, charIndex + 1));
        setCharIndex(charIndex + 1);
      }, typingSpeed);
      return () => clearTimeout(timeout);
    } else {
      const timeout = setTimeout(() => {
        setCharIndex(0);
        setPlaceholderIndex((placeholderIndex + 1) % PLACEHOLDER_SUGGESTIONS.length);
      }, pauseDuration);
      return () => clearTimeout(timeout);
    }
  }, [charIndex, placeholderIndex, input, isProcessing, sessionError, isRecording]);

  useEffect(() => {
    const fetchInitialState = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/chat/state`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        });
        if (!response.ok) {
          if (response.status === 401) {
            const healthy = await checkSessionHealth();
            if (healthy) {
              fetchInitialState();
              return;
            }
          }
          const defaultMessages = await getDefaultMessages();
          setMessages(defaultMessages);
          return;
        }
        const { messages: initialMessages, appointmentDetails } = await response.json();
        if (initialMessages && initialMessages.length > 0) {
          const parsedMessages = initialMessages
            .filter((msg: any) => msg.role !== 'system')
            .map((msg: any) => ({
              text: msg.role === 'user'
                ? msg.content
                : (() => {
                    try {
                      const parsed = JSON.parse(msg.content);
                      return parsed.response || msg.content;
                    } catch (e) {
                      return msg.content;
                    }
                  })(),
              type: msg.role === 'user' ? 'user' : 'assistant',
            }));
          setMessages(parsedMessages.length > 0 ? parsedMessages : await getDefaultMessages());
        } else {
          setMessages(await getDefaultMessages());
        }
        if (appointmentDetails) {
          setAppointmentStatus({ details: appointmentDetails, missingFields: [] });
          setSelectedReason(appointmentDetails.Reason_for_Visit__c || '');
          setSelectedDate(appointmentDetails.Appointment_Date__c || '');
          setSelectedTime(appointmentDetails.Appointment_Time__c || '');
          setSelectedLocation(appointmentDetails.Location__c || '');
          setGuidedStep(appointmentDetails.Id ? 'completed' : 'reason');
        }
        // Fetch initial suggestions
        const suggestionsResponse = await fetch(`${API_BASE_URL}/suggestedReplies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            chatHistory: [],
            userQuery: '',
            userType: userType === 'customer' ? 'Regular' : 'Guest',
            sfData: {
              appointments: appointmentDetails ? [appointmentDetails] : [],
              customerInfo: {
                Customer_Type__c: userType === 'customer' ? 'Regular' : 'Guest',
                Contact__c: '003dM000005H5A7QAK',
              },
            },
            missingFields: [],
            guidedFlow: {
              reason: appointmentDetails?.Reason_for_Visit__c || null,
              date: selectedDate || null,
              time: selectedTime || null,
              location: selectedLocation || null,
            },
          }),
        });
        if (suggestionsResponse.ok) {
          const { suggestions } = await suggestionsResponse.json();
          setSuggestedReplies(suggestions || []);
        }
      } catch (error) {
        console.error('Failed to fetch initial state:', error);
        setMessages(await getDefaultMessages());
      }
    };
    checkSessionHealth().then(async (healthy) => {
      if (healthy) {
        await fetchInitialState();
      } else {
        setSessionError(true);
        setMessages(await getDefaultMessages());
      }
    });
  }, [token, userType, userName]);

  useEffect(() => {
    if (guidedStep === 'completed') {
      fetchAppointmentStatus();
    }
  }, [guidedStep]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = debounce(async (text: string = input) => {
    if (!text.trim() || isProcessing) return;

    setIsProcessing(true);
    setMessages(prev => [...prev, { type: 'user', text }]);
    setInput('');

    try {
      if (sessionError) {
        const isHealthy = await checkSessionHealth();
        if (!isHealthy) throw new Error('Session is not available');
        setSessionError(false);
      }

      let nextStep = guidedStep;
      let suggestionTypeUpdate = suggestionType;

      if (guidedStep === 'reason' && text.match(/Book for\s+(.+)/i)) {
        const reason = text.match(/Book for\s+(.+)/i)?.[1] || text;
        setSelectedReason(reason);
        onReasonChange(reason);
        nextStep = 'time';
        suggestionTypeUpdate = 'time';
      } else if (guidedStep === 'time' && text.match(/\b(tomorrow|next|this)\b/i)) {
        const timeMatch = text.match(/at\s+(\d{1,2}:\d{2}\s*(AM|PM))/i);
        const dateMatch = text.match(/\b(tomorrow|next\s+\w+|this\s+\w+)\b/i);
        if (dateMatch) setSelectedDate(dateMatch[0]);
        if (timeMatch) setSelectedTime(timeMatch[0]);
        nextStep = 'location';
        suggestionTypeUpdate = 'location';
      } else if (guidedStep === 'location' && text.match(/\b(Brooklyn|Manhattan|New York)\b/i)) {
        const location = text.match(/\b(Brooklyn|Manhattan|New York)\b/i)?.[0] || text;
        setSelectedLocation(location);
        nextStep = 'confirmation';
        suggestionTypeUpdate = 'confirmation';
      } else if (guidedStep === 'confirmation' && text.toLowerCase().includes('confirm')) {
        nextStep = 'completed';
        suggestionTypeUpdate = 'reason';
      }

      const { response, appointmentDetails, missingFields, suggestions } = await chatWithAssistant(text, nextStep);
      setMessages(prev => [...prev, { type: 'assistant', text: response }]);
      setAppointmentStatus({ details: appointmentDetails, missingFields });
      setSuggestedReplies(suggestions || []);
      setSuggestionType(suggestionTypeUpdate);

      if (nextStep === 'completed') {
        setSelectedReason('');
        setSelectedDate('');
        setSelectedTime('');
        setSelectedLocation('');
      }
      setGuidedStep(nextStep);

      await fetchAppointmentStatus();
    } catch (error) {
      console.error('Error in chat:', error);
      setMessages(prev => [...prev, { type: 'assistant', text: 'Sorry, something went wrong. Please try again!' }]);
      if (String(error).includes('Session')) {
        setSessionError(true);
        setMessages(prev => [...prev, {
          type: 'assistant',
          text: 'I lost our conversation history. Please try again or refresh the page.',
        }]);
      }
    } finally {
      setIsProcessing(false);
    }
  }, 500);

  const handleMicClick = () => {
    if (!recognitionRef.current) {
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: 'Speech recognition is not supported in your browser.',
      }]);
      return;
    }
    if (!navigator.onLine) {
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: 'Your device appears to be offline. Speech recognition requires an internet connection.',
      }]);
      return;
    }
    if (isRecording) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error('Error stopping recognition:', e);
        setIsRecording(false);
      }
    } else {
      setInput('');
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Error starting recognition:', e);
        setIsRecording(false);
        setMessages(prev => [...prev, {
          type: 'assistant',
          text: 'Could not start speech recognition. Please try again.',
        }]);
      }
    }
  };

  const renderAppointmentStatus = async () => {
    const { details } = appointmentStatus;
    const chatHistory = messages.map(msg => ({ type: msg.type, text: msg.text }));
    if (!details || !details.Id) return null;

    const response = await fetch(`${API_BASE_URL}/verify-confirmation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ text: input, chatHistory }),
    });

    const { isConfirmed } = await response.json();

    if (!isConfirmed) return null;

    return (
      <div className="p-4 mx-4 my-2 bg-white rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <h3 className="font-medium">Appointment Confirmation</h3>
        </div>
        <div className="space-y-1 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="text-gray-500">Purpose:</div>
            <div>{details?.Reason_for_Visit__c || '(Not specified)'}</div>
            <div className="text-gray-500">Date & Time:</div>
            <div>{formatAppointmentTime(details?.Appointment_Time__c ?? null)}</div>
            <div className="text-gray-500">Location:</div>
            <div>{details?.Location__c || '(Not specified)'}</div>
          </div>
          {details?.Id && (
            <p className="mt-2 text-gray-600 text-xs">
              Appointment ID: {details.Id}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={clsx(
              'p-3 rounded-lg max-w-[85%]',
              message.type === 'assistant'
                ? 'mr-auto bg-gray-100 text-gray-800'
                : 'ml-auto bg-[#CD1309] text-white'
            )}
          >
            {message.isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-pulse">...</div>
                <span>{message.text}</span>
              </div>
            ) : (
              message.text
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {appointmentStatusComponent}

      <div className="border-t p-4">
        <QuickReplyButtons
          handleSend={handleSend}
          isProcessing={isProcessing}
          sessionError={sessionError}
          suggestions={suggestedReplies}
          suggestionType={suggestionType}
        />

        <div className="flex space-x-2 mt-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder={currentPlaceholder || 'Type your message...'}
            disabled={isProcessing || sessionError || isRecording}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CD1309] disabled:opacity-50"
          />
          <button
            onClick={handleMicClick}
            disabled={isProcessing || sessionError}
            className={clsx(
              'px-4 py-2 rounded-lg transition-colors flex items-center justify-center',
              isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-200 text-gray-800 hover:bg-gray-300',
              'disabled:opacity-50'
            )}
          >
            <Mic className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleSend()}
            disabled={isProcessing || sessionError || !input.trim() || isRecording}
            className="px-4 py-2 bg-[#CD1309] text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:bg-gray-400"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default ChatInterface;