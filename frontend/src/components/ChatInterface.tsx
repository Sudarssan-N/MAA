import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Send, MessageSquare, AlertCircle, CheckCircle, Mic, Bookmark } from 'lucide-react';
import clsx from 'clsx';
import QuickReplyButtons from './QuickReplyButtons';

// SpeechRecognition support
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface ChatInterfaceProps {
  isLoggedIn: boolean;
  userName: string;
  userType: 'guest' | 'customer' | null;
  token?: string | null; // Kept for compatibility, but not used
  isGuidedMode: boolean;
  onReasonChange: (reason: string | undefined) => void;
  onToggleRecommendations: () => void;
}

export interface ChatInterfaceHandle {
  handleSend: (text: string) => void;
}

interface Message {
  text: string;
  type: 'assistant' | 'user';
  isLoading?: boolean;
}

interface AppointmentDetails {
  Reason_for_Visit__c: string | null;
  Appointment_Date__c: string | null;
  Appointment_Time__c: string | null;
  Location__c: string | null;
  Customer_Type__c: string | null;
  Id?: string;
}

const API_BASE_URL = 'http://localhost:3000/api';

const CUSTOMER_PROMPTS = [
  "I need an appointment with my preferred banker and branch",
  "Reschedule my upcoming appointment to next Tuesday at 2pm",
  "Find me a branch within 5 miles with 24hrs Drive-thru ATM service"
];
const GUEST_PROMPTS = [
  "I'm new and want to open an account",
  "I need help with a loan application",
  "Can I schedule an appointment for tomorrow?"
];

const PLACEHOLDER_SUGGESTIONS = [
  "For Example .... Book an appointment for next Monday 2pm at Manhattan for a loan consultation",
  "For Example .... Find me the nearest branch with 24hrs Check Deposit with drive-thru service",
  "For Example .... Reschedule my upcoming appointment on 6th March at 3pm",
  "For Example .... Check my upcoming bookings",
];

const GUIDED_REASONS = [
  "Open a new account",
  "Apply for a credit card",
  "Manage spending and saving",
  "Build credit and reduce debt",
  "Death of a loved one",
  "Questions or assistance with MYBANK products and services",
  "Save for retirement",
];

type GuidedStep = 'reason' | 'date' | 'location' | 'confirmation' | 'completed' | 'reasonSelection' | 'timeSelection' | 'locationSelection';

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
  const [llmDateSuggestions, setLLMDateSuggestions] = useState<{ display: string; raw: string }[]>([]);
  const [selectedDateTime, setSelectedDateTime] = useState<{ display: string; raw: string }>({ display: '', raw: '' });
  const [llmLocationOptions, setLLMLocationOptions] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [overrideUsed, setOverrideUsed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any | null>(null);
  const retryCount = useRef(0);
  const MAX_RETRIES = 2;

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [currentPlaceholder, setCurrentPlaceholder] = useState('');
  const [charIndex, setCharIndex] = useState(0);

  // State for dynamic quick reply suggestions
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);

  // Default prompts for unguided flow
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

  const chatWithAssistant = async (query: string) => {
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

    // Get dynamic suggested replies
    try {
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
          sfData: appointmentStatus.details ? {
            appointments: [appointmentStatus.details],
            customerInfo: {
              Customer_Type__c: userType === 'customer' ? 'Regular' : 'Guest',
              Preferred_Branch__c: appointmentStatus.details.Location__c
            }
          } : null
        }),
      });

      if (suggestionsResponse.ok) {
        const suggestionsData = await suggestionsResponse.json();
        if (suggestionsData.suggestions && Array.isArray(suggestionsData.suggestions)) {
          setSuggestedReplies(suggestionsData.suggestions);
        }
      } else {
        setSuggestedReplies([
          "Book an appointment",
          "Find nearest branch",
          "Check my appointments",
          "I need help"
        ]);
      }
    } catch (error) {
      console.error('Error fetching suggested replies:', error);
      setSuggestedReplies([
        "Book an appointment",
        "Find nearest branch",
        "Check my appointments",
        "I need help"
      ]);
    }

    return {
      response: data.response,
      appointmentDetails: data.appointmentDetails || null,
      missingFields: data.missingFields || [],
    };
  };

  useEffect(() => {
    if (guidedStep === 'completed') {
      fetchAppointmentStatus();
    }
  }, [guidedStep]);

  useEffect(() => {
    // Fetch initial chat state when logged in
    const fetchInitialState = async () => {
      if (isLoggedIn) {
        try {
          const response = await fetch(`${API_BASE_URL}/chat/state`, {
            credentials: 'include',
          });
          if (response.ok) {
            const data = await response.json();
            console.log('Fetched chat state:', data); // Debug log
            if (data.messages && Array.isArray(data.messages)) {
              const formattedMessages = data.messages.map((msg: any) => {
                if (msg.role === 'assistant' && typeof msg.content === 'string') {
                  try {
                    const parsed = JSON.parse(msg.content);
                    return { type: 'assistant', text: parsed.response || msg.content };
                  } catch (e) {
                    console.warn('Failed to parse assistant message content:', e);
                    return { type: 'assistant', text: msg.content };
                  }
                }
                return { type: msg.role === 'assistant' ? 'assistant' : 'user', text: msg.content };
              });
              setMessages(formattedMessages);
            }
            setAppointmentStatus({ details: data.appointmentDetails, missingFields: [] });
          } else if (response.status === 401) {
            setSessionError(true);
            setMessages([{ type: 'assistant', text: 'Session expired. Please log in again.' }]);
          }
        } catch (error) {
          console.error('Error fetching initial chat state:', error);
          setMessages([{ type: 'assistant', text: 'Error loading chat. Please try again.' }]);
        }
      }
    };
    fetchInitialState();
  }, [isLoggedIn]);

  useEffect(() => {
    // SpeechRecognition setup...
  }, []);

  useEffect(() => {
    // Placeholder typing effect...
  }, [charIndex, placeholderIndex, input, isProcessing, sessionError, isRecording]);

  useEffect(() => {
   const fetchInitialState = async () => {
      try {
        console.log('Fetching initial chat state...');
        const response = await fetch(`${API_BASE_URL}/chat/state`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        });
        if (!response.ok) {
          if (response.status === 401) {
            const healthy = await checkSessionHealth();
            if (healthy) {
              console.log('Session valid, retrying initial state fetch...');
              fetchInitialState();
              return;
            }
          }
          console.log('Failed to fetch initial state, using default messages');
          // setMessages(getDefaultMessages());
          const defaultMessages = await getDefaultMessages();
          setMessages(defaultMessages);
          return;
        }
        const { messages: initialMessages, appointmentDetails } = await response.json();
        console.log('Received initial state:', { initialMessages, appointmentDetails });

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
                      console.error('Error parsing message content:', e);
                      return msg.content;
                    }
                  })(),
              type: msg.role === 'user' ? 'user' : 'assistant',
            }));
          // setMessages(parsedMessages.length > 0 ? parsedMessages : getDefaultMessages());
          if (parsedMessages.length > 0) {
            setMessages(parsedMessages);
          } else {
            const defaultMessages = await getDefaultMessages();
            setMessages(defaultMessages);
          }
        } else {
          console.log('No initial messages, using default messages');
          const defaultMessages = await getDefaultMessages();
          setMessages(defaultMessages);
        }
        if (appointmentDetails) {
          setAppointmentStatus({ details: appointmentDetails, missingFields: [] });
        }
      } catch (error) {
        console.error('Failed to fetch initial state:', error);
        const defaultMessages = await getDefaultMessages();
        setMessages(defaultMessages);
      }
    };
    checkSessionHealth().then(async (healthy) => {
    if (healthy) {
      await fetchInitialState();
    } else {
      console.log('Session unhealthy, setting default messages');
      setSessionError(true);
      const defaultMessages = await getDefaultMessages();
      setMessages(defaultMessages);
    }
    });
  }, [token]);


  // Generate personalized greeting based on customer type and chat history
  const generatePersonalizedGreeting = async (customerType: string, chatHistory?: any[], username?: string) => {
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
          username
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.greeting;
    } catch (error) {
      console.error('Error generating personalized greeting:', error);
      // Return fallback greeting
      return `Welcome${username ? `, ${username}` : ''}! How can I assist you today?`;
    }
  };

  // Replcae with new variant

  // const getDefaultMessages = (): Message[] => {
  //   const greeting = userType === 'customer' && userName ? 
  //     `Welcome back, ${userName}! How can I assist you with your banking needs today?` : 
  //     `Welcome to MyBank appointment booking! How can I help you today?`;
      
  //   return [
  //     { type: 'assistant', text: greeting },
  //     { type: 'assistant', text: "I can help you schedule an appointment, find a branch, or answer questions about our services. Just let me know what you need!" },
  //   ];
  // };
  const getDefaultMessages = async (): Promise<Message[]> => {
  try {
    const customerType = userType === 'customer' ? 'Regular' : 'Guest';
    const chatHistoryForGreeting = messages.map(msg => ({
      role: msg.type === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));

    const personalizedGreeting = await generatePersonalizedGreeting(
      customerType,
      chatHistoryForGreeting,
      userName
    );
    
    return [
      { type: 'assistant', text: personalizedGreeting },
      { type: 'assistant', text: "I can help you schedule an appointment, find a branch, or answer questions about our services. Just let me know what you need!" },
    ];
  } catch (error) {
    console.error('Error generating personalized greeting, using fallback:', error);
    
    // Fallback to hardcoded greeting
    const greeting = userType === 'customer' && userName ? 
      `Welcome back, ${userName}! How can I assist you with your banking needs today?` : 
      `Welcome to MyBank appointment booking! How can I help you today?`;
      
    return [
      { type: 'assistant', text: greeting },
      { type: 'assistant', text: "I can help you schedule an appointment, find a branch, or answer questions about our services. Just let me know what you need!" },
    ];
  }
};

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Unguided free-form send
  const handleSend = async (text: string = input) => {
    if (!text.trim() || isProcessing) return;
    
    setIsProcessing(true);
    setMessages(prev => [...prev, { type: 'user', text }]);
    setInput('');
    setMessages(prev => [...prev, { type: 'assistant', text: 'Working...', isLoading: true }]);

    try {
      if (sessionError) {
        const isHealthy = await checkSessionHealth();
        if (!isHealthy) throw new Error('Session is not available');
        setSessionError(false);
      }
      const { response, appointmentDetails, missingFields } = await chatWithAssistant(text);
      setMessages(prev => prev.filter(msg => !msg.isLoading));
      setMessages(prev => [...prev, { type: 'assistant', text: response }]);
      setAppointmentStatus({ details: appointmentDetails, missingFields });
      await fetchAppointmentStatus();
    } catch (error) {
      console.error('Error in chat:', error);
      setMessages(prev => prev.filter(msg => !msg.isLoading));
      if (String(error).includes('Session')) {
        setSessionError(true);
        setMessages(prev => [...prev, {
          type: 'assistant',
          text: 'I lost our conversation history. Please try again or refresh the page.'
        }]);
      } else {
        setMessages(prev => [...prev, { type: 'assistant', text: 'Sorry, something went wrong. Please try again!' }]);
      }
    } finally {
      setIsProcessing(false);
    }
  };


  // const handleReasonSelection = async (reason: string) => {
  //   setSelectedReason(reason);
  //   setMessages(prev => [...prev, { type: 'user', text: reason }]);
  //   setIsProcessing(true);
  //   try {
  //     const data = await callGuidedFlow(reason, 'reasonSelection');
  //     if (data.timeSlots && Array.isArray(data.timeSlots)) {
  //       setLLMDateSuggestions(data.timeSlots);
  //     }

  //     const updatedMessages: Message[] = [
  //       ...messages.filter(msg => !msg.isLoading),
  //       { type: 'user' as const, text: reason },
  //       { type: 'assistant' as const, text: data.response || "Here are some suggested appointment slots..." }
  //     ];

  //     setMessages(updatedMessages);
  //     setGuidedStep('date');

  //     try {
  //       const suggestionsResponse = await fetch(`${API_BASE_URL}/suggestedReplies`, {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //         credentials: 'include',
  //         body: JSON.stringify({
  //           chatHistory: messages,
  //           userQuery: reason,
  //           userType: userType === 'customer' ? 'Regular' : 'Guest',
  //           sfData: {
  //             appointments: appointmentStatus.details ? [appointmentStatus.details] : [],
  //             customerInfo: {
  //               Customer_Type__c: userType === 'customer' ? 'Regular' : 'Guest'
  //             }
  //           }
  //         }),
  //       });

  //       if (suggestionsResponse.ok) {
  //         const suggestionsData = await suggestionsResponse.json();
  //         if (suggestionsData.suggestions && Array.isArray(suggestionsData.suggestions)) {
  //           setSuggestedReplies(suggestionsData.suggestions);
  //         }
  //       }
  //     } catch (error) {
  //       console.error('Error fetching suggested replies during reason selection:', error);
  //       setSuggestedReplies([
  //         "Tomorrow afternoon",
  //         "Next Monday",
  //         "This Friday"
  //       ]);
  //     }
  //   } catch (error) {
  //     console.error('Error in guided flow (reason):', error);
  //     setMessages(prev => [...prev, {
  //       type: 'assistant',
  //       text: 'Error retrieving date suggestions. Please try again.'
  //     }]);
  //   } finally {
  //     setIsProcessing(false);
  //   }
  // };

  const handleTimeSelection = async (slot: { display: string; raw: string }) => {
    // Implementation...
  };

  const handleLocationSelection = async (loc: string) => {
    // Implementation...
  };

  const handleConfirmAppointment = async () =>{
    setMessages(prev => [...prev, { type: 'user', text: 'Confirm appointment' }]);
    setIsProcessing(true);
    try {
      
      setMessages(prev => [
        ...prev.filter(msg => !msg.isLoading),
        { type: 'assistant', text: "Your appointment has been booked." }
      ]);
      
      setGuidedStep('completed');
      setSelectedReason('');
      setSelectedDateTime({ display: '', raw: '' });
      setSelectedLocation('');
      setLLMDateSuggestions([]);
      setLLMLocationOptions([]);
    } catch (error) {
      console.error('Error confirming appointment:', error);
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: 'Could not confirm appointment. Please try again.'
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMicClick = () => {
    if (!recognitionRef.current) {
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: 'Speech recognition is not supported in your browser.'
      }]);
      return;
    }
    if (!navigator.onLine) {
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: 'Your device appears to be offline. Speech recognition requires an internet connection.'
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
          text: 'Could not start speech recognition. Please try again.'
        }]);
      }
    }
  };

  const renderAppointmentStatus = async () => {
    const { details } = appointmentStatus;
    const chatHistory = messages.map(msg => ({ type: msg.type, text: msg.text }));
    if (!details || !details.Id) return null;
    console.log('Prompt for confirmation :', JSON.stringify({ text: input, chatHistory }));

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

    console.log('Is confirmed', isConfirmed);

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
    // Implementation...
  };

  const reloadDateSuggestions = async () => {
    // Implementation...
  };

  const resetSession = () => {
    // Implementation...
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
        {isGuidedMode ? (
          <>      

            <QuickReplyButtons
              handleSend={handleSend}
              isProcessing={isProcessing}
              sessionError={sessionError}
              suggestions={suggestedReplies}
            />

            <div className="flex space-x-2 mt-4">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder={currentPlaceholder || "Type your message..."}
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
          </>
        ) : (
          <>
            <QuickReplyButtons
              handleSend={handleSend}
              isProcessing={isProcessing}
              sessionError={sessionError}
              suggestions={suggestedReplies}
            />

            <div className="flex space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder={currentPlaceholder || "Type your message..."}
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
          </>
        )}
      </div>
    </div>
  );
});

export default ChatInterface;