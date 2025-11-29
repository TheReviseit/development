'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [whatsappConfig, setWhatsappConfig] = useState({
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    verifyToken: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // API call to save WhatsApp credentials
    alert('WhatsApp credentials saved!');
  };

  return (
    <div className="container-premium py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-gray-600">Manage your business configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar Menu */}
        <div className="lg:col-span-1">
          <div className="card space-y-1">
            <button className="w-full text-left px-4 py-2.5 rounded-lg bg-black text-white font-medium">
              WhatsApp Integration
            </button>
            <button className="w-full text-left px-4 py-2.5 rounded-lg text-gray-700 hover:bg-gray-100 font-medium">
              Business Profile
            </button>
            <button className="w-full text-left px-4 py-2.5 rounded-lg text-gray-700 hover:bg-gray-100 font-medium">
              Team Members
            </button>
            <button className="w-full text-left px-4 py-2.5 rounded-lg text-gray-700 hover:bg-gray-100 font-medium">
              AI Settings
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-xl font-semibold mb-6">WhatsApp Cloud API Configuration</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number ID
                </label>
                <input
                  type="text"
                  value={whatsappConfig.phoneNumberId}
                  onChange={(e) => setWhatsappConfig({ ...whatsappConfig, phoneNumberId: e.target.value })}
                  className="input-field"
                  placeholder="Enter your WhatsApp Phone Number ID"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Account ID
                </label>
                <input
                  type="text"
                  value={whatsappConfig.businessAccountId}
                  onChange={(e) => setWhatsappConfig({ ...whatsappConfig, businessAccountId: e.target.value })}
                  className="input-field"
                  placeholder="Enter your Business Account ID"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Access Token
                </label>
                <input
                  type="password"
                  value={whatsappConfig.accessToken}
                  onChange={(e) => setWhatsappConfig({ ...whatsappConfig, accessToken: e.target.value })}
                  className="input-field"
                  placeholder="Enter your Access Token"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Webhook Verify Token
                </label>
                <input
                  type="text"
                  value={whatsappConfig.verifyToken}
                  onChange={(e) => setWhatsappConfig({ ...whatsappConfig, verifyToken: e.target.value })}
                  className="input-field"
                  placeholder="Enter your Webhook Verify Token"
                />
              </div>

              <div className="pt-4">
                <button type="submit" className="btn-primary">
                  Save Configuration
                </button>
              </div>
            </form>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium mb-2">Webhook URL</h3>
              <code className="text-sm text-gray-700 break-all">
                https://your-domain.com/api/webhook/whatsapp
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
