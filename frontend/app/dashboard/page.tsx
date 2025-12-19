"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import SpaceshipLoader from "@/app/components/loading/SpaceshipLoader";
import DashboardSidebar from "./components/DashboardSidebar";
import AnalyticsView from "./components/AnalyticsView";
import MessagesView from "./components/MessagesView";
import TemplatesView from "./components/TemplatesView";
import ContactsView from "./components/ContactsView";
import CampaignsView from "./components/CampaignsView";
import styles from "./dashboard.module.css";

type Section =
  | "analytics"
  | "messages"
  | "templates"
  | "contacts"
  | "campaigns"
  | "settings";

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("analytics");
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
        try {
          const response = await fetch("/api/onboarding/check");

          if (response.status === 401) {
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
    return <SpaceshipLoader text="Loading dashboard..." />;
  }

  const renderContent = () => {
    switch (activeSection) {
      case "analytics":
        return <AnalyticsView />;
      case "messages":
        return <MessagesView />;
      case "templates":
        return <TemplatesView />;
      case "contacts":
        return <ContactsView />;
      case "campaigns":
        return <CampaignsView />;
      case "settings":
        return (
          <div className={styles.settingsView}>
            <h1 className={styles.viewTitle}>Settings</h1>
            <p className={styles.viewSubtitle}>
              Manage your account and preferences
            </p>
            {/* Settings content will be added here */}
          </div>
        );
      default:
        return <AnalyticsView />;
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      <DashboardSidebar
        activeSection={activeSection}
        onSectionChange={(section) => setActiveSection(section as Section)}
        userEmail={user?.email || undefined}
        userName={user?.displayName || undefined}
      />
      <main className={styles.mainContent}>{renderContent()}</main>
    </div>
  );
}
