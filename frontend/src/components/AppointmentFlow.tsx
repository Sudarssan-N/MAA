import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Lock, UserCheck } from 'lucide-react';
import ChatInterface, { ChatInterfaceHandle } from './ChatInterface';
import LoginModal from './LoginModal';

const AppointmentFlow = () => {
  const [showChat, setShowChat] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userType, setUserType] = useState<'guest' | 'customer' | null>(null);
  const [isGuidedMode, setIsGuidedMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/auth/check-session', {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Session check response:', data); // Debug log
          setIsLoggedIn(true);
          setUserName(data.username || 'Customer');
          setUserType('customer');
          setShowChat(true);
        } else {
          console.log('No active session found');
          setIsLoggedIn(false);
          setUserName('');
          setUserType(null);
        }
      } catch (error) {
        console.error('Session check failed:', error);
        setIsLoggedIn(false);
        setUserName('');
        setUserType(null);
        setErrorMessage('Failed to check session. Please try again later.');
      }
    };

    checkSession();
  }, []);

  const handleLogin = async (username: string, password: string) => {
    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Login successful:', data); // Debug log
        setIsLoginModalOpen(false);
        setIsLoggedIn(true);
        setUserName(data.username);
        setUserType('customer');
        setShowChat(true);
        setErrorMessage(null);
      } else {
        setErrorMessage(data.message || 'Login failed. Please try again.');
      }
    } catch (error) {
      console.error('Login failed:', error);
      setErrorMessage('Something went wrong. Please try again.');
    }
  };

  const handleGuest = () => {
    console.log('Continuing as guest'); // Debug log
    setUserType('guest');
    setUserName('Guest');
    setIsLoggedIn(false);
    setShowChat(true);
    setErrorMessage(null);
  };

  const handleLogout = async () => {
    await onLogout();
  };

      if (response.ok) {
        console.log('Logout successful'); // Debug log
        setIsLoggedIn(false);
        setUserName('');
        setUserType(null);
        setShowChat(false);
        setErrorMessage(null);
        setIsGuidedMode(false); // Reset guided mode on logout
      } else {
        const data = await response.json();
        setErrorMessage(data.message || 'Logout failed. Please try again.');
      }
    } catch (error) {
      console.error('Logout failed:', error);
      setErrorMessage('Something went wrong during logout. Please try again.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto mt-8 bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-[#CD1309]" />
          <h2 className="text-lg font-semibold text-gray-800">
            Schedule an Appointment
          </h2>
        </div>
        <div className="flex items-center space-x-4">
          <label
            htmlFor="guided-mode-toggle"
            className="relative inline-flex items-center cursor-pointer"
          >
            <input
              id="guided-mode-toggle"
              type="checkbox"
              checked={isGuidedMode}
              onChange={() => setIsGuidedMode(!isGuidedMode)}
              className="sr-only peer"
              aria-label="Toggle Guided Mode"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#CD1309] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#CD1309]"></div>
            <span className="ml-3 text-sm font-medium text-gray-900">Guided Mode</span>
          </label>
          {isLoggedIn && (
            <>
              <span className="text-sm text-gray-600">Welcome, {userName}</span>
              <button
                onClick={handleLogout}
                className="text-red-500 hover:text-red-700 underline"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden" style={{ height: 'calc(100vh - 128px)' }}>
        <AnimatePresence mode="wait">
          {!showChat ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="p-8 flex flex-col items-center justify-center space-y-8"
            >
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-semibold text-gray-900">
                  Welcome to Your Appointment Scheduler
                </h1>
                <p className="text-gray-600 max-w-md">
                  We're here to make booking an appointment with your banker quick and easy!
                </p>
              </div>

              {errorMessage && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
                  <p className="text-sm text-red-700">{errorMessage}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="flex flex-col items-center p-8 bg-white rounded-xl border-2 border-[#CD1309] hover:bg-red-50 transition-colors"
                >
                  <Lock className="w-12 h-12 text-[#CD1309] mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900">Sign on</h3>
                  <p className="text-gray-600 text-center mt-2">
                    Access your account
                  </p>
                </button>

                <button
                  onClick={handleGuest}
                  className="flex flex-col items-center p-8 bg-gray-600 rounded-xl text-white hover:bg-gray-700 transition-colors"
                >
                  <UserCheck className="w-12 h-12 mb-4" />
                  <h3 className="text-xl font-semibold">Continue as guest</h3>
                  <p className="text-center mt-2">
                    Book an appointment without signing in
                  </p>
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              <ChatInterface
                isLoggedIn={isLoggedIn}
                userName={userName}
                userType={userType}
                token={null} // Consider fetching a token if needed
                isGuidedMode={isGuidedMode}
              />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:bg-gray-600 peer-checked:bg-red-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              <span className="ml-2 text-sm font-medium text-gray-900">
                Guided Mode
              </span>
            </label>
          </div>
          {isLoggedIn && (
            <div className="text-sm text-gray-600 flex space-x-2">
              <span>Welcome, Jack</span>
              <button
                onClick={handleLogout}
                className="text-red-500 hover:text-red-700 underline"
              >
                Logout
              </button>
            </div>
          )}
        </div>

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => {
          setIsLoginModalOpen(false);
          setErrorMessage(null);
        }}
        onLogin={handleLogin}
        errorMessage={errorMessage}
      />
    </div>
  );
});

export default AppointmentFlow;