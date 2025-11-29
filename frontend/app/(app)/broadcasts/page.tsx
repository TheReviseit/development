'use client';

import { useState } from 'react';

export default function BroadcastsPage() {
  const [campaigns] = useState([
    { id: 1, name: 'Weekly Newsletter', status: 'completed', sent: 234, delivered: 228, scheduled: '2024-01-15' },
    { id: 2, name: 'Holiday Promotion', status: 'scheduled', sent: 0, delivered: 0, scheduled: '2024-01-20' },
    { id: 3, name: 'Product Launch', status: 'draft', sent: 0, delivered: 0, scheduled: null },
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-black text-white';
      case 'scheduled': return 'bg-gray-600 text-white';
      case 'draft': return 'bg-gray-200 text-gray-800';
      default: return 'bg-gray-100';
    }
  };

  return (
    <div className="container-premium py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Broadcast Campaigns</h1>
          <p className="text-gray-600">Send bulk messages to your customers</p>
        </div>
        <button className="btn-primary">
          + New Campaign
        </button>
      </div>

      {/* Campaign List */}
      <div className="space-y-4">
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="card">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-lg">{campaign.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(campaign.status)}`}>
                    {campaign.status.toUpperCase()}
                  </span>
                </div>
                
                <div className="flex gap-6 text-sm text-gray-600">
                  {campaign.sent > 0 && (
                    <>
                      <div>Sent: <span className="font-medium text-gray-900">{campaign.sent}</span></div>
                      <div>Delivered: <span className="font-medium text-gray-900">{campaign.delivered}</span></div>
                    </>
                  )}
                  {campaign.scheduled && (
                    <div>Scheduled: <span className="font-medium text-gray-900">{campaign.scheduled}</span></div>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2">
                {campaign.status === 'draft' && (
                  <button className="btn-primary">Send Now</button>
                )}
                <button className="btn-ghost">View</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
