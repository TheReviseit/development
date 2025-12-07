"use client";

import { useState } from "react";
import { getEmailTemplate } from "@/lib/email/email-templates";

interface EmailComposerProps {
  onSend: (data: {
    subject: string;
    message: string;
    templateName: string;
    filters?: {
      role?: string;
      onboardingCompleted?: boolean;
    };
    testMode: boolean;
  }) => Promise<void>;
  loading: boolean;
}

export default function EmailComposer({ onSend, loading }: EmailComposerProps) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [templateName, setTemplateName] = useState("custom");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [testMode, setTestMode] = useState(true);

  const templates = [
    { value: "custom", label: "Custom Message" },
    { value: "newsletter", label: "Newsletter" },
    { value: "announcement", label: "Announcement" },
    { value: "welcome", label: "Welcome Email" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const filters: any = {};
    if (filterRole !== "all") {
      filters.role = filterRole;
    }

    await onSend({
      subject,
      message,
      templateName,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      testMode,
    });
  };

  const handleTemplateChange = (newTemplate: string) => {
    setTemplateName(newTemplate);
    const template = getEmailTemplate(newTemplate);
    if (template && !subject) {
      setSubject(template.subject);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6">Compose Email</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Template Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Template
          </label>
          <select
            value={templateName}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {templates.map((template) => (
              <option key={template.value} value={template.value}>
                {template.label}
              </option>
            ))}
          </select>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            placeholder="Enter email subject"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={10}
            placeholder="Enter your message here. You can use HTML tags for formatting."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <p className="mt-2 text-sm text-gray-500">
            💡 Tip: You can use HTML tags like &lt;strong&gt;, &lt;em&gt;,
            &lt;a&gt;, etc.
          </p>
        </div>

        {/* Recipients Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Send To
          </label>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Users</option>
            <option value="user">Regular Users Only</option>
            <option value="admin">Admins Only</option>
          </select>
        </div>

        {/* Test Mode Toggle */}
        <div className="flex items-center space-x-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <input
            type="checkbox"
            id="testMode"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label
            htmlFor="testMode"
            className="text-sm font-medium text-gray-700"
          >
            Test Mode (Send only to yourself for testing)
          </label>
        </div>

        {/* Warning for live mode */}
        {!testMode && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 font-medium">
              ⚠️ Warning: You are about to send emails to real users. Please
              review carefully!
            </p>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex space-x-4">
          <button
            type="submit"
            disabled={loading || !subject || !message}
            className={`flex-1 px-6 py-3 rounded-lg font-medium text-white transition-colors ${
              loading || !subject || !message
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading
              ? "Sending..."
              : testMode
              ? "Send Test Email"
              : "Send to All Recipients"}
          </button>
        </div>
      </form>
    </div>
  );
}
