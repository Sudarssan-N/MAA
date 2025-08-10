import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Lock, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  onToggleRecommendations,
}, ref) => {
  const { t } = useTranslation();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(!isLoggedIn); // Open modal if not logged in
  const [isGuidedMode, setIsGuidedMode] = useState(false);
  const [localShowChat, setLocalShowChat] = useState(showChat);

  const handleLogin = async (username: string, password: string) => {
    await onLogin(username, password);
    setIsLoginModalOpen(false);
    setLocalShowChat(true); // Show chat after login
  };

  const handleLogout = async () => {
    await onLogout();
    setLocalShowChat(false); // Hide chat on logout
  };

  const handleGuest = () => {
    onGuest();
    setIsLoginModalOpen(false);
    setLocalShowChat(true); // Show chat for guest
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden flex">
      <div className="flex-1">
        <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-[#CD1309]" />
            <h2 className="text-lg font-semibold text-gray-800">
              {t('bookAppointment')}
            </h2>
          </div>
          {isLoggedIn && (
            <div className="text-sm text-gray-600 flex space-x-2">
              <span>{t('welcomeUser', { user: userName || 'Jack' })}</span>
              <button
                onClick={handleLogout}
                className="text-red-500 hover:text-red-700 underline"
              >
                {t('logout')}
              </button>
            </div>
          )}
        </div>

        <div className="h-[800px] relative overflow-hidden">
          <AnimatePresence mode="wait">
            {!localShowChat ? (
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
                      {isLoggedIn ? t('welcomeBackUser', { user: userName || 'Jack' }) : t('welcome')}
                    </h1>
                    <p className="text-gray-600 max-w-md">
                      {/* You can add more translation keys for this paragraph if needed */}
                      {t('appointmentSchedulerDesc', 'We\'re here to make booking an appointment with your banker quick and easy!')}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                    <button
                      onClick={() => setIsLoginModalOpen(true)}
                      className="flex flex-col items-center p-8 bg-white rounded-xl border-2 border-[#CD1309] hover:bg-red-50 transition-colors"
                    >
                      <Lock className="w-12 h-12 text-[#CD1309] mb-4" />
                      <h3 className="text-xl font-semibold text-gray-900">{t('signOn')}</h3>
                      <p className="text-gray-600 text-center mt-2">
                        {t('accessAccount')}
                      </p>
                    </button>
                    <button
                      onClick={handleGuest}
                      className="flex flex-col items-center p-8 bg-gray-600 rounded-xl text-white hover:bg-gray-700 transition-colors"
                    >
                      <UserCheck className="w-12 h-12 mb-4" />
                      <h3 className="text-xl font-semibold">{t('continueGuest')}</h3>
                      <p className="text-center mt-2">
                        {t('bookWithoutSignIn')}
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
                  token={null} // Token not used, but kept for compatibility
                  isGuidedMode={isGuidedMode}
                  onReasonChange={onReasonChange}
                  onToggleRecommendations={onToggleRecommendations}
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