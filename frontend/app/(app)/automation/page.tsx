'use client';

import { useState } from 'react';

interface AutomationRule {
  id: number;
  name: string;
  trigger: string;
  response: string;
  isActive: boolean;
}

export default function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([
    { id: 1, name: 'Pricing Inquiry', trigger: 'pricing, price, cost', response: 'Our pricing starts at $99/month...', isActive: true },
    { id: 2, name: 'Hours of Operation', trigger: 'hours, open, opening', response: 'We are open Mon-Fri 9AM-5PM', isActive: true },
    { id: 3, name: 'Appointment Request', trigger: 'appointment, book, schedule', response: 'I can help you book an appointment...', isActive: false },
  ]);

  const toggleRule = (id: number) => {
    setRules(rules.map(rule => 
      rule.id === id ? { ...rule, isActive: !rule.isActive } : rule
    ));
  };

  return (
    <div className="container-premium py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Automation Rules</h1>
          <p className="text-gray-600">Manage automated WhatsApp responses</p>
        </div>
        <button className="btn-primary">
          + Create Rule
        </button>
      </div>

      <div className="space-y-4">
        {rules.map((rule) => (
          <div key={rule.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-semibold text-lg">{rule.name}</h3>
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className={`
                      relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${rule.isActive ? 'bg-black' : 'bg-gray-300'}
                    `}
                  >
                    <span
                      className={`
                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                        ${rule.isActive ? 'translate-x-6' : 'translate-x-1'}
                      `}
                    />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600 font-medium mb-1">Trigger Keywords</div>
                    <div className="text-gray-800">{rule.trigger}</div>
                  </div>
                  <div>
                    <div className="text-gray-600 font-medium mb-1">Response Template</div>
                    <div className="text-gray-800">{rule.response}</div>
                  </div>
                </div>
              </div>
              
              <div className="ml-6 flex gap-2">
                <button className="btn-ghost">Edit</button>
                <button className="text-gray-400 hover:text-gray-700 px-3">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
