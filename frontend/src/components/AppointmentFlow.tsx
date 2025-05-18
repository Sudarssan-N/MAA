import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Lock, UserCheck } from 'lucide-react';
import ChatInterface, { ChatInterfaceHandle } from './ChatInterface';
import LoginModal from './LoginModal';

interface AppointmentFlowProps {
  isLoggedIn: boolean;
  userName: string | null;
  userType: 'guest' | 'customer' | null;
  onLogin: (username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onGuest: () => void;
  onReasonChange: (reason: string | undefined) => void;
  showChat: boolean;
  onToggleRecommendations: () => void; // New prop
}

const AppointmentFlow = forwardRef<ChatInterfaceHandle, AppointmentFlowProps>(({
  isLoggedIn,
  userName,
  userType,
  onLogin,
  onLogout,
  onGuest,
  onReasonChange,
  showChat,
  onToggleRecommendations, // Destructure new prop
}, ref) => {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(true);
  const [isGuidedMode, setIsGuidedMode] = useState(false);

  const handleLogin = async (username: string, password: string) => {
    await onLogin(username, password);
    setIsLoginModalOpen(false);
  };

  const handleLogout = async () => {
    await onLogout();
  };

  const handleGuest = () => {
    onGuest();
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden flex">
      <div className="flex-1">
        <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-[#CD1309]" />
            <h2 className="text-lg font-semibold text-gray-800">
              Schedule an Appointment
            </h2>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                checked={isGuidedMode}
                onChange={() => setIsGuidedMode(!isGuidedMode)}
                className="sr-only peer"
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

        <div className="h-[800px] relative overflow-hidden">
          <AnimatePresence mode="wait">
            {!showChat ? (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="p-8 h-full flex flex-col"
              >
                <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                  <div className="text-center space-y-2">
                    <h1 className="text-2xl font-semibold text-gray-900">
                      Welcome to Your Appointment Scheduler
                    </h1>
                    <p className="text-gray-600 max-w-md">
                      We're here to make booking an appointment with your banker quick and easy!
                    </p>
                  </div>
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
                  ref={ref}
                  isLoggedIn={isLoggedIn}
                  userName={userName || 'Guest'}
                  userType={userType}
                  token={null}
                  isGuidedMode={isGuidedMode}
                  onReasonChange={onReasonChange}
                  onToggleRecommendations={onToggleRecommendations} // Pass down to ChatInterface
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onLogin={handleLogin}
        />
      </div>
    </div>
  );
});

export default AppointmentFlow;