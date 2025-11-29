'use client';

import { useEffect, useState } from 'react';

interface StatCard {
  title: string;
  value: string | number;
  change?: string;
}

export default function DashboardPage() {
  const [stats] = useState<StatCard[]>([
    { title: 'Total Conversations', value: '1,234', change: '+12%' },
    { title: 'Active Leads', value: '89', change: '+5%' },
    { title: 'Messages Today', value: '456' },
    { title: 'Automation Rules', value: '12' },
  ]);

  return (
    <div className="container-premium py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-600">Overview of your WhatsApp automation</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="card">
            <div className="text-sm text-gray-600 mb-2">{stat.title}</div>
            <div className="text-3xl font-bold mb-1">{stat.value}</div>
            {stat.change && (
              <div className="text-sm text-gray-700 font-medium">{stat.change}</div>
            )}
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Recent Conversations</h2>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center text-white font-medium">
                  JD
                </div>
                <div className="flex-1">
                  <div className="font-medium mb-1">John Doe</div>
                  <div className="text-sm text-gray-600">+1 234 567 8900</div>
                  <div className="text-sm text-gray-500 mt-1">Last message: 2 hours ago</div>
                </div>
                <span className="px-2 py-1 bg-gray-100 text-xs font-medium rounded">Hot</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Lead Score Distribution</h2>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Hot Leads</span>
                <span className="text-gray-600">24 (27%)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-black h-2 rounded-full" style={{ width: '27%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Warm Leads</span>
                <span className="text-gray-600">45 (51%)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-gray-600 h-2 rounded-full" style={{ width: '51%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Cold Leads</span>
                <span className="text-gray-600">20 (22%)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-gray-300 h-2 rounded-full" style={{ width: '22%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
