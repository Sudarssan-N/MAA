import React, { useState, useEffect, useCallback } from 'react';
export const API_BASE_URL = 'http://localhost:3000/api';

interface ProductRecommendation {
  name: string;
  description: string;
  key: string;
}

interface ProductRecommendationsProps {
  isLoggedIn: boolean;
  token: string | null;
  userType: 'guest' | 'customer' | null;
  currentReason?: string;
  onBookAppointment: (reason: string) => void;
  onSendToChat?: (message: string) => void;
}

const ProductRecommendations: React.FC<ProductRecommendationsProps> = ({
  isLoggedIn,
  token,
  userType,
  currentReason,
  onBookAppointment,
  onSendToChat,
}) => {
  const [productRecommendations, setProductRecommendations] = useState<ProductRecommendation[]>([]);
  const [recommendationReason, setRecommendationReason] = useState<string>('');
  const [bankerNotes, setBankerNotes] = useState<string[]>([]);
  const [visitReasons, setVisitReasons] = useState<string[]>([]);
  const [hasFetchedBankerNotes, setHasFetchedBankerNotes] = useState(false);
  const [hasFetchedInitialData, setHasFetchedInitialData] = useState(false);

  // Fetch banker notes
  const fetchBankerNotes = useCallback(async () => {
    if (!isLoggedIn || hasFetchedBankerNotes) return; // Use flag instead of length check
    
    try {
      const response = await fetch(`${API_BASE_URL}/salesforce/banker-notes`, {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to fetch banker notes');
      
      const data = await response.json();
      setBankerNotes(data.bankerNotes || []);
      setHasFetchedBankerNotes(true); // Set flag to true after fetching
    } catch (error) {
      console.error('Error fetching banker notes:', error);
      setBankerNotes([]);
      setHasFetchedBankerNotes(true); // Set flag to true even on error
    }
  }, [isLoggedIn, hasFetchedBankerNotes]); // Remove bankerNotes.length dependency

  const handleBookAppointment = (productName: string) => {
    const prompt = `Book an appointment to discuss ${productName}`;
    if (onSendToChat) {
      onSendToChat(prompt); // Send the prompt to ChatInterface
    } else {
      onBookAppointment(prompt); // Fallback to original behavior
    }
  };

  // Fetch product recommendations and visit history
  const fetchProductRecommendations = useCallback(async () => {
    // Skip if not logged in, already fetched initial data, or banker notes not yet fetched
    if (!isLoggedIn || hasFetchedInitialData || !hasFetchedBankerNotes) return;
    
    try {
      // Fetch visit history only if not already fetched
      let visitData = { records: [] };
      if (visitReasons.length === 0) {
        const visitResponse = await fetch(`${API_BASE_URL}/salesforce/visit-history`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            contactId: '003dM000005H5A7QAK',
            query: "SELECT Branch_Name__c, Visit_Reason__c, Visit_Date__c FROM Branch_Visit__c WHERE Contact__c = '003dM000005H5A7QAK' ORDER BY Visit_Date__c DESC LIMIT 5",
          }),
        });
        
        if (!visitResponse.ok) throw new Error('Failed to fetch visit history');
        
        visitData = await visitResponse.json();
        setVisitReasons(visitData.records.map((record: any) => record.Visit_Reason__c || ''));
      }

      // Fetch recommendations
      const recommendationResponse = await fetch(`${API_BASE_URL}/chat/recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          visitReasons: visitReasons.length ? visitReasons : visitData.records.map((record: any) => record.Visit_Reason__c || ''),
          customerType: userType === 'customer' ? 'Regular' : 'Guest',
          bankerNotes,
          currentReason,
        }),
      });

      if (!recommendationResponse.ok) throw new Error('Failed to fetch product recommendations');
      
      const recommendationData = await recommendationResponse.json();
      setProductRecommendations(recommendationData.recommendations.slice(0, 3));
      setRecommendationReason(recommendationData.reason);
      setHasFetchedInitialData(true); // Mark as fetched
    } catch (error) {
      console.error('Error fetching product recommendations:', error);
      setProductRecommendations([
        { name: 'Everyday Checking', description: 'A versatile checking account for daily transactions.', key: 'checking_account' },
        { name: 'Way2Save® Savings', description: 'Build your savings with automatic transfers.', key: 'savings_account' },
        { name: 'Digital Banking Tools', description: 'Manage your finances with our online and mobile app.', key: 'digital_banking' },
      ]);
      setRecommendationReason('Default recommendations due to error.');
      setHasFetchedInitialData(true); // Still mark as fetched to prevent looping
    }
  }, [isLoggedIn, token, userType, bankerNotes, currentReason, visitReasons, hasFetchedBankerNotes, hasFetchedInitialData]);

  // Fetch banker notes first
  useEffect(() => {
    if (isLoggedIn) {
      fetchBankerNotes();
    }
  }, [isLoggedIn, fetchBankerNotes]);

  // Then fetch product recommendations after banker notes are loaded
  useEffect(() => {
    if (isLoggedIn && hasFetchedBankerNotes) {
      fetchProductRecommendations();
    }
  }, [isLoggedIn, hasFetchedBankerNotes, fetchProductRecommendations]);

  // Handle currentReason changes
  useEffect(() => {
    // Only refetch if initial data is loaded and reason changes
    if (hasFetchedInitialData && currentReason && hasFetchedBankerNotes) {
      // Reset the flag to force a new fetch with the new reason
      setHasFetchedInitialData(false);
    }
  }, [currentReason, hasFetchedBankerNotes]);

  return (
    <div className="w-full max-w-md p-4 bg-white rounded-lg shadow-lg">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Product Recommendations</h2>
      {recommendationReason && (
        <p className="text-sm text-gray-600 mb-4 italic">{recommendationReason}</p>
      )}
      <div className="space-y-4">
        {productRecommendations.map((product, index) => (
          <div key={index} className="p-3 bg-gray-50 rounded-lg border">
            <h3 className="text-md font-medium text-gray-900">{product.name}</h3>
            <p className="text-sm text-gray-600">{product.description}</p>
            <button
              onClick={() => onBookAppointment(product.name)} // Updated to use product.name directly
              className="mt-2 w-full px-4 py-2 bg-[#CD1309] text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Book an Appointment
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductRecommendations;