'use client';

import { useState } from 'react';

interface Customer {
  id: number;
  name: string;
  phone: string;
  leadScore: 'cold' | 'warm' | 'hot';
  lastActivity: string;
  tags: string[];
}

export default function CRMPage() {
  const [customers] = useState<Customer[]>([
    { id: 1, name: 'John Doe', phone: '+1 234 567 8900', leadScore: 'hot', lastActivity: '2 hours ago', tags: ['vip', 'interested'] },
    { id: 2, name: 'Jane Smith', phone: '+1 234 567 8901', leadScore: 'warm', lastActivity: '1 day ago', tags: ['new_lead'] },
    { id: 3, name: 'Bob Johnson', phone: '+1 234 567 8902', leadScore: 'cold', lastActivity: '3 days ago', tags: [] },
  ]);

  const getLeadScoreColor = (score: string) => {
    switch (score) {
      case 'hot': return 'bg-black text-white';
      case 'warm': return 'bg-gray-600 text-white';
      case 'cold': return 'bg-gray-300 text-gray-800';
      default: return 'bg-gray-100';
    }
  };

  return (
    <div className="container-premium py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Customer CRM</h1>
          <p className="text-gray-600">Manage your customer relationships</p>
        </div>
        <button className="btn-primary">
          + Add Customer
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search customers..."
            className="input-field flex-1"
          />
          <select className="input-field w-48">
            <option>All Lead Scores</option>
            <option>Hot</option>
            <option>Warm</option>
            <option>Cold</option>
          </select>
          <select className="input-field w-48">
            <option>All Tags</option>
            <option>VIP</option>
            <option>Interested</option>
            <option>New Lead</option>
          </select>
        </div>
      </div>

      {/* Customer Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-sm">Customer</th>
                <th className="text-left py-3 px-4 font-semibold text-sm">Phone</th>
                <th className="text-left py-3 px-4 font-semibold text-sm">Lead Score</th>
                <th className="text-left py-3 px-4 font-semibold text-sm">Tags</th>
                <th className="text-left py-3 px-4 font-semibold text-sm">Last Activity</th>
                <th className="text-left py-3 px-4 font-semibold text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="py-4 px-4">
                    <div className="font-medium">{customer.name}</div>
                  </td>
                  <td className="py-4 px-4 text-gray-600 text-sm">{customer.phone}</td>
                  <td className="py-4 px-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getLeadScoreColor(customer.leadScore)}`}>
                      {customer.leadScore.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex gap-1 flex-wrap">
                      {customer.tags.map((tag, idx) => (
                        <span key={idx} className="px-2 py-1 bg-gray-100 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-gray-600 text-sm">{customer.lastActivity}</td>
                  <td className="py-4 px-4">
                    <button className="text-sm font-medium hover:underline">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
