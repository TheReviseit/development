'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface Business {
  id: number;
  name: string;
  description: string | null;
  industry: string | null;
  whatsapp_connected: boolean;
}

export default function SelectBusinessPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState('');

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const fetchBusinesses = async () => {
    try {
      const response = await apiClient.get('/businesses');
      setBusinesses(response.data);
    } catch (error) {
      console.error('Failed to fetch businesses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBusiness = (businessId: number) => {
    localStorage.setItem('selected_business_id', businessId.toString());
    router.push('/dashboard');
  };

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/businesses', { name: newBusinessName });
      setNewBusinessName('');
      setShowCreateForm(false);
      fetchBusinesses();
    } catch (error) {
      console.error('Failed to create business:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-2">Select Workspace</h1>
          <p className="text-gray-600">Choose a business to continue</p>
        </div>

        {!showCreateForm ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {businesses.map((business) => (
                <button
                  key={business.id}
                  onClick={() => handleSelectBusiness(business.id)}
                  className="card text-left hover:border-black transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1">{business.name}</h3>
                      {business.description && (
                        <p className="text-sm text-gray-600 mb-2">{business.description}</p>
                      )}
                      {business.industry && (
                        <span className="inline-block px-2 py-1 bg-gray-100 text-xs font-medium rounded">
                          {business.industry}
                        </span>
                      )}
                    </div>
                    <div className="ml-4">
                      {business.whatsapp_connected ? (
                        <span className="inline-block w-3 h-3 bg-black rounded-full" title="WhatsApp connected"></span>
                      ) : (
                        <span className="inline-block w-3 h-3 border-2 border-gray-300 rounded-full" title="Not connected"></span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowCreateForm(true)}
              className="btn-secondary w-full"
            >
              + Create New Workspace
            </button>
          </>
        ) : (
          <div className="card">
            <h3 className="text-xl font-semibold mb-4">Create a New Workspace</h3>
            <form onSubmit={handleCreateBusiness}>
              <div className="mb-4">
                <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-2">
                  Workspace Name
                </label>
                <input
                  id="businessName"
                  type="text"
                  required
                  value={newBusinessName}
                  onChange={(e) => setNewBusinessName(e.target.value)}
                  className="input-field"
                  placeholder="My Business"
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="btn-ghost flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
