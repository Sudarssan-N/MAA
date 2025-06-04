import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Calendar, AlertCircle, CheckCircle, Mic, RefreshCw } from 'lucide-react';
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Send, MessageSquare, AlertCircle, CheckCircle, Mic, Bookmark } from 'lucide-react';
import clsx from 'clsx';

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface ChatInterfaceProps {
  isLoggedIn: boolean;
  userName: string;
  userType: 'guest' | 'customer' | null;
  token?: string | null;
  isGuidedMode: boolean;
}

interface Message {
  text: string;
  type: 'assistant' | 'user';
  isLoading?: boolean;
}

interface AppointmentDetails {
  Reason_for_Visit__c: string | null;
  Appointment_Time__c: string | null;
  Location__c: string | null;
  Customer_Type__c?: string | null;
  Id?: string;
}

const API_BASE_URL = 'http://localhost:3000/api';

const CUSTOMER_PROMPTS = [
  "I need an appointment with my preferred banker and branch",
  "Reschedule my upcoming appointment to next Tuesday at 2pm",
  "Find me a branch within 5 miles with 24hrs Drive-thru ATM service",
];
const GUEST_PROMPTS = [
  "I'm new and want to open an account",
  "I need help with a loan application",
  "Can I schedule an appointment for tomorrow?",
];

const PLACEHOLDER_SUGGESTIONS = [
  "For Example .... Book an appointment for next Monday 2pm at Manhattan for a loan consultation",
  "For Example .... Find me the nearest branch with 24hrs Check Deposit with drive-thru service",
  "For Example .... Reschedule my upcoming appointment on 6th March at 3pm",
  "For Example .... Check my upcoming bookings",
];

const REASONS = [
  "Open a new account",
  "Apply for a credit card",
  "Manage spending and saving",
  "Build credit and reduce debt",
  "Death of a loved one",
  "Questions or assistance with Wells Fargo products and services",
  "Save for retirement",
];

const LOCATIONS = ['Brooklyn', 'Manhattan', 'New York'];

const ChatInterface: React.FC<ChatInterfaceProps> = ({ isLoggedIn, userName, userType, token, isGuidedMode }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionError, setSessionError] = useState<boolean>(false);
  const [appointmentStatusComponent, setAppointmentStatusComponent] = useState<JSX.Element | null>(null);
  const [appointmentStatus, setAppointmentStatus] = useState<{
    details: AppointmentDetails | null;
    missingFields: string[];
  }>({
    details: null,
    missingFields: [],
  });
  const [sessionError, setSessionError] = useState<boolean>(false);
  const [guidedStep, setGuidedStep] = useState<'reason' | 'dateTime' | 'location' | 'confirmation' | null>(null);
  const [guidedData, setGuidedData] = useState<{
    reason?: string;
    dateTime?: string;
    location?: string;
    suggestedDateTimes?: string[];
    suggestedLocation?: string;
    appointmentDetails?: AppointmentDetails;
  }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const retryCount = useRef(0);
  const MAX_RETRIES = 2;

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [currentPlaceholder, setCurrentPlaceholder] = useState('');
  const [charIndex, setCharIndex] = useState(0);

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
      const response = await fetch(`${API_BASE_URL}/session-health`, { credentials: 'include' });
      return response.ok;
    } catch (error) {
      console.error('Session health check failed:', error);
      return false;
    }
  };

  const fetchGuidedSuggestions = async (step: string, data: any) => {
    setMessages(prev => [...prev, { type: 'assistant', text: 'Typing...', isLoading: true }]);
    console.log('Fetching suggestions for step:', step, 'with data:', data);
    const response = await fetch(`${API_BASE_URL}/guided-appointment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({
        step,
        customerType: userType === 'customer' ? 'Regular' : 'Guest',
        ...data,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('Session expired or invalid');
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (result.error) throw new Error(result.error);
    setMessages(prev => prev.filter(msg => !msg.isLoading));
    console.log('Received response:', result);
    return result;
  };

  const handleGuidedStep = async (value: string | boolean) => {
    setIsProcessing(true);
    try {
      let responseMessage = { type: 'assistant', text: '' };
      switch (guidedStep) {
        case 'reason': {
          const reason = value as string;
          setGuidedData({ reason });
          setMessages(prev => [...prev, { type: 'user', text: reason }]);
          const result = await fetchGuidedSuggestions('dateTime', { reason });
          responseMessage.text = result.prompt || "Please select a date and time for your appointment.";
          setGuidedData(prev => ({ ...prev, suggestedDateTimes: result.suggestedDateTimes }));
          setMessages(prev => [...prev, responseMessage]);
          setGuidedStep('dateTime');
          break;
        }
        case 'dateTime': {
          const dateTime = value as string;
          setGuidedData(prev => ({ ...prev, dateTime }));
          setMessages(prev => [...prev, { type: 'user', text: `Selected: ${dateTime}` }]);
          const result = await fetchGuidedSuggestions('location', { reason: guidedData.reason, dateTime });
          responseMessage.text = result.prompt || `Your preferred location is ${result.suggestedLocation}. Confirm or choose another?`;
          setGuidedData(prev => ({ ...prev, suggestedLocation: result.suggestedLocation }));
          setMessages(prev => [...prev, responseMessage]);
          setGuidedStep('location');
          break;
        }
        case 'location': {
          const location = typeof value === 'string' ? value : guidedData.suggestedLocation;
          setGuidedData(prev => ({ ...prev, location }));
          setMessages(prev => [...prev, { type: 'user', text: `Confirmed location: ${location}` }]);
          const result = await fetchGuidedSuggestions('confirmation', {
            reason: guidedData.reason,
            dateTime: guidedData.dateTime,
            location,
          });
          responseMessage.text = result.prompt || "Appointment confirmed!";
          if (result.missingFields?.length > 0) {
            responseMessage.text = result.prompt || `Missing fields: ${result.missingFields.join(', ')}. Starting over.`;
            setGuidedStep('reason');
            setGuidedData({});
          } else {
            setAppointmentStatus({ details: result.appointmentDetails, missingFields: [] });
            setGuidedStep('confirmation');
          }
          setMessages(prev => [...prev, responseMessage]);
          break;
        }
        case 'confirmation':
          setGuidedStep('reason');
          setGuidedData({});
          responseMessage.text = "Would you like to schedule another appointment? Please select a reason:";
          setMessages(prev => [...prev, responseMessage]);
          break;
      }
      console.log('Updated guidedStep:', guidedStep, 'guidedData:', guidedData);
    } catch (error) {
      console.error('Guided flow error:', error);
      setMessages(prev => [...prev, { type: 'assistant', text: `Error: ${error.message}` }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSuggestDifferentSlots = async () => {
    setIsProcessing(true);
    try {
      const result = await fetchGuidedSuggestions('dateTime', {
        reason: guidedData.reason,
        query: "Suggest different time slots",
      });
      setMessages(prev => [...prev, { type: 'assistant', text: result.prompt }]);
      setGuidedData(prev => ({
        ...prev,
        suggestedDateTimes: result.suggestedDateTimes,
        dateTime: undefined, // Clear selected dateTime to allow new selection
      }));
      setGuidedStep('dateTime'); // Stay on dateTime step with new slots
    } catch (error) {
      console.error('Error suggesting different slots:', error);
      setMessages(prev => [...prev, { type: 'assistant', text: `Error: ${error.message}` }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Unguided free-form send
  const handleSend = async (text: string = input) => {
    if (!text.trim() || isProcessing) return;

    // In guided mode, if not completed, we use the text to override the button selections
    if (isGuidedMode && guidedStep !== 'completed') {
      if (guidedStep === 'reason') {
        handleReasonSelection(text);
        setOverrideUsed(true);
        setInput('');
        return;
      } else if (guidedStep === 'date') {
        handleTimeSelection({ display: text, raw: text });
        setOverrideUsed(true);
        setInput('');
        return;
      } else if (guidedStep === 'location') {
        handleLocationSelection(text);
        setOverrideUsed(true);
        setInput('');
        return;
      } else if (guidedStep === 'confirmation') {
        handleConfirmAppointment();
        setOverrideUsed(true);
        setInput('');
        return;
      }
    }

    setIsProcessing(true);
    setMessages(prev => [...prev, { type: 'user', text }]);
    setInput('');

    setMessages(prev => [...prev, { type: 'assistant', text: 'Typing...', isLoading: true }]);

    try {
      if (sessionError) {
        const isHealthy = await checkSessionHealth();
        if (!isHealthy) throw new Error('Session is not available');
        setSessionError(false);
      }

      const result = await fetchGuidedSuggestions(guidedStep || 'reason', {
        ...guidedData,
        query: text,
      });

      setMessages(prev => prev.filter(msg => !msg.isLoading));
      setMessages(prev => [...prev, { type: 'assistant', text: result.prompt }]);
      setAppointmentStatus({ details: result.appointmentDetails, missingFields: result.missingFields });

      // Update guided data and step based on response
      if (result.updatedGuidedData) {
        setGuidedData(prev => ({ ...prev, ...result.updatedGuidedData }));
        if (result.updatedGuidedData.reason && !result.updatedGuidedData.dateTime) {
          setGuidedStep('dateTime');
          setGuidedData(prev => ({ ...prev, suggestedDateTimes: result.suggestedDateTimes }));
        } else if (result.updatedGuidedData.dateTime && !result.updatedGuidedData.location) {
          setGuidedStep('location');
          setGuidedData(prev => ({ ...prev, suggestedLocation: result.suggestedLocation }));
        } else if (result.updatedGuidedData.location) {
          setGuidedStep('confirmation');
        } else if (!result.updatedGuidedData.reason && !result.updatedGuidedData.dateTime && !result.updatedGuidedData.location) {
          setGuidedStep('reason');
          setGuidedData({});
        }
      } else if (guidedStep === 'dateTime' && result.suggestedDateTimes) {
        setGuidedData(prev => ({
          ...prev,
          suggestedDateTimes: result.suggestedDateTimes,
          dateTime: undefined, // Clear selected dateTime to allow new selection
        }));
        setGuidedStep('dateTime'); // Stay on dateTime step with new slots
      }
    } catch (error) {
      console.error('Error in chat:', error);
      setMessages(prev => prev.filter(msg => !msg.isLoading));

      if (String(error).includes('Session')) {
        setSessionError(true);
        setMessages(prev => [
          ...prev,
          { type: 'assistant', text: 'I lost our conversation history. Please try again or refresh the page.' },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { type: 'assistant', text: 'Sorry, something went wrong. Please try again!' },
        ]);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const checkInternetConnection = () => navigator.onLine;

  const handleMicClick = () => {
    if (!recognitionRef.current) {
      setMessages(prev => [
        ...prev,
        { type: 'assistant', text: 'Speech recognition is not supported in your browser.' },
      ]);
      return;
    }

    if (!checkInternetConnection()) {
      setMessages(prev => [
        ...prev,
        { type: 'assistant', text: 'Your device appears to be offline. Speech recognition requires an internet connection.' },
      ]);
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
        setMessages(prev => [
          ...prev,
          { type: 'assistant', text: 'Could not start speech recognition. Please try again.' },
        ]);
      }
    }
  };

  const formatAppointmentTime = (isoDateTime: string | null) => {
    if (!isoDateTime) return '(Not specified)';

    const date = new Date(isoDateTime);
    const options = {
      timeZone: 'UTC',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    };
    const formatted = date.toLocaleString('en-US', options);
    return formatted.replace(/(\d+),/, '$1th,');
  };

  const renderAppointmentStatus = () => {
    const { details } = appointmentStatus;
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
          {details.Id && (
            <p className="mt-2 text-gray-600 text-xs">Appointment ID: {details.Id}</p>
          )}
        </div>
      </div>
    );
  };

  const renderGuidedStep = () => {
    if (!isGuidedMode || !guidedStep) return null;

    console.log('Rendering guided step:', guidedStep, 'with data:', guidedData);
    switch (guidedStep) {
      case 'reason':
        return (
          <div className="mb-4 p-3 bg-gray-100 rounded-lg max-w-[85%] mr-auto">
            <select
              onChange={(e) => handleGuidedStep(e.target.value)}
              className="p-2 border rounded-lg w-full"
              disabled={isProcessing}
            >
              <option value="" disabled selected>Select a reason</option>
              {REASONS.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>
          </div>
        );
      case 'dateTime':
        return (
          <div className="mb-4 p-3 bg-gray-100 rounded-lg max-w-[85%] mr-auto">
            {guidedData.suggestedDateTimes?.length ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {guidedData.suggestedDateTimes.map((dt) => (
                    <button
                      key={dt}
                      onClick={() => handleGuidedStep(dt)}
                      disabled={isProcessing}
                      className="p-2 m-1 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {dt}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleSuggestDifferentSlots}
                  disabled={isProcessing}
                  className="mt-2 p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  Suggest Different Slots
                </button>
              </>
            ) : (
              <p>No date/time options available. Please try again or use chat to specify.</p>
            )}
          </div>
        );
      case 'location':
        return (
          <div className="mb-4 p-3 bg-gray-100 rounded-lg max-w-[85%] mr-auto">
            <button
              onClick={() => handleGuidedStep(true)}
              disabled={isProcessing}
              className="p-2 m-1 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
            >
              Confirm: {guidedData.suggestedLocation}
            </button>
            <div className="mt-2">
              <p>Or select another location:</p>
              {LOCATIONS.filter(loc => loc !== guidedData.suggestedLocation).map((loc) => (
                <button
                  key={loc}
                  onClick={() => handleGuidedStep(loc)}
                  disabled={isProcessing}
                  className="p-2 m-1 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>
        );
      case 'confirmation':
        return null; // Handled by renderAppointmentStatus
      default:
        return null;
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, guidedStep, guidedData]);

  useEffect(() => {
    if (isGuidedMode || input || isProcessing || sessionError || isRecording) return;

    const typeInterval = setInterval(() => {
      const fullText = PLACEHOLDER_SUGGESTIONS[placeholderIndex];
      if (charIndex < fullText.length) {
        setCurrentPlaceholder(fullText.slice(0, charIndex + 1));
        setCharIndex(charIndex + 1);
      } else {
        clearInterval(typeInterval);
        setTimeout(() => {
          setCharIndex(0);
          setCurrentPlaceholder('');
          setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_SUGGESTIONS.length);
        }, 2000);
      }
    }, 100);

    return () => clearInterval(typeInterval);
  }, [charIndex, placeholderIndex, input, isProcessing, sessionError, isRecording, isGuidedMode]);

  // Initial state setup
  useEffect(() => {
    const getDefaultMessages = () => [
      { type: 'assistant', text: "We're here to make booking an appointment with your banker quick, and easy!" },
      { type: 'assistant', text: "Use our conversational chat option or speak to schedule a meeting. For example, say or type your preferred date, time, banker, branch, and reason." },
    ];

    setMessages(getDefaultMessages());
    if (isGuidedMode) {
      setMessages(prev => [
        ...prev,
        { type: 'assistant', text: 'Welcome to Guided Mode! Let’s start by selecting a reason for your visit:' },
      ]);
      setGuidedStep('reason');
      setGuidedData({});
      setAppointmentStatus({ details: null, missingFields: [] });
    } else {
      setGuidedStep(null);
      setGuidedData({});
    }
  }, [isGuidedMode]);

  // Speech recognition setup
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognitionAPI();

      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.maxAlternatives = 3;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        if (event.results[0].isFinal) {
          const transcript = event.results[0][0].transcript;
          setInput(transcript);
          setIsRecording(false);
          retryCount.current = 0;
        } else {
          const transcript = event.results[0][0].transcript;
          setInput(transcript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'network' || event.error === 'service-not-allowed') {
          if (retryCount.current < MAX_RETRIES) {
            retryCount.current += 1;
            setMessages(prev => [
              ...prev,
              { type: 'assistant', text: `Connection issue detected. Retrying (${retryCount.current}/${MAX_RETRIES})...` },
            ]);
            setTimeout(() => {
              if (recognitionRef.current) {
                recognitionRef.current.continuous = false;
                recognitionRef.current.interimResults = false;
                recognitionRef.current.start();
              }
            }, 1000 * retryCount.current);
          } else {
            setIsRecording(false);
            setMessages(prev => [
              ...prev,
              { type: 'assistant', text: 'Speech recognition service is unavailable. Please type your message.' },
            ]);
            retryCount.current = 0;
          }
        } else if (event.error === 'no-speech') {
          setMessages(prev => [
            ...prev,
            { type: 'assistant', text: "I didn't hear anything. Please try again." },
          ]);
          setIsRecording(false);
        } else if (event.error === 'aborted') {
          setIsRecording(false);
        } else {
          setMessages(prev => [
            ...prev,
            { type: 'assistant', text: `Speech recognition error: ${event.error}. Please try typing.` },
          ]);
          setIsRecording(false);
        }
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current.onstart = () => {
        console.log('Speech recognition started');
        setIsRecording(true);
      };
    } else {
      console.warn('Speech Recognition not supported in this browser.');
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Session Error Banner */}
      {sessionError && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-2">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-amber-700">
                There seems to be an issue with your session.
                <button
                  onClick={() => checkSessionHealth().then((healthy) => {
                    setSessionError(!healthy);
                    if (healthy) setMessages(getDefaultMessages());
                  })}
                  className="ml-2 font-medium text-amber-700 underline"
                >
                  Try reconnecting
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 p-4 overflow-y-auto">
        {messages.map((message, index) => (
          <div
            key={index}
            className={clsx(
              'mb-4 p-3 rounded-lg max-w-[85%]',
              message.type === 'user'
                ? 'ml-auto bg-[#CD1309] text-white'
                : 'mr-auto bg-gray-100 text-gray-800',
              message.isLoading && 'animate-pulse'
            )}
          >
            {message.text}
          </div>
        ))}
        {renderGuidedStep()}
        {renderAppointmentStatus()}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t bg-gray-50">
        <p className="text-sm text-gray-600 mb-2">Need to adjust? Use chat to provide additional details or corrections.</p>
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder={currentPlaceholder || "Type your message or correction..."}
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
        {!isGuidedMode && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
            {prompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => handleSend(prompt)}
                disabled={isProcessing || sessionError}
                className="text-left p-2 text-sm bg-white border rounded-lg hover:bg-gray-50 transition-colors flex items-start space-x-2 disabled:opacity-50"
              >
                <MessageSquare className="w-4 h-4 text-[#CD1309] mt-0.5 flex-shrink-0" />
                <span>{prompt}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = `
  @keyframes pulse {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.7; }
    100% { transform: scale(1); opacity: 1; }
  }
  .animate-pulse {
    animation: pulse 1.5s infinite;
  }
`;

export default ChatInterface;