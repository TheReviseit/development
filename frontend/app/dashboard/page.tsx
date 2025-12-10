"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import styles from "./dashboard.module.css";

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check onboarding status
        // Check onboarding status
        try {
          const response = await fetch("/api/onboarding/check");

          if (response.status === 401) {
            // Session expired or missing - rely on middleware/redirect
            // But if we are here, we might need to refresh session?
            // For now, let's just handle the data
            router.push("/login");
            return;
          }

          const data = await response.json();

          if (!data.onboardingCompleted) {
            router.push("/onboarding");
            return;
          }

          setUser(currentUser);
          setLoading(false);
        } catch (error) {
          console.error("Error checking onboarding:", error);
          setUser(currentUser);
          setLoading(false);
        }
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  // Get user's first name or fallback to email
  const displayName =
    user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "User";

  return (
    <div className={styles.dashboardContainer}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <img src="/logo.png" alt="ReviseIt" width="32" height="32" />
            <span className={styles.logoText}>ReviseIt</span>
          </div>
          <div className={styles.userSection}>
            <div className={styles.userInfo}>
              <span className={styles.userName}>
                {user?.displayName || displayName}
              </span>
              <span className={styles.userEmail}>{user?.email}</span>
            </div>
            {/* Profile Dropdown */}
            <div
              className={styles.profileDropdownContainer}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              {/* Force initials even if photoURL exists */}
              <div className={styles.userAvatarPlaceholder}>
                {(() => {
                  const nameSource = user?.displayName || user?.email || "User";
                  return nameSource.substring(0, 2).toUpperCase();
                })()}
              </div>

              {isDropdownOpen && (
                <div
                  className={styles.dropdownMenu}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className={styles.dropdownItem}
                    onClick={() => router.push("/settings")}
                  >
                    <span>⚙️</span> Settings
                  </button>
                  <div className={styles.dropdownDivider} />
                  <button
                    className={styles.dropdownItem}
                    onClick={handleLogout}
                  >
                    <span>🚪</span> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.mainContent}>
        {/* Welcome Section */}
        <section className={styles.welcomeSection}>
          <h1 className={styles.welcomeTitle}>
            Welcome back, {displayName}! 👋
          </h1>
          <p className={styles.welcomeSubtitle}>
            Here's what's happening with your WhatsApp automation
          </p>
        </section>

        {/* Stats Cards */}
        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>📨</div>
            <div className={styles.statContent}>
              <p className={styles.statLabel}>Messages Sent</p>
              <h3 className={styles.statValue}>2,456</h3>
              <p className={styles.statChange}>
                <span className={styles.positive}>+12.5%</span> from last month
              </p>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>🤖</div>
            <div className={styles.statContent}>
              <p className={styles.statLabel}>AI Responses</p>
              <h3 className={styles.statValue}>1,999</h3>
              <p className={styles.statChange}>
                <span className={styles.positive}>+18.2%</span> from last month
              </p>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>💬</div>
            <div className={styles.statContent}>
              <p className={styles.statLabel}>Active Conversations</p>
              <h3 className={styles.statValue}>24</h3>
              <p className={styles.statChange}>
                <span className={styles.neutral}>6 new today</span>
              </p>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>🎯</div>
            <div className={styles.statContent}>
              <p className={styles.statLabel}>Leads Captured</p>
              <h3 className={styles.statValue}>156</h3>
              <p className={styles.statChange}>
                <span className={styles.positive}>+23.8%</span> from last month
              </p>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className={styles.quickActions}>
          <h2 className={styles.sectionTitle}>Quick Actions</h2>
          <div className={styles.actionsGrid}>
            <button className={styles.actionCard}>
              <div className={styles.actionIcon}>📢</div>
              <h3 className={styles.actionTitle}>Create Campaigndf</h3>
              <p className={styles.actionDescription}>
                Send broadcast messages
              </p>
            </button>

            <button className={styles.actionCard}>
              <div className={styles.actionIcon}>📊</div>
              <h3 className={styles.actionTitle}>View Analytics</h3>
              <p className={styles.actionDescription}>
                Track performance metrics
              </p>
            </button>

            <button className={styles.actionCard}>
              <div className={styles.actionIcon}>👥</div>
              <h3 className={styles.actionTitle}>Manage Contacts</h3>
              <p className={styles.actionDescription}>Organize your audience</p>
            </button>

            <button
              className={styles.actionCard}
              onClick={() => router.push("/settings")}
            >
              <div className={styles.actionIcon}>⚙️</div>
              <h3 className={styles.actionTitle}>Settings</h3>
              <p className={styles.actionDescription}>Configure your bot</p>
            </button>

            <button className={styles.actionCard}>
              <div className={styles.actionIcon}>💳</div>
              <h3 className={styles.actionTitle}>Billing</h3>
              <p className={styles.actionDescription}>Manage subscription</p>
            </button>

            <button className={styles.actionCard}>
              <div className={styles.actionIcon}>🤖</div>
              <h3 className={styles.actionTitle}>Train AI</h3>
              <p className={styles.actionDescription}>Add FAQs & responses</p>
            </button>
          </div>
        </section>

        {/* Recent Activity */}
        <section className={styles.recentActivity}>
          <h2 className={styles.sectionTitle}>Recent Activity</h2>
          <div className={styles.activityList}>
            <div className={styles.activityItem}>
              <div className={styles.activityIconWrapper}>
                <span className={styles.activityDot}>🟢</span>
              </div>
              <div className={styles.activityContent}>
                <p className={styles.activityTitle}>New conversation started</p>
                <p className={styles.activityDetail}>
                  Customer: +91 98765 43210
                </p>
                <p className={styles.activityTime}>2 minutes ago</p>
              </div>
            </div>

            <div className={styles.activityItem}>
              <div className={styles.activityIconWrapper}>
                <span className={styles.activityDot}>💬</span>
              </div>
              <div className={styles.activityContent}>
                <p className={styles.activityTitle}>
                  AI responded to customer query
                </p>
                <p className={styles.activityDetail}>
                  "What are your business hours?"
                </p>
                <p className={styles.activityTime}>5 minutes ago</p>
              </div>
            </div>

            <div className={styles.activityItem}>
              <div className={styles.activityIconWrapper}>
                <span className={styles.activityDot}>✅</span>
              </div>
              <div className={styles.activityContent}>
                <p className={styles.activityTitle}>
                  Campaign sent successfully
                </p>
                <p className={styles.activityDetail}>
                  Weekend Sale - 250 contacts
                </p>
                <p className={styles.activityTime}>1 hour ago</p>
              </div>
            </div>

            <div className={styles.activityItem}>
              <div className={styles.activityIconWrapper}>
                <span className={styles.activityDot}>🎯</span>
              </div>
              <div className={styles.activityContent}>
                <p className={styles.activityTitle}>New lead captured</p>
                <p className={styles.activityDetail}>Contact: Rajesh Kumar</p>
                <p className={styles.activityTime}>3 hours ago</p>
              </div>
            </div>

            <div className={styles.activityItem}>
              <div className={styles.activityIconWrapper}>
                <span className={styles.activityDot}>📊</span>
              </div>
              <div className={styles.activityContent}>
                <p className={styles.activityTitle}>Weekly report generated</p>
                <p className={styles.activityDetail}>
                  View insights and trends
                </p>
                <p className={styles.activityTime}>1 day ago</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
