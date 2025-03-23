import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import AppointmentFlow from './components/AppointmentFlow';
import ProductRecommendations from './components/ProductRecommendations';
import ChatInterface, { ChatInterfaceHandle } from './components/ChatInterface';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userType, setUserType] = useState<'guest' | 'customer' | null>(null);
  const [currentReason, setCurrentReason] = useState<string | undefined>(undefined);
  const [showChat, setShowChat] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false); // State to toggle recommendations

  const chatRef = useRef<ChatInterfaceHandle>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/auth/check-session', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setIsLoggedIn(true);
          setUserName(data.username);
          setUserType('customer');
          setShowChat(true);
        } else {
          setIsLoggedIn(false);
          setUserName(null);
          setUserType(null);
          setShowChat(false);
        }
      } catch (error) {
        console.error('Error checking session:', error);
        setIsLoggedIn(false);
        setUserName(null);
        setUserType(null);
        setShowChat(false);
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
      if (response.ok) {
        const data = await response.json();
        setIsLoggedIn(true);
        setUserName(data.username);
        setUserType('customer');
        setShowChat(true);
      } else {
        throw new Error('Login failed');
      }
    } catch (error) {
      console.error('Error logging in:', error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setIsLoggedIn(false);
      setUserName(null);
      setUserType(null);
      setShowChat(false);
      setCurrentReason(undefined);
      setShowRecommendations(false);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleGuest = () => {
    setIsLoggedIn(true);
    setUserName('Guest');
    setUserType('guest');
    setShowChat(true);
  };

  const handleBookAppointment = (reason: string) => {
    console.log(`Booking appointment for: ${reason}`);
    setCurrentReason(reason);
    setShowChat(true);
    if (chatRef.current) {
      chatRef.current.handleSend(`Book an appointment to discuss ${reason}`);
    } else {
      console.error('Chat ref not available');
    }
  };

  const toggleRecommendations = () => {
    setShowRecommendations(prev => !prev);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="container mx-auto px-4 py-8 flex justify-center space-x-4">
        {/* AppointmentFlow with fixed size */}
        <div className="max-w-4xl">
          <AppointmentFlow
            ref={chatRef}
            isLoggedIn={isLoggedIn}
            userName={userName}
            userType={userType}
            onLogin={handleLogin}
            onLogout={handleLogout}
            onGuest={handleGuest}
            onReasonChange={setCurrentReason}
            showChat={showChat}
            onToggleRecommendations={toggleRecommendations}
          />
        </div>

        {/* Product Recommendations (shown only when toggled) */}
        {showRecommendations && (
          <div className="max-w-md transition-all duration-300">
            <ProductRecommendations
              isLoggedIn={isLoggedIn}
              token={null}
              userType={userType}
              currentReason={currentReason}
              onBookAppointment={handleBookAppointment}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;