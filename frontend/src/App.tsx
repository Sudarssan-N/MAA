import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import AppointmentFlow from './components/AppointmentFlow';
import ProductRecommendations from './components/ProductRecommendations';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userType, setUserType] = useState<'guest' | 'customer' | null>(null);
  const [currentReason, setCurrentReason] = useState<string | undefined>(undefined);
  const [showChat, setShowChat] = useState(false);

  // Check session on mount
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

  // Handle login
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

  // Handle logout
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
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Handle guest login
  const handleGuest = () => {
    setIsLoggedIn(true);
    setUserName('Guest');
    setUserType('guest');
    setShowChat(true);
  };

  // Handle booking an appointment from ProductRecommendations
  const handleBookAppointment = (reason: string) => {
    setCurrentReason(reason);
    setShowChat(true); // Ensure chat is visible
    // Optionally, you can trigger a message in ChatInterface to pre-fill the reason
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="container mx-auto px-4 py-8 flex justify-center space-x-4">
        {/* AppointmentFlow with Original Width */}
        <div className="max-w-4xl">
          <AppointmentFlow
            isLoggedIn={isLoggedIn}
            userName={userName}
            userType={userType}
            onLogin={handleLogin}
            onLogout={handleLogout}
            onGuest={handleGuest}
            onReasonChange={setCurrentReason} // Pass callback to update currentReason
            showChat={showChat}
          />
        </div>

        {/* Product Recommendations in White Space */}
        <ProductRecommendations
          isLoggedIn={isLoggedIn}
          token={null}
          userType={userType}
          currentReason={currentReason}
          onBookAppointment={handleBookAppointment}
        />
      </main>
    </div>
  );
}

export default App;