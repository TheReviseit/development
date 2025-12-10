"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/src/firebase/firebase";
import EmailComposer from "@/app/components/admin/EmailComposer";

export default function AdminEmailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [firebaseUID, setFirebaseUID] = useState<string | null>(null);
  const [testEmailLoading, setTestEmailLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setFirebaseUID(user.uid);
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleSendEmail = async (data: {
    subject: string;
    message: string;
    templateName: string;
    filters?: any;
    testMode: boolean;
  }) => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/email/send-bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (responseData.success) {
        setResult({
          success: true,
          message: `✅ Successfully sent ${responseData.sentCount} email(s)!`,
          details: responseData,
        });
      } else {
        setResult({
          success: false,
          message: `❌ Failed to send emails: ${responseData.error}`,
          details: responseData,
        });
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: `❌ Error: ${error.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmailConfig = async () => {
    setTestEmailLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/email/test-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const responseData = await response.json();

      if (responseData.success) {
        setResult({
          success: true,
          message: `✅ ${responseData.message}`,
          details: responseData,
        });
      } else {
        setResult({
          success: false,
          message: `❌ Test failed: ${responseData.error}`,
          details: responseData,
        });
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: `❌ Error: ${error.message}`,
      });
    } finally {
      setTestEmailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Email Management
          </h1>
          <p className="text-gray-600">
            Send emails to your users from contact@reviseit.in
          </p>
        </div>

        {/* Test Email Configuration Button */}
        <div className="mb-6">
          <button
            onClick={handleTestEmailConfig}
            disabled={testEmailLoading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
          >
            {testEmailLoading ? "Testing..." : "🧪 Test Email Configuration"}
          </button>
        </div>

        {/* Result Display */}
        {result && (
          <div
            className={`mb-6 p-6 rounded-lg ${
              result.success
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            <p
              className={`font-medium ${
                result.success ? "text-green-800" : "text-red-800"
              }`}
            >
              {result.message}
            </p>
            {result.details && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium">
                  View Details
                </summary>
                <pre className="mt-2 text-xs bg-white p-4 rounded border overflow-auto max-h-64">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Email Composer */}
        <EmailComposer onSend={handleSendEmail} loading={loading} />

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">📖 Instructions</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>
              • <strong>Test Mode:</strong> Sends email only to you for testing
              before sending to all users
            </li>
            <li>
              • <strong>Templates:</strong> Choose a pre-designed template or
              use custom HTML
            </li>
            <li>
              • <strong>Filters:</strong> Target specific user groups (all
              users, regular users, admins)
            </li>
            <li>
              • <strong>HTML Support:</strong> Use HTML tags in the message for
              rich formatting
            </li>
          </ul>
        </div>

        {/* Quick Stats */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-600">Email Service</p>
            <p className="text-lg font-semibold">Resend</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-600">From Address</p>
            <p className="text-lg font-semibold">contact@reviseit.in</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-600">Free Tier Limit</p>
            <p className="text-lg font-semibold">3,000/month</p>
          </div>
        </div>
      </div>
    </div>
  );
}
