import React, { useState, useEffect, useCallback } from 'react';

// Define the product recommendation interface
interface Product {
  name: string;
  description: string;
  key: string;
}

interface ProductRecommendationsProps {
  isLoggedIn: boolean;
  token?: string | null;
  userType: 'guest' | 'customer' | null;
  currentReason?: string; // Passed from App to update recommendations dynamically
  onBookAppointment: (reason: string) => void; // Callback to trigger appointment booking
}

const ProductRecommendations: React.FC<ProductRecommendationsProps> = ({
  isLoggedIn,
  token,
  userType,
  currentReason,
  onBookAppointment,
}) => {
  const [productRecommendations, setProductRecommendations] = useState<Product[]>([]);
  const [recommendationReason, setRecommendationReason] = useState<string>('');
  const [bankerNotes, setBankerNotes] = useState<string[]>([]);

  const API_BASE_URL = 'http://localhost:3000/api';

  const fetchBankerNotes = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/salesforce/banker-notes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch banker notes');
      const data = await response.json();
      setBankerNotes(data.bankerNotes || []);
    } catch (error) {
      console.error('Error fetching banker notes:', error);
      setBankerNotes([]);
    }
  };

  const fetchProductRecommendations = useCallback(async () => {
    try {
      // Fetch visit history
      const visitResponse = await fetch(`${API_BASE_URL}/salesforce/visit-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          contactId: '003dM000005H5A7QAK',
          query: "SELECT Branch_Name__c, Visit_Reason__c, Visit_Date__c FROM Branch_Visit__c WHERE Contact__c = '003dM000005H5A7QAK'",
        }),
      });

      if (!visitResponse.ok) throw new Error('Failed to fetch visit history');
      const visitData = await visitResponse.json();
      const visitReasons = visitData.records.map((record: any) => record.Visit_Reason__c);

      // Fetch recommendations
      const recommendationResponse = await fetch(`${API_BASE_URL}/chat/recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          visitReasons,
          customerType: userType === 'customer' ? 'Regular' : 'Guest',
          bankerNotes,
          currentReason,
        }),
      });

      if (!recommendationResponse.ok) throw new Error('Failed to fetch product recommendations');
      const recommendationData = await recommendationResponse.json();
      setProductRecommendations(recommendationData.recommendations.slice(0, 3));
      setRecommendationReason(recommendationData.reason);
    } catch (error) {
      console.error('Error fetching product recommendations:', error);
      setProductRecommendations([
        { name: 'Everyday Checking', description: 'A versatile checking account for daily transactions.', key: 'checking_account' },
        { name: 'Way2Save® Savings', description: 'Build your savings with automatic transfers.', key: 'savings_account' },
        { name: 'Digital Banking Tools', description: 'Manage your finances with our online and mobile app.', key: 'digital_banking' },
      ]);
      setRecommendationReason('Default recommendations due to error.');
    }
  }, [token, userType, bankerNotes, currentReason]);

  // Fetch banker notes and initial recommendations on mount
  useEffect(() => {
    if (isLoggedIn && userType === 'customer') {
      fetchBankerNotes().then(() => fetchProductRecommendations());
    }
  }, [isLoggedIn, userType, fetchProductRecommendations]);

  // Update recommendations when currentReason changes
  useEffect(() => {
    if (isLoggedIn && userType === 'customer' && currentReason) {
      fetchProductRecommendations();
    }
  }, [currentReason, isLoggedIn, userType, fetchProductRecommendations]);

  // Only render for logged-in customers with recommendations
  if (!isLoggedIn || userType !== 'customer' || productRecommendations.length === 0) {
    return null;
  }

  return (
    <div className="w-80 p-4 bg-white rounded-lg shadow-lg border">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-semibold text-gray-800">Recommended Products</h3>
      </div>
      <p className="text-sm text-gray-600 mb-4">{recommendationReason}</p>
      <ul className="space-y-3">
        {productRecommendations.map((product, index) => (
          <li key={index} className="p-3 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900">{product.name}</h4>
            <p className="text-sm text-gray-600">{product.description}</p>
            <button
              onClick={() => onBookAppointment(`Discuss ${product.name}`)}
              className="mt-2 px-3 py-1 bg-[#CD1309] text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
            >
              Book an Appointment
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProductRecommendations;